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
  ImportCopyEdits,
  ImportCopyType,
  ImportDefaults,
  ImportFinish,
  ImportRow,
} from '../../docs/oracle/contracts/import-row-editing.types'
import type {
  CardSource,
  CopyPlan,
  HeldCopyGroup,
  ImportIntent,
  ImportPlanSummary,
  IntentCopyEdits,
  IntentCopyOwnerEdits,
  OwnedCopyGroup,
  OwnershipRowFacts,
  SourcePick,
} from '../../docs/oracle/contracts/import-intent.types'
import type { ManaBoxPreviewResponse } from '../../docs/oracle/contracts/manabox-import.types'
import { isBasicLand, isGenericBasic, isIgnorableBasic } from '@/lib/basic-lands'
import { resolveCopy } from '@/lib/import-copies'
import type { NormalizedDeck } from '@/lib/deck-normalizer'

// ---------------------------------------------------------------------------
// Intent defaults (contract §2; simplified model, owner decision 2026-10-30)
// ---------------------------------------------------------------------------

export interface IntentStartingState {
  /** Card source every non-generic copy starts with. 'owned' = Collection when the card is owned at all, else None. */
  source: CardSource | 'owned'
  /** Generic basics: sleeved or not. */
  genericSleeved: boolean
}

export function defaultsForIntent(intent: ImportIntent): IntentStartingState {
  switch (intent) {
    case 'purchased':
      return { source: 'new', genericSleeved: true }
    case 'built':
      return { source: 'owned', genericSleeved: true }
    case 'planned':
      return { source: 'none', genericSleeved: false }
  }
}

/** Is this row an "ignored basic": one of the five basics or Wastes, naming a printing, with the switch on? */
export function isIgnoredBasicRow(row: Pick<ImportRow, 'cardName' | 'printingGiven'>, ignoreBasics: boolean | undefined): boolean {
  return !!ignoreBasics && !isGenericImportRow(row) && isIgnorableBasic(row.cardName)
}

/** Is this row a generic basic (a basic with no printing named)? Never matched, never added. */
export function isGenericImportRow(row: Pick<ImportRow, 'cardName' | 'printingGiven'>): boolean {
  return isGenericBasic(row.cardName, row.printingGiven ?? true)
}

export interface EffectiveCopyState {
  source: CardSource
  /** True when source is New. Kept for the save path. */
  add: boolean
  /** Original / Proxy the owner asked for (file or click). Undefined = any (originals first). */
  wantedType?: 'original' | 'proxy'
  /** What the copy would be: Unsleeved under None. */
  type: ImportCopyType
  finish: ImportFinish
}

const sleevedType = (t: ImportCopyType | undefined): 'original' | 'proxy' | undefined =>
  t === 'original' || t === 'proxy' ? t : undefined

/** The card source an edit asks for, reading older edits (add / move / printing / type) too. */
function editedSource(e: IntentCopyOwnerEdits): CardSource | undefined {
  if (e.source) return e.source
  if (e.add === true || e.printing === 'add_this' || e.move?.kind === 'skip') return 'new'
  if (e.move?.kind === 'move' || e.printing === 'use_mine') return 'collection'
  if (e.type === 'unsleeved') return 'none'
  if (e.add === false && e.type) return 'collection'
  return undefined
}

