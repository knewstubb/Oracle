import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseManaBoxCsv } from '@/lib/manabox-import'
import { describe, it, expect } from 'vitest'
import type { ImportRow, ImportDefaults } from '../../docs/oracle/contracts/import-row-editing.types'
import { INITIAL_IMPORT_DEFAULTS } from '../../docs/oracle/contracts/import-row-editing.types'
import type {
  CopyPlan,
  HeldCopyGroup,
  ImportIntent,
  IntentCopyEdits,
  IntentCopyOwnerEdits,
  OwnedCopyGroup,
  OwnershipRowFacts,
} from '../../docs/oracle/contracts/import-intent.types'
import type { NormalizedDeck } from '@/lib/deck-normalizer'
import {
  allocateOwnedCopies,
  breakdownLine,
  coerceIntentEdit,
  deckBreakdown,
  defaultsForIntent,
  effectiveCopyState,
  intentChoiceStats,
  needsChoice,
  normalizedDeckToPreview,
  planImport,
    summariseImportPlan,
  summaryText,
  type CoerceContext,
} from './import-intent'

const defaults: ImportDefaults = { ...INITIAL_IMPORT_DEFAULTS }

function row(over: Partial<ImportRow> & { qty?: number } = {}): ImportRow {
  const qty = over.qty ?? 1
  return {
    rowKey: 'k1',
    sourceIndex: 1,
    sourceLines: [1],
    cardName: 'Sol Ring',
    setCode: 'clb',
    collectorNumber: '351',
    scryfallId: 'p-clb',
    oracleId: 'o-sol',
    qty,
    availableFinishes: null,
    copies: Array.from({ length: qty }, (_, i) => ({ index: i, sourceLine: 1, file: {}, owner: {} })),
    isBasicLand: false,
    printingGiven: true,
    ...over,
  }
}

function free(over: Partial<OwnedCopyGroup> = {}): OwnedCopyGroup {
  return { printingId: 'p-clb', setCode: 'clb', collectorNumber: '351', finish: 'nonfoil', isProxy: false, count: 1, ...over }
}
function held(deckId: number, over: Partial<HeldCopyGroup> = {}): HeldCopyGroup {
  return { ...free(), deckId, deckName: `Deck ${deckId}`, ...over }
}
function facts(r: ImportRow, f: OwnedCopyGroup[] = [], h: HeldCopyGroup[] = []): OwnershipRowFacts {
  return { rowKey: r.rowKey, oracleId: r.oracleId, free: f, held: h }
}
function plan(rows: ImportRow[], fs: OwnershipRowFacts[], intent: ImportIntent, edits?: IntentCopyEdits) {
  return planImport({ rows, facts: fs, edits, intent, defaults })
}
const collection = (over: IntentCopyOwnerEdits = {}): IntentCopyEdits => ({ k1: { 0: { source: 'collection', ...over } } })
const cmm = { printingId: 'p-cmm', setCode: 'cmm', collectorNumber: '410' }

describe('defaultsForIntent', () => {
  it('purchased: New, sleeved generics', () => {
    expect(defaultsForIntent('purchased')).toEqual({ source: 'new', genericSleeved: true })
  })
  it('built: Collection when owned (else None), sleeved generics', () => {
    expect(defaultsForIntent('built')).toEqual({ source: 'owned', genericSleeved: true })
  })
  it('planned: None, unsleeved generics', () => {
    expect(defaultsForIntent('planned')).toEqual({ source: 'none', genericSleeved: false })
  })
})

