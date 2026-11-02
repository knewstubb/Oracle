import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseManaBoxCsv } from '@/lib/manabox-import'
import { describe, it, expect } from 'vitest'
import type { ImportRow, ImportFinish, ImportDefaults } from '../../docs/oracle/contracts/import-row-editing.types'
import { INITIAL_IMPORT_DEFAULTS } from '../../docs/oracle/contracts/import-row-editing.types'
import type {
  HeldCopyGroup,
  ImportIntent,
  IntentCopyEdits,
  OwnedCopyGroup,
  OwnershipRowFacts,
} from '../../docs/oracle/contracts/import-intent.types'
import type { NormalizedDeck } from '@/lib/deck-normalizer'
import {
  allocateOwnedCopies,
  coerceIntentEdit,
  defaultsForIntent,
  needsChoice,
  normalizedDeckToPreview,
  planImport,
  rowIntentTags,
  summariseImportPlan,
  summaryText,
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

describe('defaultsForIntent', () => {
  it('purchased adds originals, sleeved generics', () => {
    expect(defaultsForIntent('purchased')).toEqual({ add: true, type: 'original', genericSleeved: true })
  })
  it('built adds nothing, original by match, sleeved generics', () => {
    expect(defaultsForIntent('built')).toEqual({ add: false, type: 'original', genericSleeved: true })
  })
  it('planned adds nothing, unsleeved, unsleeved generics', () => {
    expect(defaultsForIntent('planned')).toEqual({ add: false, type: 'unsleeved', genericSleeved: false })
  })
})

describe('plans by intent', () => {
  it('purchased: new sleeved copy, no matching used even if owned', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free()])], 'purchased')
    expect(p.kind).toBe('add_sleeved')
    expect(p.type).toBe('original')
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
  it('built: free exact copy is sleeved', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free()])], 'built')
    expect(p.kind).toBe('sleeve_owned')
    expect(p.type).toBe('original')
    expect(p.ownedPrinting).toBeUndefined()
  })
  it('built: only a free proxy is sleeved as a proxy', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free({ isProxy: true })])], 'built')
    expect(p.kind).toBe('sleeve_owned')
    expect(p.type).toBe('proxy')
  })
  it('built: free original is preferred over free proxy', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free({ isProxy: true }), free()])], 'built')
    expect(p.type).toBe('original')
  })
  it('built: prefers the same finish, then any finish', () => {
    const r = row()
    const fs = [facts(r, [free({ finish: 'foil' }), free({ finish: 'nonfoil' })])]
    const alloc = allocateOwnedCopies({ rows: [r], facts: fs, intent: 'built', defaults })
    const src = alloc.k1[0].source
    expect(src.kind === 'free' && src.finish).toBe('nonfoil')
    const onlyFoil = allocateOwnedCopies({ rows: [r], facts: [facts(r, [free({ finish: 'foil' })])], intent: 'built', defaults })
    expect(onlyFoil.k1[0].source.kind).toBe('free')
  })
  it('built: not owned is unowned', () => {
    const r = row()
    expect(plan([r], [facts(r)], 'built')[0].kind).toBe('unowned')
  })
})