/** Owner's choice if any, else the intent's starting state. `anyOwned` decides the built default. Pure. */
export function effectiveCopyState(
  copy: ImportCopy,
  row: Pick<ImportRow, 'rowKey' | 'availableFinishes'>,
  intent: ImportIntent,
  edits: IntentCopyEdits | undefined,
  defaults: ImportDefaults,
  anyOwned = false,
  /** An ignored basic ("Ignore basic lands" on): never From collection; the deck just gets an ordinary basic. */
  ignored = false
): EffectiveCopyState {
  const e: IntentCopyOwnerEdits = edits?.[row.rowKey]?.[copy.index] ?? {}
  // Owner's choice, then the file's Proxy marker (D-055), then Original.
  const start = defaultsForIntent(intent).source
  const asked: CardSource = editedSource(e) ?? (start === 'owned' ? (ignored ? 'new' : anyOwned ? 'collection' : 'none') : start)
  const source: CardSource = ignored && asked === 'collection' ? 'new' : asked
  const wantedType = source === 'none' ? undefined : (sleevedType(e.type) ?? sleevedType(copy.owner.type) ?? (copy.file.proxy === true ? 'proxy' : undefined))
  const type: ImportCopyType = source === 'none' ? 'unsleeved' : (wantedType ?? 'original')
  const owner = { ...copy.owner }
  if (e.finish !== undefined) owner.finish = e.finish
  const finish = resolveCopy({ ...copy, owner }, defaults, row.availableFinishes).finish
  return { source, add: source === 'new', wantedType, type, finish }
}

// ---------------------------------------------------------------------------
// Matching owned copies (contract §3, simplified)
// ---------------------------------------------------------------------------

export interface OwnedPrintingInfo {
  printingId: string
  setCode: string
  collectorNumber: string
}

export type CopySource =
  /** A free copy (exact printing first, then any other printing). */
  | ({ kind: 'free'; isProxy: boolean; finish: ImportFinish } & OwnedPrintingInfo)
  /** A copy another deck holds: it MOVES to this deck on save; the other deck keeps the card as a planned slot (owner decision 2026-11-04). */
  | ({ kind: 'held'; isProxy: boolean; finish: ImportFinish; deckId: number; deckName: string } & OwnedPrintingInfo)
  /** Collection was asked for and owned copies exist, but no source is chosen yet ("Choose source"). Blocks Import. */
  | { kind: 'unset' }
  /** Collection was asked for but no owned copy is left. */
  | { kind: 'short' }
  | { kind: 'none' }

export interface CopyAllocation {
  source: CopySource
  /** Collection can be chosen: an owned copy (any printing, free or in a deck) is left for this copy. */
  canCollection: boolean
  /** Under Collection: an owned original / proxy is left. Under New: always. Under None: never. */
  canOriginal: boolean
  canProxy: boolean
  /** The owner has this card in some form (free or held). */
  anyOwned: boolean
  /** An owned original / proxy is left for this copy, whatever its current source (for a switch to Collection). */
  ownedOriginalLeft?: boolean
  ownedProxyLeft?: boolean
  /** Collection copies only: what is chosen and what could be chosen (the Source select). */
  pull?: PullState
}

/** Where a From-collection copy's physical card comes from, and the choices open to it. */
export interface PullState {
  /** unset = "Choose source" (blocks); short = nothing left to use. */
  pick: 'spare' | 'deck' | 'unset' | 'short'
  deckId?: number
  deckName?: string
  options: { spare: boolean; decks: Array<{ deckId: number; deckName: string; count: number }> }
}

/** rowKey -> copy index -> allocation. Generic basics have no entry. */
export type OwnedAllocation = Record<string, Record<number, CopyAllocation>>

export interface AllocateInput {
  rows: ImportRow[]
  facts: OwnershipRowFacts[]
  edits?: IntentCopyEdits
  intent: ImportIntent
  defaults: ImportDefaults
  /** "Ignore basic lands": the five basics and Wastes are never pulled from other decks. */
  ignoreBasics?: boolean
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
      free: (f.free ?? []).map((g) => ({ ...g, left: g.count })),
      held: (f.held ?? []).map((g) => ({ ...g, left: g.count })),
    })
  }
  return pool
}

function info(g: OwnedPrintingInfo): OwnedPrintingInfo {
  return { printingId: g.printingId, setCode: g.setCode, collectorNumber: g.collectorNumber }
}

/**
 * Pick order: free exact printing, free other printing, held exact printing, held other printing.
 * Within each: the wanted kind only when the owner asked for one, else originals first; then the wanted finish.
 */