describe('effectiveCopyState', () => {
  const r = row()
  const st = (intent: ImportIntent, e?: IntentCopyOwnerEdits, anyOwned = false) =>
    effectiveCopyState(r.copies[0], r, intent, e ? { k1: { 0: e } } : undefined, defaults, anyOwned)

  it('applies the intent default; built depends on whether the card is owned', () => {
    expect(st('purchased')).toMatchObject({ source: 'new', add: true, type: 'original' })
    expect(st('built', undefined, true)).toMatchObject({ source: 'collection', add: false, type: 'original' })
    expect(st('built', undefined, false)).toMatchObject({ source: 'none', type: 'unsleeved' })
    expect(st('planned', undefined, true)).toMatchObject({ source: 'none', type: 'unsleeved' })
  })
  it('an explicit source wins over the default and over older fields', () => {
    expect(st('purchased', { source: 'none' }).source).toBe('none')
    expect(st('planned', { source: 'new', add: false }).source).toBe('new')
  })
  it('maps older edit fields onto Card source', () => {
    expect(st('planned', { add: true }).source).toBe('new')
    expect(st('built', { printing: 'add_this' }).source).toBe('new')
    expect(st('built', { move: { kind: 'skip' } }).source).toBe('new')
    expect(st('planned', { move: { kind: 'move', fromDeckId: 7 } }).source).toBe('collection')
    expect(st('planned', { printing: 'use_mine' }).source).toBe('collection')
    expect(st('purchased', { type: 'unsleeved' }).source).toBe('none')
    expect(st('purchased', { add: false, type: 'proxy' }).source).toBe('collection')
  })
  it('None is always Unsleeved; New / Collection keep the asked-for type', () => {
    expect(st('purchased', { source: 'none', type: 'proxy' })).toMatchObject({ type: 'unsleeved', wantedType: undefined })
    expect(st('purchased', { type: 'proxy' })).toMatchObject({ source: 'new', type: 'proxy', wantedType: 'proxy' })
    expect(st('built', { source: 'collection' }, true).wantedType).toBeUndefined()
  })
})

describe('plans by intent', () => {
  it('purchased: new sleeved copy, owned copies are not used', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free()])], 'purchased')
    expect(p).toMatchObject({ kind: 'add_sleeved', type: 'original' })
  })
  it('planned: owned shows owned_unsleeved, not owned shows unowned', () => {
    const r = row()
    expect(plan([r], [facts(r, [free()])], 'planned')[0].kind).toBe('owned_unsleeved')
    expect(plan([r], [facts(r)], 'planned')[0].kind).toBe('unowned')
  })
  it('planned: a card owned only in another deck counts as owned', () => {
    const r = row()
    expect(plan([r], [facts(r, [], [held(5)])], 'planned')[0].kind).toBe('owned_unsleeved')
  })
  it('built: a free exact copy is sleeved', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free()])], 'built')
    expect(p).toMatchObject({ kind: 'sleeve_owned', type: 'original', slotPrintingId: 'p-clb' })
    expect(p.ownedPrinting).toBeUndefined()
  })
  it('built: only a free proxy is sleeved as a proxy', () => {
    const r = row()
    expect(plan([r], [facts(r, [free({ isProxy: true })])], 'built')[0]).toMatchObject({ kind: 'sleeve_owned', type: 'proxy' })
  })
  it('built: not owned at all is None (unowned, not short)', () => {
    const r = row()
    const [p] = plan([r], [facts(r)], 'built')
    expect(p.kind).toBe('unowned')
    expect(p.short).toBeUndefined()
  })
  it('New on a built deck adds a new copy even if owned', () => {
    const r = row()
    expect(plan([r], [facts(r, [free()])], 'built', { k1: { 0: { source: 'new' } } })[0].kind).toBe('add_sleeved')
  })
  it('a proxy asked for under New is added as a proxy', () => {
    const r = row()
    expect(plan([r], [facts(r)], 'purchased', { k1: { 0: { type: 'proxy' } } })[0]).toMatchObject({ kind: 'add_sleeved', type: 'proxy' })
  })
  it('generic basics: no copy, sleeved by intent or by the owner', () => {
    const r = row({ cardName: 'Forest', printingGiven: false, isBasicLand: true })
    expect(plan([r], [], 'purchased')[0]).toMatchObject({ kind: 'generic', genericSleeved: true, type: 'original' })
    expect(plan([r], [], 'built')[0]).toMatchObject({ kind: 'generic', genericSleeved: true })
    expect(plan([r], [], 'planned')[0]).toMatchObject({ kind: 'generic', genericSleeved: false, type: 'unsleeved' })
    expect(plan([r], [], 'planned', { k1: { 0: { type: 'original' } } })[0].genericSleeved).toBe(true)
    expect(plan([r], [], 'purchased', { k1: { 0: { type: 'unsleeved' } } })[0].genericSleeved).toBe(false)
    // Card source does not apply to a generic basic.
    expect(plan([r], [], 'planned', { k1: { 0: { add: true, source: 'new' } } })[0].genericSleeved).toBe(false)
  })
  it('a basic that names a printing is an ordinary card', () => {
    const r = row({ cardName: 'Forest', printingGiven: true, isBasicLand: true })
    expect(plan([r], [], 'purchased')[0].kind).toBe('add_sleeved')
  })
  it('Original / Proxy are both open under New, closed under None, and follow what is owned under Collection', () => {
    const r = row()
    expect(plan([r], [facts(r)], 'purchased')[0]).toMatchObject({ canOriginal: true, canProxy: true })
    expect(plan([r], [facts(r)], 'built')[0]).toMatchObject({ canOriginal: false, canProxy: false })
    expect(plan([r], [facts(r, [free()])], 'built')[0]).toMatchObject({ canOriginal: true, canProxy: false })
    expect(plan([r], [facts(r, [], [held(7, { isProxy: true })])], 'built')[0]).toMatchObject({ canOriginal: false, canProxy: true })
  })
})

