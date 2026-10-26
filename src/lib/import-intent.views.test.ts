import { describe, it, expect } from 'vitest'
import type { ImportRow, ImportDefaults } from '../../docs/oracle/contracts/import-row-editing.types'
import { INITIAL_IMPORT_DEFAULTS } from '../../docs/oracle/contracts/import-row-editing.types'
import type {
  HeldCopyGroup,
  ImportIntent,
  IntentCopyEdits,
  OwnedCopyGroup,
  OwnershipRowFacts,
} from '../../docs/oracle/contracts/import-intent.types'
import {
  applyIntentChange,
  hasUntickedAdd,
  intentCopyViews,
  planImportDetailed,
  setIntentEdit,
  stripIntentFields,
  type IntentCopyView,
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
const free = (over: Partial<OwnedCopyGroup> = {}): OwnedCopyGroup => ({
  printingId: 'p-clb', setCode: 'clb', collectorNumber: '351', finish: 'nonfoil', isProxy: false, count: 1, ...over,
})
const held = (deckId: number, over: Partial<HeldCopyGroup> = {}): HeldCopyGroup => ({
  ...free(), deckId, deckName: `Deck ${deckId}`, ...over,
})
const facts = (r: ImportRow, f: OwnedCopyGroup[] = [], h: HeldCopyGroup[] = []): OwnershipRowFacts => ({
  rowKey: r.rowKey, oracleId: r.oracleId, free: f, held: h,
})

function views(r: ImportRow, fs: OwnershipRowFacts[], intent: ImportIntent, edits?: IntentCopyEdits) {
  const { plans, allocation } = planImportDetailed({ rows: [r], facts: fs, edits, intent, defaults })
  return intentCopyViews([r], plans, allocation, edits, intent, defaults)[r.rowKey]
}

describe('intentCopyViews: Add tick defaults', () => {
  it('purchased starts ticked, built and planned start unticked', () => {
    const r = row()
    expect(views(r, [facts(r)], 'purchased')[0].add).toBe(true)
    expect(views(r, [facts(r)], 'built')[0].add).toBe(false)
    expect(views(r, [facts(r)], 'planned')[0].add).toBe(false)
  })
  it('generic basics have no Add tick', () => {
    const r = row({ cardName: 'Island', isBasicLand: true, printingGiven: false })
    expect(views(r, [], 'purchased')[0].generic).toBe(true)
    expect(hasUntickedAdd({ k1: views(r, [], 'built') })).toBe(false)
  })
  it('hasUntickedAdd sees built and planned cards but not a purchased deck', () => {
    const r = row()
    expect(hasUntickedAdd({ k1: views(r, [facts(r)], 'purchased') })).toBe(false)
    expect(hasUntickedAdd({ k1: views(r, [facts(r)], 'built') })).toBe(true)
  })
})

describe('Original / Proxy availability', () => {
  it('not owned and Add unticked: Original and Proxy are off, copy shows Unsleeved', () => {
    const r = row()
    const [v] = views(r, [facts(r)], 'built')
    expect(v).toMatchObject({ canOriginal: false, canProxy: false, type: 'unsleeved', anyOwned: false })
  })
  it('a free original but no free proxy: Original on, Proxy off', () => {
    const r = row()
    expect(views(r, [facts(r, [free()])], 'built')[0]).toMatchObject({ canOriginal: true, canProxy: false })
  })
  it('ticking Add switches both on', () => {
    const r = row()
    const [v] = views(r, [facts(r)], 'built', { k1: { 0: { add: true } } })
    expect(v).toMatchObject({ add: true, canOriginal: true, canProxy: true })
  })
  it('a blocked click changes nothing and says why (rows with several copies, where the tick is shown)', () => {
    const r = row({ qty: 2 })
    const [v] = views(r, [facts(r)], 'built')
    expect(v.multi).toBe(true)
    const res = applyIntentChange({}, 'k1', 'Sol Ring', v, { type: 'proxy' })
    expect(res.edits).toEqual({})
    expect(res.message).toBe('Not owned: tick Add')
    const [owned] = views(r, [facts(r, [free()])], 'built')
    expect(applyIntentChange({}, 'k1', 'Sol Ring', { ...owned, canProxy: false, anyOwned: true, add: false }, { type: 'proxy' }).message).toBe('No free copy: tick Add')
  })
  it('single-copy row (no tick shown): Proxy/Original imply Add; Unowned implies not added', () => {
    const r = row()
    const [v] = views(r, [facts(r)], 'built')
    expect(v.multi).toBe(false)
    const proxy = applyIntentChange({}, 'k1', 'Sol Ring', v, { type: 'proxy' })
    expect(proxy.edits.k1[0]).toEqual({ add: true, type: 'proxy' })
    expect(proxy.message).toBeUndefined()
    const [p] = views(r, [facts(r)], 'purchased')
    const off = applyIntentChange({}, 'k1', 'Sol Ring', p, { type: 'unsleeved' })
    expect(off.edits.k1[0]).toEqual({ add: false, type: 'unsleeved' })
    // An owned free copy: Original just sleeves it (add stays off).
    const [owned] = views(r, [facts(r, [free()])], 'built')
    expect(applyIntentChange({}, 'k1', 'Sol Ring', owned, { type: 'original' }).edits.k1?.[0]?.add).not.toBe(true)
  })
  it('ticking Add on an unsleeved copy makes it Original; unticking an unowned one leaves it Unsleeved', () => {
    const r = row()
    const [v] = views(r, [facts(r)], 'planned')
    const ticked = applyIntentChange({}, 'k1', 'Sol Ring', v, { add: true })
    expect(ticked.edits.k1[0]).toEqual({ add: true, type: 'original' })
    const [p] = views(r, [facts(r)], 'purchased')
    const off = applyIntentChange({}, 'k1', 'Sol Ring', p, { add: false })
    expect(off.edits.k1[0]).toMatchObject({ add: false, type: 'unsleeved' })
    expect(off.message).toBe('Sol Ring: left unsleeved.')
  })
})

describe('move choice view', () => {
  it('one holding deck is pre-selected; Skip and re-picking work', () => {
    const r = row()
    const fs = [facts(r, [], [held(5)])]
    expect(views(r, fs, 'built')[0].move).toMatchObject({ chosen: 5 })
    const [v] = views(r, fs, 'built')
    const skip = applyIntentChange({}, 'k1', 'Sol Ring', v, { move: { kind: 'skip' } })
    expect(views(r, fs, 'built', skip.edits)[0].move?.chosen).toBe('skip')
    const back = applyIntentChange(skip.edits, 'k1', 'Sol Ring', views(r, fs, 'built', skip.edits)[0], {
      move: { kind: 'move', fromDeckId: 5 },
    })
    expect(views(r, fs, 'built', back.edits)[0].move?.chosen).toBe(5)
  })
  it('several decks: none selected until the owner picks', () => {
    const r = row()
    const fs = [facts(r, [], [held(5), held(6)])]
    const [v] = views(r, fs, 'built')
    expect(v.move?.candidates.map((c) => c.deckId)).toEqual([5, 6])
    expect(v.move?.chosen).toBeUndefined()
    const picked = applyIntentChange({}, 'k1', 'Sol Ring', v, { move: { kind: 'move', fromDeckId: 6 } })
    expect(views(r, fs, 'built', picked.edits)[0].move?.chosen).toBe(6)
  })
  it('no move row when a free copy exists', () => {
    const r = row()
    expect(views(r, [facts(r, [free()], [held(5)])], 'built')[0].move).toBeUndefined()
  })
})

describe('printing choice view', () => {
  const cmm = { printingId: 'p-cmm', setCode: 'cmm', collectorNumber: '410' }
  it('owned in another printing: defaults to using mine, naming both printings', () => {
    const r = row()
    const [v] = views(r, [facts(r, [free(cmm)])], 'built')
    expect(v.printing).toMatchObject({ owned: cmm, listed: { setCode: 'clb', collectorNumber: '351' }, chosen: 'use_mine' })
  })
  it('Use my copy sleeves the owned printing; Add this printing ticks Add; both keep the row visible', () => {
    const r = row()
    const fs = [facts(r, [free(cmm)])]
    const [v] = views(r, fs, 'built')
    const mine = applyIntentChange({}, 'k1', 'Sol Ring', v, { printing: 'use_mine' })
    expect(views(r, fs, 'built', mine.edits)[0]).toMatchObject({ add: false, printing: { chosen: 'use_mine' } })
    const add = applyIntentChange({}, 'k1', 'Sol Ring', v, { printing: 'add_this' })
    expect(views(r, fs, 'built', add.edits)[0]).toMatchObject({ add: true, printing: { chosen: 'add_this' } })
  })
  it('unticking Add takes "Add this printing" back', () => {
    const r = row()
    const fs = [facts(r, [free(cmm)])]
    const added = applyIntentChange({}, 'k1', 'Sol Ring', views(r, fs, 'built')[0], { printing: 'add_this' }).edits
    const off = applyIntentChange(added, 'k1', 'Sol Ring', views(r, fs, 'built', added)[0], { add: false })
    expect(off.edits.k1?.[0]?.printing).toBeUndefined()
    expect(views(r, fs, 'built', off.edits)[0].add).toBe(false)
  })
  it('no printing row when the exact printing is owned', () => {
    const r = row()
    expect(views(r, [facts(r, [free()])], 'built')[0].printing).toBeUndefined()
  })
})

describe('setIntentEdit / stripIntentFields', () => {
  it('clears empty edits', () => {
    const a = setIntentEdit({}, 'k', 0, { add: true })
    expect(a).toEqual({ k: { 0: { add: true } } })
    expect(setIntentEdit(a, 'k', 0, {})).toEqual({})
  })
  it('strips add / move / printing and keeps row-editing fields', () => {
    const edits: IntentCopyEdits = {
      a: { 0: { add: true, type: 'proxy' }, 1: { add: false, move: { kind: 'skip' } } },
      b: { 0: { printing: 'use_mine', finish: 'foil' } },
    }
    expect(stripIntentFields(edits)).toEqual({ a: { 0: { type: 'proxy' } }, b: { 0: { finish: 'foil' } } })
  })
})

// Keeps the type import used.
export type _V = IntentCopyView