function pickCopy<G extends OwnedCopyGroup & { left: number }>(
  groups: G[],
  printingId: string,
  st: EffectiveCopyState
): G | undefined {
  const ok = groups.filter(
    (g) => g.left > 0 && (st.wantedType === undefined || g.isProxy === (st.wantedType === 'proxy'))
  )
  const rank = (g: G) =>
    Number(g.printingId !== printingId) * 4 + Number(g.isProxy) * 2 + Number(g.finish !== st.finish)
  return ok.sort((a, b) => rank(a) - rank(b))[0]
}

const freeSource = (g: PoolFree): CopySource => ({ kind: 'free', ...info(g), isProxy: g.isProxy, finish: g.finish })
const heldSource = (g: PoolHeld): CopySource => ({
  kind: 'held',
  ...info(g),
  isProxy: g.isProxy,
  finish: g.finish,
  deckId: g.deckId,
  deckName: g.deckName,
})

/**
 * Decide, for every copy whose card source is Collection, which owned copy it uses (spec import-modal-redesign §4).
 * - An explicit pick (spare / a deck / none = "Choose source") is honoured first, so automatic choices never take it.
 * - Otherwise: a spare copy wins; else nothing is chosen until the owner picks a deck.
 * - An explicit pick that can no longer be met is "short", never silently swapped for another source.
 * Rows run in `sourceIndex` order and copies in index order; one owned copy is used once per import.
 * The finish asked for is the file's (or the owner's); the copy's own Original/Proxy is kept (never filtered).
 * Ignored basics are never Collection, so they never touch the pool.
 */