describe('allocation order (Collection)', () => {
  it('exact printing before another printing', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free(cmm), free()])], 'built')
    expect(p).toMatchObject({ kind: 'sleeve_owned', slotPrintingId: 'p-clb' })
    expect(p.ownedPrinting).toBeUndefined()
  })
  it('another printing is never chosen automatically; the owner picks it, and it is named', () => {
    const r = row()
    expect(plan([r], [facts(r, [free(cmm)])], 'built')[0].kind).toBe('needs_choice_move')
    const [p] = plan([r], [facts(r, [free(cmm)])], 'built', collection({ pick: { kind: 'spare' } }))
    expect(p).toMatchObject({ kind: 'sleeve_owned', slotPrintingId: 'p-cmm', ownedPrinting: cmm })
  })
  it('originals before proxies when no type is asked for', () => {
    const r = row()
    expect(plan([r], [facts(r, [free({ isProxy: true }), free()])], 'built')[0].type).toBe('original')
  })
  it('the exact printing comes first even when it is a proxy', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free({ ...cmm }), free({ isProxy: true })])], 'built')
    expect(p).toMatchObject({ type: 'proxy', slotPrintingId: 'p-clb' })
  })
  it('a type asked for is ignored under Collection: the owned copy keeps its own type', () => {
    const r = row()
    const fs = [facts(r, [free(), free({ ...cmm, isProxy: true })])]
    expect(plan([r], fs, 'built', collection({ type: 'proxy' }))[0]).toMatchObject({ kind: 'sleeve_owned', type: 'original' })
    expect(plan([r], [facts(r, [free(cmm)])], 'built', collection({ type: 'original', pick: { kind: 'spare' } }))[0]).toMatchObject({ kind: 'sleeve_owned' })
  })
  it('the wanted finish is preferred, any finish is used otherwise', () => {
    const r = row()
    const alloc = allocateOwnedCopies({ rows: [r], facts: [facts(r, [free({ finish: 'foil' }), free()])], intent: 'built', defaults })
    const src = alloc.k1[0].source
    expect(src.kind === 'free' && src.finish).toBe('nonfoil')
    const onlyFoil = allocateOwnedCopies({ rows: [r], facts: [facts(r, [free({ finish: 'foil' })])], intent: 'built', defaults })
    expect(onlyFoil.k1[0].source.kind).toBe('free')
  })
  it('free copies are used before copies held by other decks', () => {
    const r = row({ qty: 2 })
    const plans = plan([r], [facts(r, [free()], [held(7)])], 'built')
    expect(plans.map((p) => p.kind)).toEqual(['sleeve_owned', 'needs_choice_move'])
  })
  it('a free other printing is not auto-picked when the exact printing is held in another deck', () => {
    const r = row()
    expect(plan([r], [facts(r, [free(cmm)], [held(7)])], 'built')[0].kind).toBe('needs_choice_move')
  })
  it('one owned copy is used once, by the first row in import order; the next is short', () => {
    const a = row({ rowKey: 'a', sourceIndex: 1 })
    const b = row({ rowKey: 'b', sourceIndex: 2 })
    const plans = plan([b, a], [facts(a, [free()]), facts(b, [free()])], 'built')
    const byKey = Object.fromEntries(plans.map((p) => [p.rowKey, p]))
    expect(byKey.a.kind).toBe('sleeve_owned')
    expect(byKey.b).toMatchObject({ kind: 'owned_unsleeved', short: true })
  })
  it('canCollection turns off once every owned copy is taken', () => {
    const r = row({ qty: 2 })
    const alloc = allocateOwnedCopies({ rows: [r], facts: [facts(r, [free()])], intent: 'built', defaults })
    expect(alloc.k1[0].canCollection).toBe(true)
    expect(alloc.k1[1].canCollection).toBe(false)
    expect(alloc.k1[1].anyOwned).toBe(true)
  })
})

