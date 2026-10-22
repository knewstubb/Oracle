/**
 * Deck import INTENT: pure functions (no database, no network).
 *
 * Contract: docs/oracle/contracts/import-intent.md (§2-§4, §8). Types: import-intent.types.ts.
 * The browser and the server import this same module so the preview equals the save.
 *
 * Plain terms: the intent (bought / built / planned) only sets each card's STARTING state.
 * Given facts about what the owner already has, these functions work out what saving would
 * do with every physical copy, and the wording for the summary under the list.
 */

import type {
  ImportCopy,
  ImportCopyType,
  ImportDefaults,
  ImportFinish,
  ImportRow,
} from '../../docs/oracle/contracts/import-row-editing.types'
import type {
  CopyPlan,
  HeldCopyGroup,
  ImportIntent,
  ImportPlanSummary,
  IntentCopyEdits,
  IntentCopyOwnerEdits,
  OwnedCopyGroup,
  OwnershipRowFacts,
} from '../../docs/oracle/contracts/import-intent.types'
import type { ManaBoxPreviewResponse } from '../../docs/oracle/contracts/manabox-import.types'
import { isBasicLand, isGenericBasic } from '@/lib/basic-lands'
import { resolveCopy } from '@/lib/import-copies'
import type { NormalizedDeck } from '@/lib/deck-normalizer'

// ---------------------------------------------------------------------------
// Intent defaults (contract §2)
// ---------------------------------------------------------------------------

export interface IntentStartingState {
  /** "Add to collection" tick. */
  add: boolean
  /** Type every non-generic copy starts as. */
  type: ImportCopyType
  /** Generic basics: sleeved or not. */
  genericSleeved: boolean
}

export function defaultsForIntent(intent: ImportIntent): IntentStartingState {
  switch (intent) {
    case 'purchased':
      return { add: true, type: 'original', genericSleeved: true }
    case 'built':
      return { add: false, type: 'original', genericSleeved: true }
    case 'planned':
      return { add: false, type: 'unsleeved', genericSleeved: false }
  }
}

/** Is this review row a generic basic (a basic with no printing named)? Never matched, never added. */
export function isGenericImportRow(row: Pick<ImportRow, 'cardName' | 'printingGiven'>): boolean {
  return isGenericBasic(row.cardName, row.printingGiven ?? true)
}

export interface EffectiveCopyState {
  add: boolean
  type: ImportCopyType
  finish: ImportFinish
}

/** Owner's choice if any, else the intent's starting state. Pure. */
export function effectiveCopyState(
  copy: ImportCopy,
  row: Pick<ImportRow, 'rowKey' | 'availableFinishes'>,
  intent: ImportIntent,
  edits: IntentCopyEdits | undefined,
  defaults: ImportDefaults
): EffectiveCopyState {
  const e: IntentCopyOwnerEdits = edits?.[row.rowKey]?.[copy.index] ?? {}
  const start = defaultsForIntent(intent)
  let add = e.add ?? start.add
  // Choosing "Add this printing" implies Add.
  if (e.printing === 'add_this') add = true
  const type: ImportCopyType = e.type ?? copy.owner.type ?? start.type
  const owner = { ...copy.owner }
  if (e.finish !== undefined) owner.finish = e.finish
  const finish = resolveCopy({ ...copy, owner }, defaults, row.availableFinishes).finish
  return { add, type, finish }
}

// ---------------------------------------------------------------------------
// Matching owned copies (contract §3)
// ---------------------------------------------------------------------------

export interface OwnedPrintingInfo {
  printingId: string
  setCode: string
  collectorNumber: string
}

export interface HeldCandidate extends OwnedPrintingInfo {
  deckId: number
  deckName: string
}

export type CopySource =
  /** A free copy of the right printing (or the one the owner chose with "Use my..."). */
  | ({ kind: 'free'; isProxy: boolean; finish: ImportFinish } & OwnedPrintingInfo)
  /** Held in other deck(s). `chosen` is a deck id (move), 'skip', or undefined (needs a choice). */
  | {
      kind: 'held'
      candidates: HeldCandidate[]
      chosen: number | 'skip' | undefined
      isProxy: boolean
    }
  /** Another printing is owned; the owner has to choose. */
  | { kind: 'other_printing'; owned: OwnedPrintingInfo }
  | { kind: 'none' }

