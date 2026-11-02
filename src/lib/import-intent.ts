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
} from '../../docs/oracle/contracts/import-intent.types'
import type { ManaBoxPreviewResponse } from '../../docs/oracle/contracts/manabox-import.types'
import { isBasicLand, isGenericBasic } from '@/lib/basic-lands'
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

/** Is this review row a generic basic (a basic with no printing named)? Never matched, never added. */
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
  anyOwned = false
): EffectiveCopyState {
  const e: IntentCopyOwnerEdits = edits?.[row.rowKey]?.[copy.index] ?? {}
  // Owner's choice, then the file's Proxy marker (D-055), then Original.
  const start = defaultsForIntent(intent).source
  const source: CardSource = editedSource(e) ?? (start === 'owned' ? (anyOwned ? 'collection' : 'none') : start)
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
  /** A copy another deck holds: used here too, flagged on both decks (owner decision 2026-10-30). */
  | ({ kind: 'held'; isProxy: boolean; deckId: number; deckName: string } & OwnedPrintingInfo)
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

/**
 * Decide, for every copy whose card source is Collection, which owned copy it uses.
 * Rows run in `sourceIndex` order and copies in index order; one owned copy is used once per import.
 * Free copies come before copies other decks hold. Nothing ever moves out of another deck.
 */
export function allocateOwnedCopies(input: AllocateInput): OwnedAllocation {
  const { rows, facts, edits, intent, defaults } = input
  const pool = buildPool(facts)
  const out: OwnedAllocation = {}
  const ordered = [...rows].sort((a, b) => a.sourceIndex - b.sourceIndex)

  for (const row of ordered) {
    if (isGenericImportRow(row)) continue
    const entry = pool.get(row.oracleId) ?? { free: [], held: [] }
    const anyOwned = entry.free.length + entry.held.length > 0
    out[row.rowKey] = {}

    for (const copy of row.copies) {
      const st = effectiveCopyState(copy, row, intent, edits, defaults, anyOwned)
      const left = [...entry.free, ...entry.held].filter((g) => g.left > 0)
      const canCollection = left.length > 0
      const flags = {
        anyOwned,
        canCollection,
        canOriginal: st.source === 'new' || (st.source === 'collection' && left.some((g) => !g.isProxy)),
        canProxy: st.source === 'new' || (st.source === 'collection' && left.some((g) => g.isProxy)),
        ownedOriginalLeft: left.some((g) => !g.isProxy),
        ownedProxyLeft: left.some((g) => g.isProxy),
      }
      if (st.source !== 'collection') {
        out[row.rowKey][copy.index] = { source: { kind: 'none' }, ...flags }
        continue
      }
      let source: CopySource = { kind: 'short' }
      const free = pickCopy(entry.free, row.scryfallId, st)
      if (free) {
        free.left -= 1
        source = { kind: 'free', ...info(free), isProxy: free.isProxy, finish: free.finish }
      } else {
        const held = pickCopy(entry.held, row.scryfallId, st)
        if (held) {
          held.left -= 1
          source = { kind: 'held', ...info(held), isProxy: held.isProxy, deckId: held.deckId, deckName: held.deckName }
        }
      }
      out[row.rowKey][copy.index] = { source, ...flags }
    }
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

  const alloc: CopyAllocation = allocation[row.rowKey]?.[copy.index] ?? {
    source: { kind: 'none' },
    canCollection: false,
    canOriginal: false,
    canProxy: false,
    anyOwned: false,
  }
  const st = effectiveCopyState(copy, row, intent, edits, defaults, alloc.anyOwned)
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
        ownedPrinting: ownedPrinting(src),
        ...flags,
      }
    case 'held':
      return {
        ...base,
        kind: 'share',
        type: src.isProxy ? 'proxy' : 'original',
        slotPrintingId: src.printingId,
        ownedPrinting: ownedPrinting(src),
        fromDeckId: src.deckId,
        sharedWith: [{ deckId: src.deckId, deckName: src.deckName }],
        ...flags,
      }
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
      plans.push(resolveCopyPlan(copy, row, input.intent, input.edits, allocation, input.defaults))
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
  /** The collection copy is also in these decks (it will be flagged on both). */
  sharedWith?: Array<{ deckId: number; deckName: string }>
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
  defaults: ImportDefaults
): Record<string, IntentCopyView[]> {
  const planOf = new Map(plans.map((p) => [`${p.rowKey}#${p.copyIndex}`, p]))
  const out: Record<string, IntentCopyView[]> = {}
  for (const row of rows) {
    const generic = isGenericImportRow(row)
    out[row.rowKey] = row.copies.map((copy) => {
      const plan = planOf.get(`${row.rowKey}#${copy.index}`)
      const alloc = allocation[row.rowKey]?.[copy.index]
      const st = effectiveCopyState(copy, row, intent, edits, defaults, alloc?.anyOwned ?? false)
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
        ...(plan?.sharedWith ? { sharedWith: plan.sharedWith } : {}),
        ...(alloc ? { ownedOriginalLeft: !!alloc.ownedOriginalLeft, ownedProxyLeft: !!alloc.ownedProxyLeft } : {}),
      }
    })
  }
  return out
}