describe('moves, sources and short', () => {
  const pickEdits = (...picks: Array<IntentCopyOwnerEdits['pick']>): IntentCopyEdits => ({
    k1: Object.fromEntries(picks.map((pick, i) => [i, { source: 'collection' as const, pick }])),
  })
  it('a single holder deck is never auto-selected: it needs a choice, and picking it moves the copy', () => {
    const r = row()
    expect(plan([r], [facts(r, [], [held(7)])], 'built')[0].kind).toBe('needs_choice_move')
    const [p] = plan([r], [facts(r, [], [held(7)])], 'built', pickEdits({ kind: 'deck', deckId: 7 }))
    expect(p).toMatchObject({ kind: 'move', type: 'original', fromDeckId: 7, fromDeckName: 'Deck 7', slotPrintingId: 'p-clb', finish: 'nonfoil' })
  })
  it('a held other printing moves and names the printing', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [], [held(7, cmm)])], 'built', pickEdits({ kind: 'deck', deckId: 7 }))
    expect(p).toMatchObject({ kind: 'move', slotPrintingId: 'p-cmm', ownedPrinting: cmm })
  })
  it('several holder decks: unset, blocks as needs a choice', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [], [held(7), held(8)])], 'built')
    expect(p.kind).toBe('needs_choice_move')
    expect(needsChoice([p])).toHaveLength(1)
  })
  it('an explicit deck pick resolves it; an explicit "none" un-sets it even with a spare', () => {
    const r = row()
    const f = [facts(r, [free()], [held(7), held(8)])]
    expect(plan([r], f, 'built', pickEdits({ kind: 'deck', deckId: 8 }))[0]).toMatchObject({ kind: 'move', fromDeckId: 8 })
    expect(plan([r], f, 'built', pickEdits({ kind: 'none' }))[0].kind).toBe('needs_choice_move')
  })
  it('an explicit pick is reserved before an automatic one takes it', () => {
    const r = row({ qty: 2 })
    const f = [facts(r, [free()], [held(7)])]
    // Copy 0 is automatic (would take the spare); copy 1 explicitly wants the spare, so copy 0 is left to choose a deck.
    const plans = plan([r], f, 'built', { k1: { 0: { source: 'collection' }, 1: { source: 'collection', pick: { kind: 'spare' } } } })
    expect(plans.map((p) => p.kind)).toEqual(['needs_choice_move', 'sleeve_owned'])
  })
  it('an explicit pick that cannot be met is short, never swapped', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free()])], 'built', pickEdits({ kind: 'deck', deckId: 9 }))
    expect(p).toMatchObject({ short: true })
  })
  it('the exact finish asked for is the one planned; the copy keeps its own Original/Proxy', () => {
    const r = row({ copies: [{ index: 0, sourceLine: 1, file: { finish: 'foil' }, owner: {} }] })
    const f = [facts(r, [free(), free({ finish: 'foil' })])]
    expect(plan([r], f, 'built')[0]).toMatchObject({ kind: 'sleeve_owned', finish: 'foil', type: 'original' })
    const proxyOnly = [facts(r, [free({ finish: 'foil', isProxy: true })])]
    expect(plan([r], proxyOnly, 'built')[0]).toMatchObject({ kind: 'sleeve_owned', finish: 'foil', type: 'proxy' })
  })
  it('ignore basic lands: the six names are never pulled; Snow-Covered and other cards still are', () => {
    const mk = (cardName: string) => row({ cardName, oracleId: `o-${cardName}` })
    const run = (cardName: string, ignoreBasics: boolean) => {
      const r = mk(cardName)
      return planImport({ rows: [r], facts: [facts(r, [], [held(7)])], intent: 'built', defaults, ignoreBasics })[0]
    }
    expect(run('Forest', true)).toMatchObject({ kind: 'add_sleeved' })
    expect(run('Wastes', true)).toMatchObject({ kind: 'add_sleeved' })
    expect(run('Forest', false).kind).toBe('needs_choice_move')
    expect(run('Snow-Covered Forest', true).kind).toBe('needs_choice_move')
  })
  it('3 Mountain with 2 owned: copies 1-2 sleeved, copy 3 short (owned, nothing left)', () => {
    const r = row({ cardName: 'Mountain', oracleId: 'o-mtn', qty: 3 })
    const plans = plan([r], [facts(r, [free({ count: 2 })])], 'built')
    expect(plans.map((p) => p.kind)).toEqual(['sleeve_owned', 'sleeve_owned', 'owned_unsleeved'])
    expect(plans.map((p) => !!p.short)).toEqual([false, false, true])
  })
  it('Collection asked for a card not owned at all is short and unowned', () => {
    const r = row()
    expect(plan([r], [facts(r)], 'planned', collection())[0]).toMatchObject({ kind: 'unowned', short: true })
  })
})