describe('matching order', () => {
  it('other printing free defaults to using the owned printing, naming it', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free({ printingId: 'p-cmm', setCode: 'cmm', collectorNumber: '410' })])], 'built')
    expect(p.kind).toBe('sleeve_owned')
    expect(p.ownedPrinting?.setCode).toBe('cmm')
  })
  it('Use my printing sleeves the owned copy and shows what was really sleeved', () => {
    const r = row()
    const f = [facts(r, [free({ printingId: 'p-cmm', setCode: 'cmm', collectorNumber: '410' })])]
    const [p] = plan([r], f, 'built', { k1: { 0: { printing: 'use_mine' } } })
    expect(p.kind).toBe('sleeve_owned')
    expect(p.slotPrintingId).toBe('p-cmm')
    expect(p.ownedPrinting?.collectorNumber).toBe('410')
  })
  it('Add this printing implies Add and leaves the owned copy untouched', () => {
    const r = row()
    const f = [facts(r, [free({ printingId: 'p-cmm' })])]
    const [p] = plan([r], f, 'built', { k1: { 0: { printing: 'add_this' } } })
    expect(p.kind).toBe('add_sleeved')
    expect(p.slotPrintingId).toBe('p-clb')
  })
  it('free is used before another deck is disturbed', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free()], [held(7)])], 'built')
    expect(p.kind).toBe('sleeve_owned')
  })
  it('held in exactly one deck: the move is pre-selected', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [], [held(7)])], 'built')
    expect(p.kind).toBe('move')
    expect(p.fromDeckId).toBe(7)
  })
  it('held in several decks: needs a choice until one is picked', () => {
    const r = row()
    const f = [facts(r, [], [held(7), held(8)])]
    expect(plan([r], f, 'built')[0].kind).toBe('needs_choice_move')
    const [m] = plan([r], f, 'built', { k1: { 0: { move: { kind: 'move', fromDeckId: 8 } } } })
    expect(m.kind).toBe('move')
    expect(m.fromDeckId).toBe(8)
  })
  it('a move from a deck that does not hold the card is ignored (needs a choice)', () => {
    const r = row()
    const f = [facts(r, [], [held(7), held(8)])]
    expect(plan([r], f, 'built', { k1: { 0: { move: { kind: 'move', fromDeckId: 99 } } } })[0].kind).toBe('needs_choice_move')
  })
  it('Skip adds a new copy and alerts ALL holder decks (owner answer, Q1)', () => {
    const r = row()
    const f = [facts(r, [], [held(7), held(8), held(9)])]
    const [p] = plan([r], f, 'built', { k1: { 0: { move: { kind: 'skip' } } } })
    expect(p.kind).toBe('move_skipped')
    expect(p.alertDeckIds).toEqual([7, 8, 9])
  })
  it('skip with a single holder alerts that deck', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [], [held(7)])], 'built', { k1: { 0: { move: { kind: 'skip' } } } })
    expect(p.alertDeckIds).toEqual([7])
  })
  it('other printing held elsewhere defaults to a move on that printing', () => {
    const r = row()
    const f = [facts(r, [], [held(7, { printingId: 'p-cmm', setCode: 'cmm', collectorNumber: '410' })])]
    const [p] = plan([r], f, 'built')
    expect(p.kind).toBe('move')
    expect(p.slotPrintingId).toBe('p-cmm')
  })
  it('3 Mountain with 2 owned: copies 1-2 sleeve owned, copy 3 unowned', () => {
    const r = row({ cardName: 'Mountain', oracleId: 'o-mtn', qty: 3 })
    const plans = plan([r], [facts(r, [free({ count: 2 })])], 'built')
    expect(plans.map((p) => p.kind)).toEqual(['sleeve_owned', 'sleeve_owned', 'unowned'])
  })
  it('one owned copy is used once, by the first row in import order', () => {
    const a = row({ rowKey: 'a', sourceIndex: 1 })
    const b = row({ rowKey: 'b', sourceIndex: 2 })
    const fs = [facts(a, [free()]), facts(b, [free()])]
    const plans = plan([b, a], fs, 'built')
    const byKey = Object.fromEntries(plans.map((p) => [p.rowKey, p.kind]))
    expect(byKey).toEqual({ a: 'sleeve_owned', b: 'unowned' })
  })
  it('a proxy chosen only takes free proxies', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free()])], 'built', { k1: { 0: { type: 'proxy' } } })
    expect(p.kind).toBe('unowned')
  })
})

