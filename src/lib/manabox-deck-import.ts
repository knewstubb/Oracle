/**
 * ManaBox deck import — one deck per file (D-044, D-046).
 *
 * Every row is a list of copies (CSV and text alike). Each copy has a resolved
 * type: Original and Proxy create a brand-new `user_copies` row sleeved into the
 * deck, with that copy's own finish, language and condition; Unsleeved creates a
 * planned slot only (the card is "not in the deck", owned or not), remembering
 * the finish as `requested_finish` (D-041) and creating or linking no copy
 * (D-047). Basic lands with no printing named ("11 Plains") become generic, untracked slots
 * (D-048, Round 13); a basic naming a printing is an ordinary card. The "Generic basics"
 * toggle is display only and has no effect here.
 * Existing owned copies are never pulled in.
 *
 * Contract: docs/oracle/contracts/import-row-editing.md §5-§7, §10.
 *
 * Deploy order: the per-copy keys are read by the migration
 * 20261020120000_deck_import_per_copy_attributes.sql. An older database function
 * would silently ignore them, which is why a read-back test exists.
 */

import { createAdminClient } from '@/lib/supabase'
import type { Json } from '@/types/supabase'
import { assertAtomicRpcCount, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'
import { isBasicLand, isGenericBasic, getBasicLandDefaultScryfallId, pickGenericArt, resolveGenericSleeved } from '@/lib/basic-lands'
import { deriveDefaultCategory } from '@/lib/card-definition-resolver'
import { createVersionSnapshot } from '@/lib/deck-versions'
import type { NormalizedCard, NormalizedDeck } from '@/lib/deck-normalizer'
import {
  ImportValidationError,
  applyEditsToRow,
  mapScryfallFinishes,
  resolveCopy,
  toDeckRpcRow,
  validateCopyFileValues,
  validateImportInput,
  validateRowFinishes,
  type ImportCopy,
  type ImportCopyEdits,
  type ImportDefaults,
  type ImportFinish,
  type ImportRow,
} from '@/lib/import-copies'
import { effectiveCopyState, planImport, stripIntentFields, summariseImportPlan } from '@/lib/import-intent'
import { loadOwnershipFacts } from '@/lib/import-ownership'
import {
  NeedsChoiceError,
  buildIntentSummary,
  isIntentRpcMissing,
  needsChoiceRowKeys,
  planToIntentRpcRow,
  validateIntentEdits,
  type IntentRowOrigin,
} from '@/lib/import-intent-save'
import type {
  CopyPlan,
  DeckImportIntentSummary,
  ImportIntent,
  IntentCopyEdits,
  OwnershipRequest,
  OwnershipResponse,
} from '../../docs/oracle/contracts/import-intent.types'
import type { DeckImportRpcRow } from '../../docs/oracle/contracts/import-row-editing.types'
import type {
  ManaBoxDeckImportSummary,
  ManaBoxUnmatchedLine,
} from '../../docs/oracle/contracts/manabox-import.types'

export interface ManaBoxDeckCard extends NormalizedCard {
  /** Immutable row key from the preview (printing|finish, or printing|text). */
  rowKey?: string
  /** One entry per copy; length must equal `quantity`. Holds the file's values. */
  copies?: ImportCopy[]
  /** False when the source line named no printing ("11 Plains"); a basic then becomes a generic slot (D-048, Round 13). */
  printingGiven?: boolean
  /** 1-based source index of the combined row. */
  sourceIndex?: number
}

/** The slice of the Supabase client this module uses (lets tests inject a fake). */
export type DeckImportClient = Pick<ReturnType<typeof createAdminClient>, 'from' | 'rpc'>

export interface ManaBoxDeckImportOptions {
  deck: NormalizedDeck
  name: string
  format?: string
  defaults: ImportDefaults
  /** Owner edits: rowKey -> copy index -> fields. Holds no database ids. */
  copyEdits?: ImportCopyEdits
  /** Always the signed-in user's id. */
  userId: string
  /** Owner-chosen art for generic rows: rowKey -> printing (image only; any printing of that basic). */
  genericArt?: Record<string, { scryfallId: string }>
  /** Injected random source for the default art (tests). */
  random?: () => number
  unmatched?: ManaBoxUnmatchedLine[]
  supabase?: DeckImportClient
  /**
   * Intent-aware save (contract import-intent §5). When set, `copyEdits` may also carry add/move/printing,
   * ownership is recomputed here, and the write goes through `import_deck_with_intent` (draft M2, not applied yet).
   */
  intent?: ImportIntent
  /** Reads ownership facts for the plan (tests inject a fake). Defaults to the real, read-only loader. */
  loadOwnership?: (request: OwnershipRequest) => Promise<OwnershipResponse>
}

/** One deck per file — a fresh numeric id for each import. */
const MAX_DECK_ID_ATTEMPTS = 5

function generateDeckId(): number {
  return (Date.now() % 2_000_000_000) + Math.floor(Math.random() * 1_000_000)
}

interface PrintingFacts {
  oracleId: string
  typeLine: string | null
  finishes: ImportFinish[] | null
}

/**
 * Execute a ManaBox deck import. Creates exactly one deck and writes every
 * slot through a single atomic RPC. Throws `ImportValidationError` (nothing
 * written) when the request is not acceptable.
 */
export async function importManaBoxDeck(
  options: ManaBoxDeckImportOptions
): Promise<ManaBoxDeckImportSummary> {
  const supabase = options.supabase ?? createAdminClient()
  const intent = options.intent
  // Intent edits carry add/move/printing; the older validation and resolution only understand the rest.
  const intentEdits = (options.copyEdits ?? {}) as IntentCopyEdits
  const copyEdits = intent ? stripIntentFields(intentEdits) : options.copyEdits
  const deckFormat = options.format || 'commander'
  const cards = options.deck.cards as ManaBoxDeckCard[]
  // Round 13: a basic is generic only when its line named no printing. The "Generic basics"
  // display toggle has no effect on imports.
  const isGeneric = (card: ManaBoxDeckCard) => isGenericBasic(card.cardName, card.printingGiven ?? true)

  // 0. Validate the request shape before anything is written.
  const problems: string[] = []
  const rowsForValidation = cards.map((card, position) => {
    const rowKey = card.rowKey ?? ''
    if (!card.rowKey || !card.copies) problems.push(`card ${position + 1}: rowKey and copies are required`)
    else problems.push(...validateCopyFileValues(rowKey, card.copies))
    return { rowKey, qty: card.quantity, copies: card.copies }
  })
  const seenKeys = new Set<string>()
  for (const row of rowsForValidation) {
    if (seenKeys.has(row.rowKey)) problems.push(`duplicate row ${row.rowKey}`)
    seenKeys.add(row.rowKey)
  }
  problems.push(
    ...validateImportInput(rowsForValidation, options.defaults, copyEdits, {
      allowUnsleeved: true,
      requireCopies: true,
    })
  )
  if (intent) problems.push(...validateIntentEdits(intent, intentEdits, rowsForValidation))
  if (problems.length > 0) throw new ImportValidationError(problems)

  // 1. Read each printing once: type line (categories), oracle id (pair check) and
  //    Scryfall's finish list. The list is recomputed here, never trusted from the client.
  const scryfallIds = [...new Set(cards.map((c) => c.scryfallId).filter(Boolean))]
  const printingById = new Map<string, PrintingFacts>()
  for (let i = 0; i < scryfallIds.length; i += 200) {
    const batch = scryfallIds.slice(i, i + 200)
    const { data, error } = await supabase
      .from('ref_printings')
      .select('scryfall_id, oracle_id, type_line, finishes')
      .in('scryfall_id', batch)
    if (error) throw new Error(`Failed to read printings: ${error.message}`)
    for (const row of data ?? []) {
      printingById.set(row.scryfall_id, {
        oracleId: row.oracle_id,
        typeLine: row.type_line,
        finishes: mapScryfallFinishes(row.finishes),
      })
    }
  }

  // Every real card's printing/oracle pair must exist in ref_printings (contract §10).
  const pairProblems: string[] = []
  for (const card of cards) {
    if (isGeneric(card)) continue
    const facts = printingById.get(card.scryfallId)
    if (!facts || facts.oracleId !== card.oracleId) {
      pairProblems.push(`"${card.cardName}": printing and card identity do not match a known printing`)
    }
  }
  if (pairProblems.length > 0) throw new ImportValidationError(pairProblems)

  // Resolve every copy (owner edit, then file, then defaults) and check finishes.
  const resolvedByCard = cards.map((card) => {
    const row: ImportRow = {
      rowKey: card.rowKey as string,
      sourceIndex: card.sourceIndex ?? 0,
      sourceLines: [],
      cardName: card.cardName,
      setCode: card.setCode,
      collectorNumber: card.collectorNumber ?? '',
      scryfallId: card.scryfallId,
      oracleId: card.oracleId,
      qty: card.quantity,
      availableFinishes: printingById.get(card.scryfallId)?.finishes ?? null,
      // The client sends file values only; owner edits arrive separately (never trusted here).
      copies: (card.copies as ImportCopy[]).map((copy) => ({ ...copy, owner: {} })),
      isBasicLand: isBasicLand(card.cardName),
      printingGiven: card.printingGiven,
    }
    const edited = applyEditsToRow(row, copyEdits)
    return {
      card,
      row,
      resolved: edited.copies.map((copy) => resolveCopy(copy, options.defaults, row.availableFinishes)),
    }
  })
  const finishCheck = validateRowFinishes(
    resolvedByCard.map(({ row, resolved }) => ({
      rowKey: row.rowKey,
      availableFinishes: row.availableFinishes,
      resolved,
    }))
  )
  if (finishCheck.problems.length > 0) throw new ImportValidationError(finishCheck.problems)

  // 1b. Intent save: recompute ownership here (the client's plan is advisory) and plan every copy.
  //     A plan that still needs an owner choice is refused before anything is written.
  let plans: CopyPlan[] = []
  const ownershipFailedCopies = new Set<string>()
  if (intent) {
    const rows = resolvedByCard.map(({ row }) => row)
    const request: OwnershipRequest = {
      cards: rows
        .filter((r) => !isGenericBasic(r.cardName, r.printingGiven ?? true))
        .map((r) => ({ rowKey: r.rowKey, oracleId: r.oracleId, printingId: r.scryfallId, qty: r.qty })),
    }
    let facts: OwnershipResponse['rows'] = []
    const needsFacts = intent !== 'purchased' || Object.values(intentEdits).some((c) => Object.values(c).some((e) => e.add === false))
    if (needsFacts && request.cards.length > 0) {
      try {
        const load = options.loadOwnership ?? ((r: OwnershipRequest) => loadOwnershipFacts(createAdminClient(), options.userId, r))
        const answer = await load(request)
        if (!answer || !Array.isArray(answer.rows)) throw new Error('malformed ownership answer')
        facts = answer.rows
      } catch (err) {
        // Contract §5: not an error. Everything that would have used an owned copy is saved Unowned and listed.
        console.error(`[decks/import] ownership unavailable: ${err instanceof Error ? err.message : String(err)}`)
        facts = []
        ownershipFailedCopies.add('*')
      }
    }
    plans = planImport({ rows, facts, edits: intentEdits, intent, defaults: options.defaults })
    const blocked = needsChoiceRowKeys(plans)
    if (blocked.length > 0) throw new NeedsChoiceError(blocked)
    // Generic basics follow the plan (the intent's default is Unsleeved for planned decks).
    for (const entry of resolvedByCard) {
      if (!isGeneric(entry.card)) continue
      entry.resolved.forEach((copy, i) => {
        const gp = plans.find((p) => p.rowKey === entry.card.rowKey && p.copyIndex === i)
        if (gp) (copy as { type: string }).type = gp.type === 'unsleeved' ? 'unsleeved' : 'original'
      })
    }
  }
  const planByCopy = new Map(plans.map((p) => [`${p.rowKey}\u0000${p.copyIndex}`, p]))

  // 2. Create the deck row (commander chosen after import, D-046/D-052).
  // A plain insert, never an upsert: if the random id is already taken the
  // insert fails (23505) and we try a new id, so an existing deck is never
  // overwritten. No migration needed.
  const deckRow = {
    name: options.name || options.deck.name,
    commander_name: null,
    commander_scryfall_id: null,
    commander_id: null,
    colour_identity: options.deck.colourIdentity,
    card_count: options.deck.cardCount,
    is_active: false,
    format: deckFormat,
    source_url: '',
    source_platform: 'manabox',
    user_id: options.userId,
  }
  let deckId = 0
  for (let attempt = 0; attempt < MAX_DECK_ID_ATTEMPTS; attempt++) {
    const candidate = generateDeckId()
    const { error: deckErr } = await supabase.from('decks').insert({ id: candidate, ...deckRow })
    if (!deckErr) {
      deckId = candidate
      break
    }
    if (deckErr.code !== '23505') {
      throw new Error(`Failed to create deck ${candidate}: ${deckErr.message}`)
    }
  }
  if (!deckId) throw new Error('Failed to create deck: could not find a free deck id')

  // 3. Upsert user_cards for every tracked (non-generic-basic) row.
  const uniqueCards = new Map<string, string>()
  for (const card of cards) {
    if (isGeneric(card)) continue
    if (card.oracleId && !uniqueCards.has(card.oracleId)) {
      uniqueCards.set(card.oracleId, card.cardName)
    }
  }

  const cardIdByOracle = new Map<string, number>()
  if (uniqueCards.size > 0) {
    const rows = [...uniqueCards.entries()].map(([oracleId, cardName]) => ({
      oracle_id: oracleId,
      card_name: cardName,
      user_id: options.userId,
    }))
    const { data, error } = await supabase
      .from('user_cards')
      .upsert(rows, { onConflict: 'oracle_id,user_id' })
      .select('id, oracle_id')
    if (error) {
      throw new Error(`Failed to upsert user cards: ${error.message}`)
    }
    for (const row of data ?? []) {
      cardIdByOracle.set(row.oracle_id, row.id)
    }
  }

  // 4. Build the atomic insert payload.
  const insertRows: Array<DeckImportRpcRow & { action?: string; row_index?: number }> = []
  const origins: IntentRowOrigin[] = []
  const unavailable: IntentRowOrigin[] = []
  let assigned = 0
  let shortfall = 0

  // Generic lines: one stored art and one all-or-nothing sleeved state per basic type.
  // Unsleeved wins when one import mixes states for a type (contract §3A).
  const genericLines = await planGenericLines({
    supabase,
    userId: options.userId,
    cards,
    resolvedByCard,
    isGeneric,
    genericArt: options.genericArt,
    random: options.random,
  })
  const mixedGenericTypes = [...genericLines.entries()]
    .filter(([, line]) => line.mixed)
    .map(([name]) => name)

  for (const { card, resolved } of resolvedByCard) {
    const typeLine = printingById.get(card.scryfallId)?.typeLine ?? card.typeLine ?? ''
    const categories = JSON.stringify([deriveDefaultCategory(typeLine)])
    const printingId = card.scryfallId || getBasicLandDefaultScryfallId(card.cardName) || null

    if (isGeneric(card)) {
      // Generic basics create no copies (contract generic-basic-lands §3). A planned slot with
      // the explicit is_generic flag. Sleeved/Unsleeved is all-or-nothing per basic type
      // (Unsleeved wins), finish and language are kept, the art is the stored, image-only pick.
      const art = genericLines.get(card.cardName)
      for (const [copyIdx, copy] of resolved.entries()) {
        origins.push({ rowKey: card.rowKey as string, copyIndex: copyIdx, cardName: card.cardName })
        insertRows.push({
          ...(intent ? { action: 'generic', row_index: insertRows.length } : {}),
          card_id: null,
          card_name: card.cardName,
          printing_id: art?.scryfallId ?? printingId,
          scryfall_id: art?.scryfallId ?? printingId,
          set_code: art?.setCode ?? card.setCode,
          categories,
          is_commander: false,
          is_proxy: false,
          is_maybeboard: false,
          is_generic: true,
          generic_sleeved: art?.sleeved ?? true,
          finish: copy.sources.finish === 'default' ? null : copy.finish,
          ...(copy.sources.language === 'default' ? {} : { language: copy.language }),
        })
      }
      continue
    }

    const cardId = cardIdByOracle.get(card.oracleId) ?? null
    if (!cardId) {
      throw new Error(`Missing card identity for "${card.cardName}"`)
    }

    for (const [copyIdx, copy] of resolved.entries()) {
      const context = {
        cardId,
        cardName: card.cardName,
        scryfallId: card.scryfallId,
        setCode: card.setCode,
        categories,
      }
      const origin = { rowKey: card.rowKey as string, copyIndex: copyIdx, cardName: card.cardName }
      origins.push(origin)
      const plan = intent ? planByCopy.get(`${origin.rowKey}\u0000${copyIdx}`) : undefined
      if (intent) {
        if (!plan) throw new Error(`No plan for ${card.cardName} copy ${copyIdx}`)
        insertRows.push(planToIntentRpcRow(plan, copy, context, insertRows.length))
        if (plan.kind === 'owned_unsleeved' || plan.kind === 'unowned') shortfall++
        else assigned++
        if (ownershipFailedCopies.has('*') && plan.kind === 'unowned') {
          const st = effectiveCopyState(
            (card.copies as ImportCopy[])[copyIdx],
            { rowKey: origin.rowKey, availableFinishes: printingById.get(card.scryfallId)?.finishes ?? null },
            intent,
            intentEdits,
            options.defaults
          )
          if (!st.add && st.type !== 'unsleeved') unavailable.push(origin)
        }
        continue
      }
      insertRows.push(toDeckRpcRow(copy, context))
      if (copy.type === 'unsleeved') shortfall++
      else assigned++
    }
  }

  // 5. One atomic write: new copies + linked slots + planned slots.
  if (intent) {
    // Draft M2 (not applied until the Architect has reviewed it). If it is missing, nothing is saved and the
    // empty deck we just created is removed again (we made it a moment ago; the id and owner both must match).
    // The generated database types do not list the new function yet, hence the narrow cast.
    const rpc = await (
      supabase as unknown as {
        rpc: (name: string, args: unknown) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>
      }
    ).rpc('import_deck_with_intent', {
      p_deck_id: deckId,
      p_user_id: options.userId,
      p_rows: insertRows as unknown as Json,
    })
    if (rpc.error) {
      await supabase.from('decks').delete().eq('id', deckId).eq('user_id', options.userId)
      if (isIntentRpcMissing(rpc.error)) {
        throw new Error('The intent import function is not installed in the database yet (migration M2 is awaiting review).')
      }
      throw new Error(`Failed to write deck cards atomically: ${rpc.error.message}`)
    }
    const intentResult = assertAtomicRpcSuccess(rpc.data, 'import_deck_with_intent')
    assertAtomicRpcCount(intentResult, 'inserted_count', 'import_deck_with_intent', insertRows.length)

    await createVersionSnapshot(deckId, options.userId, 'import', 'Imported from ManaBox', options.name || options.deck.name)

    const intentSummary = buildIntentSummary(deckId, summariseImportPlan(plans), intentResult, origins)
    for (const origin of unavailable) {
      intentSummary.needsALook.push({ ...origin, reason: 'ownership_unavailable' })
    }
    return {
      deckId,
      allocationSummary: { assigned, shortfall, errors: [], unmatched: options.unmatched ?? [] },
      unlistedFinish: finishCheck.unlistedFinish,
      genericNotes: mixedGenericTypes.map(
        (name) => `Some ${name} lines were Unsleeved, so all ${name} generics in this deck are Unsleeved.`
      ),
      intentSummary,
    }
  }

  const { data, error } = await supabase.rpc('replace_deck_with_new_cards', {
    p_deck_id: deckId,
    p_user_id: options.userId,
    p_rows: insertRows as unknown as Json,
  })

  if (error) {
    throw new Error(`Failed to write deck cards atomically: ${error.message}`)
  }

  const result = assertAtomicRpcSuccess(data, 'replace_deck_with_new_cards')
  assertAtomicRpcCount(
    result,
    'inserted_count',
    'replace_deck_with_new_cards',
    insertRows.length
  )

  // 6. Snapshot the imported version.
  await createVersionSnapshot(
    deckId,
    options.userId,
    'import',
    'Imported from ManaBox',
    options.name || options.deck.name
  )

  return {
    deckId,
    allocationSummary: {
      assigned,
      shortfall,
      errors: [],
      unmatched: options.unmatched ?? [],
    },
    unlistedFinish: finishCheck.unlistedFinish,
    genericNotes: mixedGenericTypes.map(
      (name) => `Some ${name} lines were Unsleeved, so all ${name} generics in this deck are Unsleeved.`
    ),
  }
}

interface GenericLine {
  scryfallId: string | null
  setCode: string
  sleeved: boolean
  /** True when the import mixed Sleeved and Unsleeved lines for this type. */
  mixed: boolean
}

/** Decide art and sleeved state for each generic basic type in the import. */
async function planGenericLines(args: {
  supabase: DeckImportClient
  userId: string
  cards: ManaBoxDeckCard[]
  resolvedByCard: Array<{ card: ManaBoxDeckCard; resolved: Array<{ type: string }> }>
  isGeneric: (card: ManaBoxDeckCard) => boolean
  genericArt?: Record<string, { scryfallId: string }>
  random?: () => number
}): Promise<Map<string, GenericLine>> {
  const { supabase, userId, resolvedByCard, isGeneric } = args
  const lines = new Map<string, GenericLine>()
  const states = new Map<string, boolean[]>()
  const overrides = new Map<string, string>()

  for (const { card, resolved } of resolvedByCard) {
    if (!isGeneric(card)) continue
    const list = states.get(card.cardName) ?? []
    for (const copy of resolved) list.push(copy.type !== 'unsleeved')
    states.set(card.cardName, list)
    const picked = card.rowKey ? args.genericArt?.[card.rowKey]?.scryfallId : undefined
    if (picked && !overrides.has(card.cardName)) overrides.set(card.cardName, picked)
  }
  if (states.size === 0) return lines

  // Owned printings per basic (best effort: any failure falls back to the default art).
  const owned = new Map<string, string[]>()
  try {
    const { data } = await supabase
      .from('user_copies')
      .select('printing_id, user_cards!inner(card_name)')
      .eq('user_id', userId)
      .in('user_cards.card_name', [...states.keys()])
    for (const row of (data ?? []) as unknown as Array<{ printing_id: string | null; user_cards: { card_name: string } }>) {
      if (!row.printing_id) continue
      const list = owned.get(row.user_cards.card_name) ?? []
      list.push(row.printing_id)
      owned.set(row.user_cards.card_name, list)
    }
  } catch {
    owned.clear()
  }

  const artFor = new Map<string, string | undefined>()
  for (const name of states.keys()) {
    const card = args.cards.find((c) => c.cardName === name && isGeneric(c))
    artFor.set(
      name,
      overrides.get(name) ??
        pickGenericArt(name, owned.get(name) ?? [], args.random) ??
        (card?.scryfallId || undefined)
    )
  }

  // Set code and name check for every chosen printing.
  const ids = [...new Set([...artFor.values()].filter((v): v is string => Boolean(v)))]
  const refById = new Map<string, { name?: string; set_code?: string }>()
  if (ids.length > 0) {
    const { data, error } = await supabase
      .from('ref_printings')
      .select('scryfall_id, name, set_code')
      .in('scryfall_id', ids)
    if (error) throw new Error(`Failed to read art printings: ${error.message}`)
    for (const row of (data ?? []) as Array<{ scryfall_id: string; name?: string; set_code?: string }>) {
      refById.set(row.scryfall_id, row)
    }
  }

  const problems: string[] = []
  for (const [name, list] of states) {
    const scryfallId = artFor.get(name) ?? null
    const ref = scryfallId ? refById.get(scryfallId) : undefined
    if (overrides.has(name) && (!ref || ref.name !== name)) {
      problems.push(`"${name}": the chosen art is not a printing of that basic`)
    }
    lines.set(name, {
      scryfallId,
      setCode: ref?.set_code ?? '',
      sleeved: resolveGenericSleeved(list),
      mixed: list.some((s) => s) && list.some((s) => !s),
    })
  }
  if (problems.length > 0) throw new ImportValidationError(problems)
  return lines
}