describe('coerceIntentEdit', () => {
  const ctx: CoerceContext = {
    cardName: 'Sol Ring',
    source: 'none',
    effectiveType: 'unsleeved',
    canCollection: false,
    canOriginal: false,
    canProxy: false,
  }
  it('drops the older add / move / printing fields', () => {
    const r = coerceIntentEdit(
      { add: true, move: { kind: 'skip' }, printing: 'add_this', finish: 'foil' },
      { type: 'proxy' },
      { ...ctx, source: 'new', effectiveType: 'original', canOriginal: true, canProxy: true }
    )
    expect(r.edit).toEqual({ source: 'new', type: 'proxy', finish: 'foil' })
  })
  it('refuses Collection when none is left, and says so', () => {
    const r = coerceIntentEdit({ source: 'new' }, { source: 'collection' }, ctx)
    expect(r.edit).toEqual({ source: 'new' })
    expect(r.message).toBe('Sol Ring: none left in your collection.')
  })
  it('None clears the type', () => {
    const r = coerceIntentEdit({ source: 'new', type: 'proxy' }, { source: 'none' }, { ...ctx, source: 'new', effectiveType: 'proxy' })
    expect(r.edit).toEqual({ source: 'none' })
    expect(r.edit.type).toBeUndefined()
  })
  it('New keeps an asked-for type, else the shown type, else Original', () => {
    expect(coerceIntentEdit({ type: 'proxy' }, { source: 'new' }, { ...ctx, source: 'collection' }).edit).toEqual({ source: 'new', type: 'proxy' })
    expect(coerceIntentEdit({}, { source: 'new' }, { ...ctx, source: 'collection', effectiveType: 'proxy' }).edit).toEqual({ source: 'new', type: 'proxy' })
    expect(coerceIntentEdit({}, { source: 'new' }, ctx).edit).toEqual({ source: 'new', type: 'original' })
  })
  it('Collection drops any asked-for type: the pulled copy keeps its own', () => {
    const base = { ...ctx, source: 'new' as const, effectiveType: 'proxy' as const, canCollection: true }
    expect(coerceIntentEdit({ source: 'new', type: 'proxy' }, { source: 'collection' }, { ...base, canOriginal: true, canProxy: true }).edit)
      .toEqual({ source: 'collection' })
  })
  it('switching away from Collection clears the source pick', () => {
    const r = coerceIntentEdit({ source: 'collection', pick: { kind: 'spare' } }, { source: 'new' }, { ...ctx, source: 'collection' })
    expect(r.edit.pick).toBeUndefined()
  })
  it('refuses a type change under None, silently', () => {
    const r = coerceIntentEdit({ source: 'none' }, { type: 'original' }, ctx)
    expect(r.edit).toEqual({ source: 'none' })
    expect(r.message).toBeUndefined()
  })
  it('refuses a type change under Collection (the owned copy keeps its own)', () => {
    const r = coerceIntentEdit({}, { type: 'proxy' }, { ...ctx, source: 'collection', canCollection: true, canProxy: true })
    expect(r.edit).toEqual({})
  })
  it('allows any type under New', () => {
    expect(coerceIntentEdit({}, { type: 'proxy' }, { ...ctx, source: 'new', canOriginal: true, canProxy: true }).edit)
      .toEqual({ source: 'new', type: 'proxy' })
  })
  it('a short copy (no source shown) cannot take a type until a source is picked', () => {
    expect(coerceIntentEdit({}, { type: 'original' }, { ...ctx, source: null }).edit).toEqual({})
  })
  it('a generic basic takes only the Sleeved switch', () => {
    expect(coerceIntentEdit({}, { add: true, source: 'new' }, { ...ctx, isGeneric: true }).edit).toEqual({})
    expect(coerceIntentEdit({}, { type: 'unsleeved' }, { ...ctx, isGeneric: true }).edit).toEqual({ type: 'unsleeved' })
  })
})