export function allocateOwnedCopies(input: AllocateInput): OwnedAllocation {
  const { rows, facts, edits, intent, defaults } = input
  const pool = buildPool(facts)
  const out: OwnedAllocation = {}
  const ordered = [...rows].sort((a, b) => a.sourceIndex - b.sourceIndex)

  interface Item {
    row: ImportRow
    copy: ImportCopy
    st: EffectiveCopyState
    entry: PoolEntry
    anyOwned: boolean
    pick?: SourcePick
    source: CopySource
  }
  const items: Item[] = []
  const all: Item[] = []

  for (const row of ordered) {
    if (isGenericImportRow(row)) continue
    const ignored = isIgnoredBasicRow(row, input.ignoreBasics)
    const entry = pool.get(row.oracleId) ?? { free: [], held: [] }
    const anyOwned = entry.free.length + entry.held.length > 0
    out[row.rowKey] = {}
    for (const copy of row.copies) {
      const st = effectiveCopyState(copy, row, intent, edits, defaults, anyOwned, ignored)
      const item: Item = { row, copy, st, entry, anyOwned, pick: edits?.[row.rowKey]?.[copy.index]?.pick, source: { kind: 'none' } }
      all.push(item)
      if (st.source === 'collection') items.push(item)
    }
  }

  const wantFinish = (c: ImportCopy): ImportFinish => c.owner.finish ?? c.file.finish ?? 'nonfoil'
  const take = <G extends OwnedCopyGroup & { left: number }>(groups: G[], it: Item): G | undefined => {
    const g = pickCopy(groups, it.row.scryfallId, { ...it.st, wantedType: undefined, finish: wantFinish(it.copy) })
    if (g) g.left -= 1
    return g
  }
  const own = new Map<Item, PoolFree | PoolHeld>()
  const takeSpare = (it: Item) => {
    const g = take(it.entry.free, it)
    if (g) own.set(it, g)
    it.source = g ? freeSource(g) : { kind: 'short' }
  }
  const takeDeck = (it: Item, deckId: number) => {
    const g = take(it.entry.held.filter((h) => h.deckId === deckId), it)
    if (g) own.set(it, g)
    it.source = g ? heldSource(g) : { kind: 'short' }
  }

  // Pass 1: explicit picks reserve their copies.
  for (const it of items) {
    if (!it.pick) continue
    if (it.pick.kind === 'none') it.source = { kind: 'unset' }
    else if (it.pick.kind === 'spare') takeSpare(it)
    else takeDeck(it, it.pick.deckId)
  }
  // Pass 2: automatic choices take what is left.
  for (const it of items) {
    if (it.pick) continue
    if (it.entry.free.some((g) => g.left > 0)) {
      takeSpare(it)
      continue
    }
    const deckIds = [...new Set(it.entry.held.filter((g) => g.left > 0).map((g) => g.deckId))]
    if (deckIds.length === 0) it.source = { kind: 'short' }
    // Taking a card out of another deck is always the owner's choice, even with one candidate deck.
    else it.source = { kind: 'unset' }
  }

  for (const it of all) {
    const mine = own.get(it)
    const left = [...it.entry.free, ...it.entry.held].filter((g) => g.left > 0 || g === mine)
    const ignored = isIgnoredBasicRow(it.row, input.ignoreBasics)
    const canCollection = !ignored && left.length > 0
    const flags: Omit<CopyAllocation, 'source'> = {
      anyOwned: it.anyOwned,
      canCollection,
      canOriginal: it.st.source === 'new' || (it.st.source === 'collection' && left.some((g) => !g.isProxy)),
      canProxy: it.st.source === 'new' || (it.st.source === 'collection' && left.some((g) => g.isProxy)),
      ownedOriginalLeft: left.some((g) => !g.isProxy),
      ownedProxyLeft: left.some((g) => g.isProxy),
    }
    if (it.st.source === 'collection') {
      const byDeck = new Map<number, { deckId: number; deckName: string; count: number }>()
      for (const g of it.entry.held) {
        const n = g.left + (g === mine ? 1 : 0)
        if (n <= 0) continue
        const cur = byDeck.get(g.deckId) ?? { deckId: g.deckId, deckName: g.deckName, count: 0 }
        cur.count += n
        byDeck.set(g.deckId, cur)
      }
      const pick: PullState['pick'] =
        it.source.kind === 'free' ? 'spare' : it.source.kind === 'held' ? 'deck' : it.source.kind === 'unset' ? 'unset' : 'short'
      flags.pull = {
        pick,
        ...(it.source.kind === 'held' ? { deckId: it.source.deckId, deckName: it.source.deckName } : {}),
        options: {
          spare: it.entry.free.some((g) => g.left > 0 || g === mine),
          decks: [...byDeck.values()].sort((a, b) => a.deckName.localeCompare(b.deckName)),
        },
      }
    }
    out[it.row.rowKey][it.copy.index] = { source: it.st.source === 'collection' ? it.source : { kind: 'none' }, ...flags }
  }
  return out
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
  defaults: ImportDefaults,
  ignoreBasics = false
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

  const alloc: CopyAllocation = allocation[row.rowKey]?.[copy.index] ?? {
    source: { kind: 'none' },
    canCollection: false,
    canOriginal: false,
    canProxy: false,
    anyOwned: false,
  }
  const st = effectiveCopyState(copy, row, intent, edits, defaults, alloc.anyOwned, isIgnoredBasicRow(row, ignoreBasics))
  const flags = { canOriginal: alloc.canOriginal, canProxy: alloc.canProxy }
  const notInDeck = alloc.anyOwned ? 'owned_unsleeved' : 'unowned'

  if (st.source === 'new') {
    return { ...base, kind: 'add_sleeved', type: st.type === 'proxy' ? 'proxy' : 'original', ...flags }
  }
  if (st.source === 'none') return { ...base, kind: notInDeck, type: 'unsleeved', ...flags }

  const src = alloc.source
  const ownedPrinting = (p: OwnedPrintingInfo) => (p.printingId !== row.scryfallId ? info(p) : undefined)
  switch (src.kind) {
    case 'free':
      return {
        ...base,
        kind: 'sleeve_owned',
        type: src.isProxy ? 'proxy' : 'original',
        slotPrintingId: src.printingId,
        finish: src.finish,
        ownedPrinting: ownedPrinting(src),
        ...flags,
      }
    case 'held':
      // Scan wins: the copy moves here; the deck it leaves keeps the card as a planned slot (and is short by one).
      return {
        ...base,
        kind: 'move',
        type: src.isProxy ? 'proxy' : 'original',
        slotPrintingId: src.printingId,
        finish: src.finish,
        ownedPrinting: ownedPrinting(src),
        fromDeckId: src.deckId,
        fromDeckName: src.deckName,
        ...flags,
      }
    case 'unset':
      return { ...base, kind: 'needs_choice_move', type: 'unsleeved', ...flags }
    default:
      return { ...base, kind: notInDeck, type: 'unsleeved', short: true, ...flags }
  }
}