export interface CopyAllocation {
  source: CopySource
  canOriginal: boolean
  canProxy: boolean
  /** The owner has this card in some form (free or held). Used for Owned vs Unowned. */
  anyOwned: boolean
}

/** rowKey -> copy index -> allocation. Generic basics have no entry. */
export type OwnedAllocation = Record<string, Record<number, CopyAllocation>>

export interface AllocateInput {
  rows: ImportRow[]
  facts: OwnershipRowFacts[]
  edits?: IntentCopyEdits
  intent: ImportIntent
  defaults: ImportDefaults
}

interface PoolFree extends OwnedCopyGroup {
  left: number
}
interface PoolHeld extends HeldCopyGroup {
  left: number
}
interface PoolEntry {
  free: PoolFree[]
  held: PoolHeld[]
}

function buildPool(facts: OwnershipRowFacts[]): Map<string, PoolEntry> {
  const pool = new Map<string, PoolEntry>()
  for (const f of facts) {
    // Several rows may carry the same card; the endpoint batches by oracle id, so the first one wins.
    if (pool.has(f.oracleId)) continue
    pool.set(f.oracleId, {
      free: f.free.map((g) => ({ ...g, left: g.count })),
      held: f.held.map((g) => ({ ...g, left: g.count })),
    })
  }
  return pool
}

const byWanted = (finish: ImportFinish) => (a: OwnedCopyGroup, b: OwnedCopyGroup) =>
  Number(a.finish !== finish) - Number(b.finish !== finish) || Number(a.isProxy) - Number(b.isProxy)

function info(g: OwnedPrintingInfo): OwnedPrintingInfo {
  return { printingId: g.printingId, setCode: g.setCode, collectorNumber: g.collectorNumber }
}

/**
 * Decide, for every copy that needs an owned source, which owned copy it would use.
 * Rows run in `sourceIndex` order and copies in index order; one owned copy is used once
 * per import. Free copies are used before another deck is disturbed (contract §3).
 */
export function allocateOwnedCopies(input: AllocateInput): OwnedAllocation {
  const { rows, facts, edits, intent, defaults } = input
  const pool = buildPool(facts)
  const out: OwnedAllocation = {}
  const ordered = [...rows].sort((a, b) => a.sourceIndex - b.sourceIndex)

  for (const row of ordered) {
    if (isGenericImportRow(row)) continue
    const entry = pool.get(row.oracleId) ?? { free: [], held: [] }
    out[row.rowKey] = {}

    for (const copy of row.copies) {
      const st = effectiveCopyState(copy, row, intent, edits, defaults)
      const e = edits?.[row.rowKey]?.[copy.index] ?? {}
      const freeLeft = entry.free.filter((g) => g.left > 0)
      const heldLeft = entry.held.filter((g) => g.left > 0)
      const flags = {
        anyOwned: freeLeft.length > 0 || heldLeft.length > 0,
        canOriginal: st.add || freeLeft.length > 0 || heldLeft.length > 0,
        canProxy: st.add || freeLeft.some((g) => g.isProxy),
      }
      const needsSource = !st.add && st.type !== 'unsleeved'
      if (!needsSource) {
        out[row.rowKey][copy.index] = { source: { kind: 'none' }, ...flags }
        continue
      }
      const source = pickSource(entry, row, st, e)
      out[row.rowKey][copy.index] = { source, ...flags }
    }
  }
  return out
}

