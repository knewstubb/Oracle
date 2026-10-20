/**
 * ManaBox deck import — one deck per file (D-044, D-046).
 *
 * Every row is a list of copies (CSV and text alike). Each copy has a resolved
 * type: Original and Proxy create a brand-new `user_copies` row sleeved into the
 * deck, with that copy's own finish, language and condition; Unsleeved creates a
 * planned slot only (the card is "not in the deck", owned or not), remembering
 * the finish as `requested_finish` (D-041) and creating or linking no copy
 * (D-047). Basic lands can be converted to generic, untracked slots (D-048).
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
import { isBasicLand, getBasicLandDefaultScryfallId } from '@/lib/basic-lands'
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
  /** True when the slot should become a generic basic land (D-048). */
  isGenericBasicLand?: boolean
  /** 1-based source index of the combined row. */
  sourceIndex?: number
}

/** The slice of the Supabase client this module uses (lets tests inject a fake). */
export type DeckImportClient = Pick<ReturnType<typeof createAdminClient>, 'from' | 'rpc'>

export interface ManaBoxDeckImportOptions {
  deck: NormalizedDeck
  name: string
  format?: string
  /** Convert basic lands to generic, untracked slots. Default true (D-048). */
  convertBasicLandsToGeneric?: boolean
  defaults: ImportDefaults
  /** Owner edits: rowKey -> copy index -> fields. Holds no database ids. */
  copyEdits?: ImportCopyEdits
  /** Always the signed-in user's id. */
  userId: string
  unmatched?: ManaBoxUnmatchedLine[]
  supabase?: DeckImportClient
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
  const deckFormat = options.format || 'commander'
  const convertBasics = options.convertBasicLandsToGeneric ?? true

  const cards = options.deck.cards as ManaBoxDeckCard[]

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
    ...validateImportInput(rowsForValidation, options.defaults, options.copyEdits, {
      allowUnsleeved: true,
      requireCopies: true,
    })
  )
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

  const isGenericBasic = (card: ManaBoxDeckCard) => convertBasics && isBasicLand(card.cardName)

  // Every tracked card's printing/oracle pair must exist in ref_printings (contract §10).
  const pairProblems: string[] = []
  for (const card of cards) {
    if (isGenericBasic(card)) continue
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
    }
    const edited = applyEditsToRow(row, options.copyEdits)
    return {
      card,
      row,
      resolved: edited.copies.map((copy) => resolveCopy(copy, options.defaults, row.availableFinishes)),
    }
  })
  const finishCheck = validateRowFinishes(
    resolvedByCard
      .filter(({ card }) => !isGenericBasic(card))
      .map(({ row, resolved }) => ({
        rowKey: row.rowKey,
        availableFinishes: row.availableFinishes,
        resolved,
      }))
  )
  if (finishCheck.problems.length > 0) throw new ImportValidationError(finishCheck.problems)

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
    if (isGenericBasic(card)) continue
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
  const insertRows: DeckImportRpcRow[] = []
  let assigned = 0
  let shortfall = 0

  for (const { card, resolved } of resolvedByCard) {
    const typeLine = printingById.get(card.scryfallId)?.typeLine ?? card.typeLine ?? ''
    const categories = JSON.stringify([deriveDefaultCategory(typeLine)])
    const printingId = card.scryfallId || getBasicLandDefaultScryfallId(card.cardName) || null

    if (isGenericBasic(card)) {
      // Generic basics create no copies and ignore edits: planned slots only
      // (D-048). `is_maybeboard` is the RPC's "planned, no copy" flag.
      for (let i = 0; i < card.quantity; i++) {
        insertRows.push({
          card_id: null,
          card_name: card.cardName,
          printing_id: printingId,
          scryfall_id: printingId,
          set_code: card.setCode,
          categories,
          is_commander: false,
          is_proxy: false,
          is_maybeboard: true,
          // Generic basics carry no attributes (contract section 6): no finish, so no requested finish is stored.
          finish: null,
        })
      }
      continue
    }

    const cardId = cardIdByOracle.get(card.oracleId) ?? null
    if (!cardId) {
      throw new Error(`Missing card identity for "${card.cardName}"`)
    }

    for (const copy of resolved) {
      insertRows.push(
        toDeckRpcRow(copy, {
          cardId,
          cardName: card.cardName,
          scryfallId: card.scryfallId,
          setCode: card.setCode,
          categories,
        })
      )
      if (copy.type === 'unsleeved') shortfall++
      else assigned++
    }
  }

  // 5. One atomic write: new copies + linked slots + planned slots.
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
  }
}