/** Plans for every copy of every row, in row order. The one call the screen and the server make. */
export function planImport(input: AllocateInput): CopyPlan[] {
  return planImportDetailed(input).plans
}

/** Same as planImport, plus the owned-copy allocation the plans came from. */
export function planImportDetailed(input: AllocateInput): { plans: CopyPlan[]; allocation: OwnedAllocation } {
  const allocation = allocateOwnedCopies(input)
  const plans: CopyPlan[] = []
  for (const row of input.rows) {
    for (const copy of row.copies) {
      plans.push(resolveCopyPlan(copy, row, input.intent, input.edits, allocation, input.defaults, input.ignoreBasics))
    }
  }
  return { plans, allocation }
}

// ---------------------------------------------------------------------------
// What the review screen shows for each copy, and what a click does
// ---------------------------------------------------------------------------

export interface IntentCopyView {
  index: number
  generic: boolean
  /** Card source as it stands; null = Collection asked for but nothing left ("short": open to choose). */
  source: CardSource | null
  /** Original / Proxy / Unsleeved as it stands (what saving would do). */
  type: ImportCopyType
  canCollection: boolean
  canOriginal: boolean
  canProxy: boolean
  anyOwned: boolean
  /** Collection asked for, no owned copy left: the owner must pick None or New. Blocks Import. */
  short: boolean
  /** From collection with no source yet ("Choose source"), or nothing left to use. Blocks Import. */
  needsSource: boolean
  /** From collection: what is chosen and what could be chosen (the Source select). */
  pull?: PullState
  /** An owned original / proxy is left for this copy (decides which type survives a switch to Collection). */
  ownedOriginalLeft?: boolean
  ownedProxyLeft?: boolean
}

export function intentCopyViews(
  rows: ImportRow[],
  plans: CopyPlan[],
  allocation: OwnedAllocation,
  edits: IntentCopyEdits | undefined,
  intent: ImportIntent,
  defaults: ImportDefaults,
  ignoreBasics = false
): Record<string, IntentCopyView[]> {
  const planOf = new Map(plans.map((p) => [`${p.rowKey}#${p.copyIndex}`, p]))
  const out: Record<string, IntentCopyView[]> = {}
  for (const row of rows) {
    const generic = isGenericImportRow(row)
    out[row.rowKey] = row.copies.map((copy) => {
      const plan = planOf.get(`${row.rowKey}#${copy.index}`)
      const alloc = allocation[row.rowKey]?.[copy.index]
      const st = effectiveCopyState(copy, row, intent, edits, defaults, alloc?.anyOwned ?? false, isIgnoredBasicRow(row, ignoreBasics))
      const short = !!plan?.short
      return {
        index: copy.index,
        generic,
        source: short ? null : st.source,
        type: plan?.type ?? st.type,
        canCollection: alloc?.canCollection ?? false,
        canOriginal: plan?.canOriginal ?? true,
        canProxy: plan?.canProxy ?? false,
        anyOwned: alloc?.anyOwned ?? false,
        short,
        needsSource: short || plan?.kind === 'needs_choice_move',
        ...(alloc?.pull ? { pull: alloc.pull } : {}),
        ...(alloc ? { ownedOriginalLeft: !!alloc.ownedOriginalLeft, ownedProxyLeft: !!alloc.ownedProxyLeft } : {}),
      }
    })
  }
  return out
}