function pickSource(
  entry: PoolEntry,
  row: ImportRow,
  st: EffectiveCopyState,
  e: IntentCopyOwnerEdits
): CopySource {
  const proxyOnly = st.type === 'proxy'
  const mine = e.printing === 'use_mine'
  const free = entry.free.filter((g) => g.left > 0 && (!proxyOnly || g.isProxy)).sort(byWanted(st.finish))

  // 1-2. Free copies: exact printing first; another printing needs a choice.
  let pick = free.find((g) => g.printingId === row.scryfallId)
  if (!pick && free.length > 0) {
    if (mine) pick = free[0]
    else return { kind: 'other_printing', owned: info(free[0]) }
  }
  if (pick) {
    pick.left -= 1
    return { kind: 'free', ...info(pick), isProxy: pick.isProxy, finish: pick.finish }
  }
  if (proxyOnly) return { kind: 'none' }

  // 3-4. Held in other decks.
  const held = entry.held.filter((g) => g.left > 0).sort(byWanted(st.finish))
  let target = row.scryfallId
  let groups = held.filter((g) => g.printingId === target)
  if (groups.length === 0 && held.length > 0) {
    if (mine) {
      target = held[0].printingId
      groups = held.filter((g) => g.printingId === target)
    } else {
      return { kind: 'other_printing', owned: info(held[0]) }
    }
  }
  if (groups.length === 0) return { kind: 'none' }

  const decks = new Map<number, PoolHeld>()
  for (const g of groups) if (!decks.has(g.deckId)) decks.set(g.deckId, g)
  const candidates: HeldCandidate[] = [...decks.values()].map((g) => ({
    ...info(g),
    deckId: g.deckId,
    deckName: g.deckName,
  }))
  let chosen: number | 'skip' | undefined
  if (e.move?.kind === 'skip') chosen = 'skip'
  else if (e.move?.kind === 'move' && decks.has(e.move.fromDeckId)) chosen = e.move.fromDeckId
  else if (candidates.length === 1) chosen = candidates[0].deckId

  let isProxy = false
  if (typeof chosen === 'number') {
    const g = groups.find((x) => x.deckId === chosen)!
    g.left -= 1
    isProxy = g.isProxy
  }
  return { kind: 'held', candidates, chosen, isProxy }
}

// ---------------------------------------------------------------------------
// One copy's plan (contract §4)
// ---------------------------------------------------------------------------

export function resolveCopyPlan(
  copy: ImportCopy,
  row: ImportRow,
  intent: ImportIntent,
  edits: IntentCopyEdits | undefined,
  allocation: OwnedAllocation,
  defaults: ImportDefaults
): CopyPlan {
  const base = { rowKey: row.rowKey, copyIndex: copy.index, slotPrintingId: row.scryfallId }
  const e = edits?.[row.rowKey]?.[copy.index] ?? {}

  if (isGenericImportRow(row)) {
    const start = defaultsForIntent(intent)
    const sleeved = (e.type ?? (start.genericSleeved ? 'original' : 'unsleeved')) !== 'unsleeved'
    return {
      ...base,
      kind: 'generic',
      type: sleeved ? 'original' : 'unsleeved',
      genericSleeved: sleeved,
      canOriginal: true,
      canProxy: false,
    }
  }

  const st = effectiveCopyState(copy, row, intent, edits, defaults)
  const alloc: CopyAllocation = allocation[row.rowKey]?.[copy.index] ?? {
    source: { kind: 'none' },
    canOriginal: st.add,
    canProxy: st.add,
    anyOwned: false,
  }
  const flags = { canOriginal: alloc.canOriginal, canProxy: alloc.canProxy }

  if (st.add) {
    return st.type === 'unsleeved'
      ? { ...base, kind: 'add_unsleeved', type: 'unsleeved', ...flags }
      : { ...base, kind: 'add_sleeved', type: st.type, ...flags }
  }
  if (st.type === 'unsleeved') {
    return { ...base, kind: alloc.anyOwned ? 'owned_unsleeved' : 'unowned', type: 'unsleeved', ...flags }
  }

  const src = alloc.source
  const differs = (p: OwnedPrintingInfo) => p.printingId !== row.scryfallId
  switch (src.kind) {
    case 'free':
      return {
        ...base,
        kind: 'sleeve_owned',
        type: src.isProxy ? 'proxy' : 'original',
        slotPrintingId: src.printingId,
        ownedPrinting: differs(src) ? info(src) : undefined,
        ...flags,
      }
    case 'held': {
      const type: ImportCopyType = src.isProxy ? 'proxy' : 'original'
      if (src.chosen === 'skip') {
        return { ...base, kind: 'move_skipped', type: 'original', alertDeckIds: src.candidates.map((c) => c.deckId), ...flags }
      }
      if (typeof src.chosen === 'number') {
        const from = src.candidates.find((c) => c.deckId === src.chosen)!
        return {
          ...base,
          kind: 'move',
          type,
          fromDeckId: src.chosen,
          slotPrintingId: from.printingId,
          ownedPrinting: differs(from) ? info(from) : undefined,
          ...flags,
        }
      }
      return { ...base, kind: 'needs_choice_move', type: st.type, ...flags }
    }
    case 'other_printing':
      return { ...base, kind: 'needs_choice_printing', type: st.type, ownedPrinting: src.owned, ...flags }
    case 'none':
      return { ...base, kind: 'unowned', type: 'unsleeved', ...flags }
  }
}