describe('summary', () => {
  it('counts add up to the total and omit zeros', () => {
    const r1 = row({ rowKey: 'a', sourceIndex: 1 })
    const r2 = row({ rowKey: 'b', sourceIndex: 2, oracleId: 'o2', cardName: 'Arcane Signet' })
    const r3 = row({ rowKey: 'c', sourceIndex: 3, oracleId: 'o3', cardName: 'Island', isBasicLand: true, printingGiven: false })
    const s = summariseImportPlan(plan([r1, r2, r3], [facts(r1, [free()]), facts(r2)], 'built'))
    expect(s).toMatchObject({ cards: 3, sleevedFromCollection: 1, unowned: 1, genericBasics: 1, added: 0, needChoice: 0 })
    const sum = s.added + s.sleevedFromCollection + s.moved + s.unsleeved + s.unowned + s.needChoice + s.genericBasics
    expect(sum).toBe(s.cards)
    expect(summaryText(s)).toBe('1 from your collection · 1 not in deck · 1 generic basics')
  })
  it('purchased: everything new', () => {
    const r = row({ qty: 2 })
    const s = summariseImportPlan(plan([r], [facts(r)], 'purchased', { k1: { 1: { type: 'proxy' } } }))
    expect(s).toMatchObject({ added: 2, addedProxies: 1 })
    expect(summaryText(s)).toBe('2 new')
  })
  it('a moved copy counts as from your collection and as taken from another deck', () => {
    const r = row()
    const s = summariseImportPlan(plan([r], [facts(r, [], [held(7)])], 'built', { k1: { 0: { source: 'collection', pick: { kind: 'deck', deckId: 7 } } } }))
    expect(s).toMatchObject({ sleevedFromCollection: 1, moved: 1 })
    expect(summaryText(s)).toBe('1 from your collection · 1 taken from other decks')
  })
  it('a short copy counts as needing a choice and blocks', () => {
    const r = row({ qty: 2 })
    const plans = plan([r], [facts(r, [free()])], 'built')
    const s = summariseImportPlan(plans)
    expect(s).toMatchObject({ sleevedFromCollection: 1, needChoice: 1, unsleeved: 0 })
    expect(summaryText(s)).toBe('1 from your collection · 1 short')
    expect(needsChoice(plans)).toEqual([plans[1]])
  })
})