/** Does any non-generic copy come from somewhere other than New? Such a deck can't be saved by the old path. */
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
      const { add: _a, move: _m, printing: _p, source: _s, ...rest } = e
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
    if (change.source === 'none') next.type = undefined
    else if (change.source === 'new') next.type = keep ?? sleevedType(ctx.effectiveType) ?? 'original'
    // Collection: keep an asked-for kind only while one is left; otherwise take what is there.
    else next.type = keep === 'original' && ctx.canOriginal ? keep : keep === 'proxy' && ctx.canProxy ? keep : undefined
  }
  if (change.type !== undefined) {
    const t = sleevedType(change.type)
    if (!t || next.source === 'none' || next.source === undefined) return { edit: current }
    if (next.source === 'collection' && !(t === 'original' ? ctx.canOriginal : ctx.canProxy)) {
      return { edit: current, message: `${ctx.cardName}: no ${t} in your collection.` }
    }
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
      case 'share':
        s.sleevedFromCollection++
        s.alertsOnOtherDecks += p.sharedWith?.length ?? 0
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

/** Plans that block Import until the owner chooses (Collection asked for, nothing left). */
export function needsChoice(plans: CopyPlan[]): CopyPlan[] {
  return plans.filter((p) => p.short || p.kind === 'needs_choice_move' || p.kind === 'needs_choice_printing')
}

export interface DeckBreakdown {
  collection: number
  new: number
  notInDeck: number
  /** Of `collection`: copies also in another deck. */
  shared: number
  short: number
}

/** Copies by card source; collection + new + notInDeck + short adds up to the copies given. */
export function deckBreakdown(plans: CopyPlan[]): DeckBreakdown {
  const b: DeckBreakdown = { collection: 0, new: 0, notInDeck: 0, shared: 0, short: 0 }
  for (const p of plans) {
    if (p.short) b.short++
    else if (p.kind === 'add_sleeved' || p.kind === 'add_unsleeved' || p.kind === 'move_skipped') b.new++
    else if (p.kind === 'sleeve_owned' || p.kind === 'move') b.collection++
    else if (p.kind === 'share') {
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
      [b.shared, 'also in other decks'],
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
  if (s.alertsOnOtherDecks > 0) parts.push(`⚠ ${s.alertsOnOtherDecks} also in other decks`)
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
  const owned = built.filter((p) => p.kind === 'sleeve_owned' || p.kind === 'share').length
  const shared = built.filter((p) => p.kind === 'share').length
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const ownedNote = (text: string) => (owned > 0 ? ` · ${text}` : '')
  const builtParts = [
    `${owned - shared} from collection`,
    ...(shared > 0 ? [`${shared} also in other decks (flagged after import)`] : []),
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