/** Plans for every copy of every row, in row order. The one call the screen and the server make. */
export function planImport(input: AllocateInput): CopyPlan[] {
  const allocation = allocateOwnedCopies(input)
  const plans: CopyPlan[] = []
  for (const row of input.rows) {
    for (const copy of row.copies) {
      plans.push(resolveCopyPlan(copy, row, input.intent, input.edits, allocation, input.defaults))
    }
  }
  return plans
}

// ---------------------------------------------------------------------------
// Controls that correct each other (contract §4, client side)
// ---------------------------------------------------------------------------

export interface CoerceContext {
  cardName: string
  /** Type the copy currently shows. */
  effectiveType: ImportCopyType
  /** Add tick currently shown. */
  effectiveAdd: boolean
  /** The owner has this card in some form. */
  anyOwned: boolean
  canOriginal: boolean
  canProxy: boolean
  isGeneric?: boolean
}

export interface CoerceResult {
  edit: IntentCopyOwnerEdits
  /** Announced to screen readers and shown quietly, e.g. "Sol Ring: left unsleeved." */
  message?: string
}

/** Apply one change to a copy's edits and fix up the controls that depend on it. */
export function coerceIntentEdit(
  current: IntentCopyOwnerEdits,
  change: Partial<IntentCopyOwnerEdits>,
  ctx: CoerceContext
): CoerceResult {
  // A generic basic has no Add tick.
  if (ctx.isGeneric) {
    const { add: _ignored, ...rest } = change
    void _ignored
    return { edit: { ...current, ...rest } }
  }
  const next: IntentCopyOwnerEdits = { ...current, ...change }
  let message: string | undefined

  if (change.printing === 'add_this') {
    next.add = true
    if (ctx.effectiveType === 'unsleeved' && change.type === undefined) next.type = 'original'
  }
  if (change.add === true && change.type === undefined && ctx.effectiveType === 'unsleeved') {
    next.type = 'original'
  }
  if (change.add === false && change.type === undefined && ctx.effectiveType !== 'unsleeved' && !ctx.anyOwned) {
    next.type = 'unsleeved'
    message = `${ctx.cardName}: left unsleeved.`
  }
  if ((change.type === 'original' || change.type === 'proxy') && change.add === undefined && !ctx.effectiveAdd) {
    const allowed = change.type === 'original' ? ctx.canOriginal : ctx.canProxy
    if (!allowed) {
      return {
        edit: current,
        message: ctx.anyOwned ? 'No free copy: tick Add' : 'Not owned: tick Add',
      }
    }
  }
  return { edit: next, message }
}

// ---------------------------------------------------------------------------
// Summary (contract §8; wording from spec §7)
// ---------------------------------------------------------------------------

export function summariseImportPlan(plans: CopyPlan[]): ImportPlanSummary {
  const s: ImportPlanSummary = {
    cards: plans.length,
    added: 0,
    addedProxies: 0,
    sleevedFromCollection: 0,
    moved: 0,
    addedNotSleeved: 0,
    unsleeved: 0,
    unowned: 0,
    needChoice: 0,
    alertsOnOtherDecks: 0,
    genericBasics: 0,
  }
  for (const p of plans) {
    switch (p.kind) {
      case 'add_sleeved':
        s.added++
        if (p.type === 'proxy') s.addedProxies++
        break
      case 'add_unsleeved':
        s.added++
        s.addedNotSleeved++
        break
      case 'move_skipped':
        s.added++
        s.alertsOnOtherDecks += p.alertDeckIds?.length ?? 0
        break
      case 'sleeve_owned':
        s.sleevedFromCollection++
        break
      case 'move':
        s.moved++
        break
      case 'owned_unsleeved':
        s.unsleeved++
        break
      case 'unowned':
        s.unowned++
        break
      case 'needs_choice_move':
      case 'needs_choice_printing':
        s.needChoice++
        break
      case 'generic':
        s.genericBasics++
        break
    }
  }
  return s
}