describe('deckBreakdown / breakdownLine', () => {
  const base = { rowKey: 'k', copyIndex: 0, slotPrintingId: 'p', canOriginal: true, canProxy: true }
  const plans = [
    { ...base, kind: 'sleeve_owned', type: 'original' },
    { ...base, kind: 'move', type: 'original', fromDeckId: 7 },
    { ...base, kind: 'generic', type: 'original', genericSleeved: true },
    { ...base, kind: 'generic', type: 'unsleeved', genericSleeved: false },
    { ...base, kind: 'add_sleeved', type: 'proxy' },
    { ...base, kind: 'owned_unsleeved', type: 'unsleeved' },
    { ...base, kind: 'unowned', type: 'unsleeved' },
    { ...base, kind: 'owned_unsleeved', type: 'unsleeved', short: true },
  ] as CopyPlan[]
  it('splits copies by card source; collection + new + not in deck + short = all', () => {
    const b = deckBreakdown(plans)
    expect(b).toEqual({ collection: 3, new: 1, notInDeck: 3, shared: 1, short: 1 })
    expect(b.collection + b.new + b.notInDeck + b.short).toBe(plans.length)
  })
  it('the line under the list omits zeros; the maybeboard has its own line', () => {
    expect(breakdownLine(deckBreakdown(plans), 'all')).toBe('3 from collection · 1 new · 3 not in deck · 1 taken from other decks · 1 short')
    expect(breakdownLine({ collection: 0, new: 2, notInDeck: 0, shared: 0, short: 0 }, 'all')).toBe('2 new')
    expect(breakdownLine(deckBreakdown(plans), 'maybeboard')).toBe('Maybeboard cards are not added to your collection or sleeved.')
  })
})

describe('intentChoiceStats', () => {
  const owned = row({ rowKey: 'a', sourceIndex: 1, oracleId: 'oa', cardName: 'A' })
  const shared = row({ rowKey: 'b', sourceIndex: 2, oracleId: 'ob', cardName: 'B' })
  const missing = row({ rowKey: 'c', sourceIndex: 3, oracleId: 'oc', cardName: 'C' })
  const basic = row({ rowKey: 'd', sourceIndex: 4, oracleId: 'od', cardName: 'Forest', isBasicLand: true, printingGiven: false, qty: 5 })
  const rows = [owned, shared, missing, basic]
  const fs = [facts(owned, [free()]), facts(shared, [], [held(7)]), facts(missing)]

  it('gives real numbers per option, leaving generic basics out', () => {
    const s = intentChoiceStats({ rows, facts: fs, defaults })
    expect(s.byIntent).toEqual({
      purchased: '3 new copies · you already own another copy of 2 of them',
      built: "1 from collection · 1 taken from other decks · 1 not in deck (you don't own them)",
      planned: '3 not in deck · you own 2 of them',
    })
    expect(s.headline).toBe('You own 2 of the 3 cards. 1 of those is in other decks.')
  })
  it('suggests built when the owner has at least half the cards', () => {
    const s = intentChoiceStats({ rows, facts: fs, defaults })
    expect(s).toMatchObject({ suggested: 'built', reason: 'suggested: you own most of these cards' })
    const half = intentChoiceStats({ rows: [owned, missing], facts: [facts(owned, [free()]), facts(missing)], defaults })
    expect(half.suggested).toBe('built')
  })
  it('suggests planned when the owner has less than half', () => {
    const s = intentChoiceStats({ rows: [owned, shared, missing], facts: [facts(owned, [free()])], defaults })
    expect(s).toMatchObject({ suggested: 'planned', reason: "suggested: you don't own most of these cards" })
    expect(s.headline).toBe('You own 1 of the 3 cards.')
    expect(s.byIntent.built).toBe("1 from collection · 2 not in deck (you don't own them)")
  })
  it('nothing owned: no "you own" notes; an empty deck suggests planned', () => {
    const s = intentChoiceStats({ rows: [missing], facts: [facts(missing)], defaults })
    expect(s.byIntent.purchased).toBe('1 new copy')
    expect(s.byIntent.planned).toBe('1 not in deck')
    expect(s.headline).toBe('You own 0 of the 1 card.')
    expect(intentChoiceStats({ rows: [basic], facts: [], defaults }).suggested).toBe('planned')
  })
  it('a precon suggests "I bought it" whatever is owned', () => {
    const s = intentChoiceStats({ rows, facts: fs, defaults }, { precon: true })
    expect(s).toMatchObject({ suggested: 'purchased', reason: 'suggested for a precon' })
  })
})