/** Does any non-generic copy come from somewhere other than New? Such a deck can't be saved by the old path. */
/**
 * The source the owner saw for every From-collection copy, written into the edits as explicit picks.
 * Sent with the import so the server only ever makes the moves the review showed (never a different one).
 */
export function withResolvedPicks(edits: IntentCopyEdits, views: Record<string, IntentCopyView[]>): IntentCopyEdits {
  const out: IntentCopyEdits = {}
  for (const [rowKey, perIndex] of Object.entries(edits)) out[rowKey] = { ...perIndex }
  for (const [rowKey, list] of Object.entries(views)) {
    for (const v of list) {
      const pull = v.pull
      if (!pull || v.source !== 'collection') continue
      const pick: SourcePick | undefined =
        pull.pick === 'spare' ? { kind: 'spare' } : pull.pick === 'deck' && pull.deckId !== undefined ? { kind: 'deck', deckId: pull.deckId } : undefined
      if (!pick) continue
      out[rowKey] = { ...out[rowKey], [v.index]: { ...out[rowKey]?.[v.index], source: 'collection', pick } }
    }
  }
  return out
}

export function hasNonNewCopy(views: Record<string, IntentCopyView[]>): boolean {
  return Object.values(views).some((copies) => copies.some((c) => !c.generic && c.source !== 'new'))
}

/** Replace one copy's edits (empty = remove). Unlike setCopyField this can also clear a field. */
export function setIntentEdit(
  edits: IntentCopyEdits,
  rowKey: string,
  index: number,
  edit: IntentCopyOwnerEdits
): IntentCopyEdits {
  const clean = Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== undefined)) as IntentCopyOwnerEdits
  const row = { ...(edits[rowKey] ?? {}) }
  if (Object.keys(clean).length === 0) delete row[index]
  else row[index] = clean
  const next = { ...edits }
  if (Object.keys(row).length === 0) delete next[rowKey]
  else next[rowKey] = row
  return next
}

export type IntentChange = Partial<IntentCopyOwnerEdits>

/**
 * One click on a copy's controls: applies the change, fixes up the controls that depend on it,
 * and returns the new edits plus a quiet message to announce. Pure.
 */
export function applyIntentChange(
  edits: IntentCopyEdits,
  rowKey: string,
  cardName: string,
  view: IntentCopyView,
  change: IntentChange
): { edits: IntentCopyEdits; message?: string } {
  const current = edits[rowKey]?.[view.index] ?? {}
  // Switching to Collection: what the collection holds decides the type, not what New allowed.
  const toCollection = change.source === 'collection' && view.source !== 'collection'
  const result = coerceIntentEdit(current, change, {
    cardName,
    source: view.source,
    effectiveType: view.type,
    canCollection: view.canCollection,
    canOriginal: toCollection ? (view.ownedOriginalLeft ?? view.canOriginal) : view.canOriginal,
    canProxy: toCollection ? (view.ownedProxyLeft ?? view.canProxy) : view.canProxy,
    isGeneric: view.generic,
  })
  return { edits: setIntentEdit(edits, rowKey, view.index, result.edit), message: result.message }
}

/**
 * The save path in use today knows only the row-editing fields. Drops source / add / move / printing so the
 * server never sees fields it does not read.
 */