/** Plans that block Import until the owner chooses. */
export function needsChoice(plans: CopyPlan[]): CopyPlan[] {
  return plans.filter((p) => p.kind === 'needs_choice_move' || p.kind === 'needs_choice_printing')
}

/** The summary line under the list. Zero counts are omitted. */
export function summaryText(s: ImportPlanSummary): string {
  const parts: string[] = []
  if (s.added > 0) {
    parts.push(`${s.added} added to your collection${s.addedProxies > 0 ? ` (${s.addedProxies} proxies)` : ''}`)
  } else {
    parts.push('Nothing added to your collection')
  }
  if (s.sleevedFromCollection > 0) parts.push(`${s.sleevedFromCollection} to sleeve from your collection`)
  if (s.moved > 0) parts.push(`${s.moved} to move from another deck`)
  if (s.addedNotSleeved > 0) parts.push(`${s.addedNotSleeved} added, not sleeved`)
  if (s.unsleeved > 0) parts.push(`${s.unsleeved} unsleeved`)
  if (s.unowned > 0) parts.push(`⊖ ${s.unowned} unowned`)
  if (s.needChoice > 0) parts.push(`${s.needChoice} need a choice`)
  if (s.alertsOnOtherDecks > 0) parts.push(`⚠ ${s.alertsOnOtherDecks} alerts on other decks`)
  if (s.genericBasics > 0) parts.push(`${s.genericBasics} generic basics`)
  return `${s.cards} cards: ${parts.join(' · ')}`
}

// ---------------------------------------------------------------------------
// Links (contract §2): a normalised Archidekt/Moxfield deck as review rows
// ---------------------------------------------------------------------------

export interface LinkPreview {
  preview: ManaBoxPreviewResponse
  commander: { name: string; scryfallId: string | null } | null
  /** Maybeboard/sideboard cards are not imported (D-018/D-022 undecided); counted, not shown. */
  maybeboardNotImported: number
  /** "{n} maybeboard cards weren't imported", or null when there are none. */
  notice: string | null
}

/** Build the same review rows a file produces. The source's own Proxy flag is ignored (D-045). */
export function normalizedDeckToPreview(deck: NormalizedDeck): LinkPreview {
  const rows = new Map<string, ImportRow>()
  let line = 0
  for (const card of deck.cards) {
    line++
    const key = `${card.scryfallId}|link`
    let row = rows.get(key)
    if (!row) {
      row = {
        rowKey: key,
        sourceIndex: line,
        sourceLines: [],
        cardName: card.cardName,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber ?? '',
        scryfallId: card.scryfallId,
        oracleId: card.oracleId,
        qty: 0,
        availableFinishes: null,
        copies: [],
        isBasicLand: isBasicLand(card.cardName),
        // A link always names a printing, so a basic from a link is a real card, not a generic.
        printingGiven: true,
      }
      rows.set(key, row)
    }
    row.sourceLines.push(line)
    for (let i = 0; i < Math.max(0, card.quantity); i++) {
      row.copies.push({ index: row.copies.length, sourceLine: line, file: {}, owner: {} })
    }
    row.qty = row.copies.length
  }
  const list = [...rows.values()]
  const maybeboardNotImported = (deck.maybeboard ?? []).reduce((n, c) => n + c.quantity, 0)
  return {
    preview: {
      fileName: deck.name,
      totalLines: list.length,
      rows: list,
      skippedTokens: [],
      unmatched: [],
      notices: { unrecognisedCondition: 0, unrecognisedLanguage: 0, unrecognisedFinish: 0 },
    },
    commander: deck.commander
      ? { name: deck.commander.cardName, scryfallId: deck.commander.scryfallId || null }
      : null,
    maybeboardNotImported,
    notice: maybeboardNotImported > 0 ? `${maybeboardNotImported} maybeboard cards weren't imported` : null,
  }
}