describe('Add tick and types', () => {
  it('Add ticked on built: new sleeved copy even if owned', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free()])], 'built', { k1: { 0: { add: true } } })
    expect(p.kind).toBe('add_sleeved')
  })
  it('Add ticked with Unsleeved: added, not sleeved', () => {
    const r = row()
    const [p] = plan([r], [facts(r)], 'planned', { k1: { 0: { add: true } } })
    expect(p.kind).toBe('add_unsleeved')
  })
  it('purchased with Add unticked behaves like built for that copy', () => {
    const r = row()
    const [p] = plan([r], [facts(r, [free()])], 'purchased', { k1: { 0: { add: false } } })
    expect(p.kind).toBe('sleeve_owned')
  })
  it('Add on a generic basic is ignored; sleeved by intent', () => {
    const r = row({ cardName: 'Forest', printingGiven: false, isBasicLand: true })
    const e = { k1: { 0: { add: true } } }
    expect(plan([r], [], 'purchased', e)[0]).toMatchObject({ kind: 'generic', genericSleeved: true })
    expect(plan([r], [], 'planned', e)[0]).toMatchObject({ kind: 'generic', genericSleeved: false })
    expect(plan([r], [], 'built')[0]).toMatchObject({ genericSleeved: true })
  })
  it('a basic that names a printing is an ordinary card', () => {
    const r = row({ cardName: 'Forest', printingGiven: true, isBasicLand: true })
    expect(plan([r], [], 'purchased')[0].kind).toBe('add_sleeved')
  })
  it('canOriginal / canProxy are off when Add is unticked and nothing is free', () => {
    const r = row()
    const [p] = plan([r], [facts(r)], 'built')
    expect(p.canOriginal).toBe(false)
    expect(p.canProxy).toBe(false)
    const [q] = plan([r], [facts(r, [free()])], 'built')
    expect(q.canOriginal).toBe(true)
    expect(q.canProxy).toBe(false)
    const [t] = plan([r], [facts(r)], 'purchased')
    expect(t.canOriginal && t.canProxy).toBe(true)
  })
})

describe('coerceIntentEdit', () => {
  const ctx = { cardName: 'Sol Ring', effectiveType: 'original' as const, effectiveAdd: false, anyOwned: false, canOriginal: false, canProxy: false }
  it('ticking Add on an Unsleeved copy makes it Original', () => {
    expect(coerceIntentEdit({}, { add: true }, { ...ctx, effectiveType: 'unsleeved' }).edit).toEqual({ add: true, type: 'original' })
  })
  it('unticking Add with nothing owned makes it Unsleeved and says so', () => {
    const r = coerceIntentEdit({}, { add: false }, { ...ctx, effectiveAdd: true })
    expect(r.edit).toEqual({ add: false, type: 'unsleeved' })
    expect(r.message).toBe('Sol Ring: left unsleeved.')
  })
  it('unticking Add keeps the type when something is owned', () => {
    expect(coerceIntentEdit({}, { add: false }, { ...ctx, effectiveAdd: true, anyOwned: true }).edit).toEqual({ add: false })
  })
  it('refuses Original when not owned and Add is off', () => {
    const r = coerceIntentEdit({}, { type: 'original' }, ctx)
    expect(r.edit).toEqual({})
    expect(r.message).toBe('Not owned: tick Add')
  })
  it('refuses Proxy with no free copy', () => {
    expect(coerceIntentEdit({}, { type: 'proxy' }, { ...ctx, anyOwned: true, canOriginal: true }).message).toBe('No free copy: tick Add')
  })
  it('Add this printing ticks Add', () => {
    expect(coerceIntentEdit({}, { printing: 'add_this' }, ctx).edit).toMatchObject({ add: true, printing: 'add_this' })
  })
  it('ignores Add on a generic basic', () => {
    expect(coerceIntentEdit({}, { add: true }, { ...ctx, isGeneric: true }).edit).toEqual({})
  })
})

describe('summary', () => {
  it('counts add up to the total and omit zeros', () => {
    const r1 = row({ rowKey: 'a', sourceIndex: 1 })
    const r2 = row({ rowKey: 'b', sourceIndex: 2, oracleId: 'o2', cardName: 'Arcane Signet' })
    const r3 = row({ rowKey: 'c', sourceIndex: 3, oracleId: 'o3', cardName: 'Island', isBasicLand: true, printingGiven: false })
    const plans = plan([r1, r2, r3], [facts(r1, [free()]), facts(r2)], 'built')
    const s = summariseImportPlan(plans)
    expect(s).toMatchObject({ cards: 3, sleevedFromCollection: 1, unowned: 1, genericBasics: 1, added: 0 })
    const sum = s.added + s.sleevedFromCollection + s.moved + s.unsleeved + s.unowned + s.needChoice + s.genericBasics
    expect(sum).toBe(s.cards)
    const text = summaryText(s)
    expect(text).toBe('3 cards: Nothing added to your collection · 1 to sleeve from your collection · ⊖ 1 unowned · 1 generic basics')
    expect(text).not.toContain(' 0 ')
  })
  it('purchased summary with proxies and skip alerts', () => {
    const r = row({ qty: 2 })
    const plans = plan([r], [facts(r)], 'purchased', { k1: { 1: { type: 'proxy' } } })
    expect(summaryText(summariseImportPlan(plans))).toBe('2 cards: 2 added to your collection (1 proxies)')
    const s = summariseImportPlan(plan([r], [facts(r, [], [held(7), held(8)])], 'built', { k1: { 0: { move: { kind: 'skip' } }, 1: { move: { kind: 'skip' } } } }))
    expect(s.alertsOnOtherDecks).toBe(4)
  })
  it('needsChoice lists the blocking copies', () => {
    const r = row()
    const plans = plan([r], [facts(r, [], [held(7), held(8)])], 'built')
    expect(needsChoice(plans)).toHaveLength(1)
    expect(summariseImportPlan(plans).needChoice).toBe(1)
  })
})