describe('normalizedDeckToPreview (links)', () => {
  const card = (name: string, id: string, qty: number, extra: Record<string, unknown> = {}) => ({
    cardName: name, scryfallId: id, oracleId: `o-${id}`, setCode: 'clb', quantity: qty, typeLine: '',
    isCommander: false, isProxy: false, manaCost: null, colorIdentity: [], sourceCategories: [], ...extra,
  })
  const deck = {
    name: 'My Deck', platform: 'archidekt', platformDeckId: '1', sourceUrl: 'u',
    commander: card('Korvold', 'k', 1, { isCommander: true }),
    cards: [card('Korvold', 'k', 1), card('Sol Ring', 's', 1, { isProxy: true, collectorNumber: '351' }), card('Forest', 'f', 3)],
    maybeboard: [card('Counterspell', 'c', 2)],
    cardCount: 5, colourIdentity: 'BRG',
  } as unknown as NormalizedDeck
  it('builds link rows with empty file values and ignores the Proxy flag', () => {
    const { preview, commander, maybeboardNotImported, notice } = normalizedDeckToPreview(deck)
    expect(preview.rows.map((r) => r.rowKey)).toEqual(['k|link', 's|link', 'f|link'])
    expect(preview.rows[2].qty).toBe(3)
    expect(preview.rows[2].copies.map((c) => c.index)).toEqual([0, 1, 2])
    expect(preview.rows[1].copies[0]).toMatchObject({ file: {}, owner: {} })
    expect(preview.rows[1].collectorNumber).toBe('351')
    expect(commander).toEqual({ name: 'Korvold', scryfallId: 'k' })
    expect(maybeboardNotImported).toBe(2)
    expect(notice).toBe("2 maybeboard cards weren't imported")
  })
  it('has no notice without a maybeboard', () => {
    expect(normalizedDeckToPreview({ ...deck, maybeboard: undefined } as NormalizedDeck).notice).toBeNull()
  })
})

describe('file Proxy marker sets the starting type (D-055)', () => {
  const proxyRow = () => {
    const r = row()
    r.copies = [{ index: 0, sourceLine: 1, file: { proxy: true }, owner: {} }]
    return r
  }
  const state = (r: ImportRow, intent: ImportIntent, edits?: IntentCopyEdits) =>
    effectiveCopyState(r.copies[0], r, intent, edits, INITIAL_IMPORT_DEFAULTS)
  it('purchased: a file-proxy copy starts as Proxy', () => {
    expect(state(proxyRow(), 'purchased').type).toBe('proxy')
  })
  it('purchased: no marker stays Original', () => {
    expect(state(row(), 'purchased').type).toBe('original')
  })
  it("purchased: the owner's Original choice beats the file", () => {
    expect(state(proxyRow(), 'purchased', { k1: { 0: { type: 'original' } } }).type).toBe('original')
  })
  it('planned: stays unsleeved when the card source is None', () => {
    expect(state(proxyRow(), 'planned').type).toBe('unsleeved')
  })
})