export function stripIntentFields(edits: IntentCopyEdits): ImportCopyEdits {
  const out: ImportCopyEdits = {}
  for (const [rowKey, copies] of Object.entries(edits)) {
    for (const [i, e] of Object.entries(copies)) {
      const { add: _a, move: _m, printing: _p, source: _s, pick: _k, ...rest } = e
      void _k
      void _a
      void _m
      void _p
      void _s
      if (Object.keys(rest).length === 0) continue
      out[rowKey] = { ...(out[rowKey] ?? {}), [Number(i)]: rest }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Controls that correct each other (client side)
// ---------------------------------------------------------------------------

export interface CoerceContext {
  cardName: string
  /** Card source the copy currently shows (null = short). */
  source: CardSource | null
  /** Type the copy currently shows. */
  effectiveType: ImportCopyType
  canCollection: boolean
  canOriginal: boolean
  canProxy: boolean
  isGeneric?: boolean
}

export interface CoerceResult {
  edit: IntentCopyOwnerEdits
  /** Announced to screen readers and shown quietly, e.g. "Sol Ring: no proxy in your collection." */
  message?: string
}

/** Apply one change to a copy's edits and fix up the controls that depend on it. */
export function coerceIntentEdit(
  current: IntentCopyOwnerEdits,
  change: Partial<IntentCopyOwnerEdits>,
  ctx: CoerceContext
): CoerceResult {
  // A generic basic has only the Sleeved switch (and the row-editing fields).
  if (ctx.isGeneric) {
    const { add: _a, source: _s, ...rest } = change
    void _a
    void _s
    return { edit: { ...current, ...rest } }
  }
  // Older fields are folded into Card source.
  const { add: _a, move: _m, printing: _p, ...kept } = current
  void _a
  void _m
  void _p
  const { add: _ca, move: _cm, printing: _cp, ...asked } = change
  void _ca
  void _cm
  void _cp
  const next: IntentCopyOwnerEdits = { ...kept, ...asked, source: change.source ?? ctx.source ?? kept.source }

  if (change.source !== undefined) {
    if (change.source === 'collection' && !ctx.canCollection) {
      return { edit: current, message: `${ctx.cardName}: none left in your collection.` }
    }
    const keep = sleevedType(kept.type)
    // A source pick belongs to From collection only; switching origin starts it afresh.
    if (change.source !== 'collection' || ctx.source !== 'collection') delete next.pick
    if (change.source === 'none') next.type = undefined
    else if (change.source === 'new') next.type = keep ?? sleevedType(ctx.effectiveType) ?? 'original'
    // Collection: the pulled copy keeps its own Original/Proxy; the owner does not choose it.
    else next.type = undefined
  }
  if (change.type !== undefined) {
    const t = sleevedType(change.type)
    if (!t || next.source === 'none' || next.source === undefined) return { edit: current }
    if (next.source === 'collection') return { edit: current }
  }
  return { edit: next }
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
    if (p.short) {
      s.needChoice++
      continue
    }
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
        s.sleevedFromCollection++
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

/** Plans that block Import until the owner chooses (Collection asked for, nothing left). */
export function needsChoice(plans: CopyPlan[]): CopyPlan[] {
  return plans.filter((p) => p.short || p.kind === 'needs_choice_move' || p.kind === 'needs_choice_printing')
}

export interface DeckBreakdown {
  collection: number
  new: number
  notInDeck: number
  /** Of `collection`: copies taken from another deck. */
  shared: number
  short: number
}

/** Copies by card source; collection + new + notInDeck + short adds up to the copies given. */
export function deckBreakdown(plans: CopyPlan[]): DeckBreakdown {
  const b: DeckBreakdown = { collection: 0, new: 0, notInDeck: 0, shared: 0, short: 0 }
  for (const p of plans) {
    if (p.short) b.short++
    else if (p.kind === 'add_sleeved' || p.kind === 'add_unsleeved' || p.kind === 'move_skipped') b.new++
    else if (p.kind === 'sleeve_owned') b.collection++
    else if (p.kind === 'move') {
      b.collection++
      b.shared++
    } else if (p.kind === 'generic') {
      if (p.genericSleeved) b.collection++
      else b.notInDeck++
    } else b.notInDeck++
  }
  return b
}

/** The line under the list: the selected chip's copies by card source. */
export function breakdownLine(b: DeckBreakdown, filter: string): string {
  if (filter === 'maybeboard') return 'Maybeboard cards are not added to your collection or sleeved.'
  const parts = (
    [
      [b.collection, 'from collection'],
      [b.new, 'new'],
      [b.notInDeck, 'not in deck'],
      [b.shared, 'taken from other decks'],
      [b.short, 'short'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
  return parts.join(' · ')
}

/** The summary line under the list. Zero counts are omitted. */
export function summaryText(s: ImportPlanSummary): string {
  const parts: string[] = []
  if (s.sleevedFromCollection > 0) parts.push(`${s.sleevedFromCollection} from your collection`)
  if (s.added > 0) parts.push(`${s.added} new`)
  if (s.unsleeved + s.unowned > 0) parts.push(`${s.unsleeved + s.unowned} not in deck`)
  if (s.needChoice > 0) parts.push(`${s.needChoice} short`)
  if (s.moved > 0) parts.push(`${s.moved} taken from other decks`)
  if (s.genericBasics > 0) parts.push(`${s.genericBasics} generic basics`)
  return parts.join(' · ')
}

// ---------------------------------------------------------------------------
// Row tags for the collapsed review row
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// "What's this deck?" after the deck loads: real numbers per option and a suggestion
// ---------------------------------------------------------------------------

export interface IntentChoiceStats {
  /** One line per option, e.g. "80 from collection · 14 not in deck · 6 also in other decks". */
  byIntent: Record<ImportIntent, string>
  /** "You own 86 of the 100 cards. 6 of those are in other decks." */
  headline: string
  suggested: ImportIntent
  /** Why it is suggested, e.g. "suggested: you own most of these cards". */
  reason: string
}

/**
 * Suggestion rule (assumption, owner to confirm): a precon is bought; owning at least half the
 * cards means built; otherwise planned. Counts are main-deck copies, generic basics left out.
 */
export function intentChoiceStats(
  input: Omit<AllocateInput, 'intent' | 'edits'>,
  options: { precon?: boolean } = {}
): IntentChoiceStats {
  const built = planImport({ ...input, intent: 'built' }).filter((p) => p.kind !== 'generic')
  const total = built.length
  const inOtherDecks = (k: string) => k === 'move' || k === 'needs_choice_move'
  const owned = built.filter((p) => p.kind === 'sleeve_owned' || inOtherDecks(p.kind)).length
  const shared = built.filter((p) => inOtherDecks(p.kind)).length
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const ownedNote = (text: string) => (owned > 0 ? ` · ${text}` : '')
  const builtParts = [
    `${owned - shared} from collection`,
    ...(shared > 0 ? [`${shared} taken from other decks`] : []),
    ...(total - owned > 0 ? [`${total - owned} not in deck (you don't own them)`] : []),
  ]
  const byIntent: Record<ImportIntent, string> = {
    purchased: plural(total, 'new copy', 'new copies') + ownedNote(`you already own another copy of ${owned} of them`),
    built: builtParts.join(' · '),
    planned: `${total} not in deck` + ownedNote(`you own ${owned} of them`),
  }
  const headline =
    `You own ${owned} of the ${plural(total, 'card', 'cards')}.` +
    (shared > 0 ? ` ${shared} of those ${shared === 1 ? 'is' : 'are'} in other decks.` : '')
  if (options.precon) return { byIntent, headline, suggested: 'purchased', reason: 'suggested for a precon' }
  if (total > 0 && owned * 2 >= total) {
    return { byIntent, headline, suggested: 'built', reason: 'suggested: you own most of these cards' }
  }
  return { byIntent, headline, suggested: 'planned', reason: "suggested: you don't own most of these cards" }
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