describe('rowIntentTags', () => {
  it('shows counts only when partial, in a fixed order', () => {
    const r = row({ qty: 3, cardName: 'Mountain', oracleId: 'o-m' })
    const plans = plan([r], [facts(r, [free({ count: 2 })])], 'built')
    expect(rowIntentTags(plans)).toEqual([
      { label: 'Owned copy', count: 2, all: false, tone: 'neutral' },
      { label: 'Unowned', count: 1, all: false, tone: 'unowned' },
    ])
  })
  it('all copies the same: no count; other printing is just an owned copy', () => {
    const r = row()
    const t = rowIntentTags(plan([r], [facts(r, [free({ printingId: 'p-x' })])], 'built'))
    expect(t.map((x) => x.label)).toEqual(['Owned copy'])
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

// keep the finish type import used
const _f: ImportFinish = 'nonfoil'
void _f

describe('file Proxy marker sets the starting type (D-055)', () => {
  const proxyRow = (over: Partial<ImportRow> = {}) => {
    const r = row(over)
    r.copies = [{ index: 0, sourceLine: 1, file: { proxy: true }, owner: {} }]
    return r
  }
  it('purchased: a file-proxy copy is added as a proxy', () => {
    const [p] = plan([proxyRow()], [], 'purchased')
    expect(p.kind).toBe('add_sleeved')
    expect(p.type).toBe('proxy')
  })
  it('purchased: no marker stays original', () => {
    const [p] = plan([row()], [], 'purchased')
    expect(p.type).toBe('original')
  })
  it('purchased: the owner choosing Original beats the file', () => {
    const r = proxyRow()
    const [p] = plan([r], [], 'purchased', { k1: { 0: { type: 'original' } } })
    expect(p.type).toBe('original')
  })
  it('built: a file-proxy copy looks for an owned proxy', () => {
    const r = proxyRow()
    const [p] = plan([r], [facts(r, [free({ isProxy: true })])], 'built')
    expect(p.kind).toBe('sleeve_owned')
    expect(p.type).toBe('proxy')
  })
  it('planned: stays unsleeved until Add is ticked, then adds as a proxy', () => {
    const r = proxyRow()
    expect(plan([r], [facts(r)], 'planned')[0].kind).toBe('unowned')
    const [p] = plan([r], [facts(r)], 'planned', { k1: { 0: { add: true } } })
    expect(p.kind).toBe('add_sleeved')
    expect(p.type).toBe('proxy')
  })
  it('rocco.csv: 6 proxies of 100 under "I bought it", preview equals summary', () => {
    const csv = readFileSync(
      join(__dirname, '../../tests/fixtures/rocco.csv'),
      'utf8'
    )
    const { records } = parseManaBoxCsv(csv)
    const rows = records.map((rec, i) => {
      const qty = rec.row.quantity
      const r = row({ rowKey: `k${i}`, sourceIndex: i, oracleId: `o${i}`, qty })
      r.copies = Array.from({ length: qty }, (_, c) => ({ index: c, sourceLine: i, file: rec.row.proxy === true ? { proxy: true } : {}, owner: {} }))
      return r
    })
    const plans = planImport({ rows, facts: [], intent: 'purchased', defaults })
    const s = summariseImportPlan(plans)
    expect(plans).toHaveLength(100)
    expect(s.addedProxies).toBe(6)
    expect(summaryText(s)).toContain('(6 proxies)')
  })
})
