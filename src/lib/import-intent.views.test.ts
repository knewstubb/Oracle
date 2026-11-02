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
  hasNonNewCopy,
  intentCopyViews,
  planImportDetailed,
  setIntentEdit,
  stripIntentFields,
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

/** Click a control on copy `i` and return the new edits (and any note), like the review screen does. */
function click(r: ImportRow, fs: OwnershipRowFacts[], intent: ImportIntent, edits: IntentCopyEdits, i: number, change: Parameters<typeof applyIntentChange>[4]) {
  const v = views(r, fs, intent, edits)[i]
  return applyIntentChange(edits, r.rowKey, r.cardName, v, change)
}

describe('intentCopyViews: starting Card source', () => {
  it('purchased starts New, planned None, built Collection when owned else None', () => {
    const r = row()
    expect(views(r, [facts(r)], 'purchased')[0]).toMatchObject({ source: 'new', type: 'original', short: false })
    expect(views(r, [facts(r, [free()])], 'planned')[0]).toMatchObject({ source: 'none', type: 'unsleeved', anyOwned: true })
    expect(views(r, [facts(r, [free()])], 'built')[0]).toMatchObject({ source: 'collection', type: 'original', canCollection: true })
    expect(views(r, [facts(r)], 'built')[0]).toMatchObject({ source: 'none', type: 'unsleeved', canCollection: false, anyOwned: false })
  })
  it('generic basics are marked generic and follow the intent', () => {
    const r = row({ cardName: 'Island', isBasicLand: true, printingGiven: false })
    expect(views(r, [], 'purchased')[0]).toMatchObject({ generic: true, type: 'original' })
    expect(views(r, [], 'planned')[0]).toMatchObject({ generic: true, type: 'unsleeved' })
  })
  it('a short copy shows no source and is flagged', () => {
    const r = row({ qty: 2 })
    const [a, b] = views(r, [facts(r, [free()])], 'built')
    expect(a).toMatchObject({ source: 'collection', short: false })
    expect(b).toMatchObject({ source: null, short: true, type: 'unsleeved', canCollection: false, anyOwned: true })
  })
  it('a shared copy names the other deck', () => {
    const r = row()
    expect(views(r, [facts(r, [], [held(5)])], 'built')[0]).toMatchObject({
      source: 'collection',
      sharedWith: [{ deckId: 5, deckName: 'Deck 5' }],
    })
    expect(views(r, [facts(r, [free()])], 'built')[0].sharedWith).toBeUndefined()
  })
})

describe('hasNonNewCopy', () => {
  it('is false only when every real card is New (generic basics ignored)', () => {
    const r = row()
    const basic = row({ rowKey: 'b', cardName: 'Island', isBasicLand: true, printingGiven: false })
    expect(hasNonNewCopy({ k1: views(r, [facts(r)], 'purchased'), b: views(basic, [], 'planned') })).toBe(false)
    expect(hasNonNewCopy({ k1: views(r, [facts(r)], 'purchased', { k1: { 0: { source: 'none' } } }) })).toBe(true)
    expect(hasNonNewCopy({ k1: views(r, [facts(r, [free()])], 'built') })).toBe(true)
  })
})

describe('applyIntentChange: Card source', () => {
  it('Collection is refused when nothing is owned, with a note', () => {
    const r = row()
    const res = click(r, [facts(r)], 'purchased', {}, 0, { source: 'collection' })
    expect(res.edits).toEqual({})
    expect(res.message).toBe('Sol Ring: none left in your collection.')
  })
  it('purchased -> Collection uses an owned copy; -> None leaves a slot', () => {
    const r = row()
    const fs = [facts(r, [free()])]
    const toCol = click(r, fs, 'purchased', {}, 0, { source: 'collection' })
    expect(toCol.edits).toEqual({ k1: { 0: { source: 'collection' } } })
    expect(views(r, fs, 'purchased', toCol.edits)[0]).toMatchObject({ source: 'collection', type: 'original' })
    const toNone = click(r, fs, 'purchased', toCol.edits, 0, { source: 'none' })
    expect(views(r, fs, 'purchased', toNone.edits)[0]).toMatchObject({ source: 'none', type: 'unsleeved' })
  })
  it('a short copy is resolved by picking None or New', () => {
    const r = row({ qty: 2 })
    const fs = [facts(r, [free()])]
    const none = click(r, fs, 'built', {}, 1, { source: 'none' })
    expect(views(r, fs, 'built', none.edits)[1]).toMatchObject({ source: 'none', short: false })
    const added = click(r, fs, 'built', {}, 1, { source: 'new' })
    expect(added.edits.k1[1]).toEqual({ source: 'new', type: 'original' })
    expect(views(r, fs, 'built', added.edits)[1]).toMatchObject({ source: 'new', type: 'original', short: false })
  })
  it('New -> Collection drops a Proxy the collection does not have, so the copy is not left short', () => {
    const r = row()
    const fs = [facts(r, [free()])]
    const proxy = click(r, fs, 'purchased', {}, 0, { type: 'proxy' })
    expect(proxy.edits.k1[0]).toEqual({ source: 'new', type: 'proxy' })
    const col = click(r, fs, 'purchased', proxy.edits, 0, { source: 'collection' })
    expect(col.edits.k1[0]).toEqual({ source: 'collection' })
    expect(views(r, fs, 'purchased', col.edits)[0]).toMatchObject({ source: 'collection', type: 'original', short: false })
  })
  it('New -> Collection keeps a Proxy the collection has', () => {
    const r = row()
    const fs = [facts(r, [free(), free({ isProxy: true })])]
    const proxy = click(r, fs, 'purchased', {}, 0, { type: 'proxy' })
    const col = click(r, fs, 'purchased', proxy.edits, 0, { source: 'collection' })
    expect(views(r, fs, 'purchased', col.edits)[0]).toMatchObject({ source: 'collection', type: 'proxy' })
  })
})

describe('applyIntentChange: Type', () => {
  it('under New both types are open', () => {
    const r = row()
    expect(views(r, [facts(r)], 'purchased')[0]).toMatchObject({ canOriginal: true, canProxy: true })
    const res = click(r, [facts(r)], 'purchased', {}, 0, { type: 'proxy' })
    expect(views(r, [facts(r)], 'purchased', res.edits)[0].type).toBe('proxy')
  })
  it('under None the type cannot change', () => {
    const r = row()
    const [v] = views(r, [facts(r)], 'planned')
    expect(v).toMatchObject({ canOriginal: false, canProxy: false })
    expect(click(r, [facts(r)], 'planned', {}, 0, { type: 'original' }).edits).toEqual({})
  })
  it('under Collection only an owned type can be picked', () => {
    const r = row()
    const fs = [facts(r, [free()])]
    expect(views(r, fs, 'built')[0]).toMatchObject({ canOriginal: true, canProxy: false })
    const res = click(r, fs, 'built', {}, 0, { type: 'proxy' })
    expect(res.edits).toEqual({})
    expect(res.message).toBe('Sol Ring: no proxy in your collection.')
    const both = [facts(r, [free(), free({ isProxy: true })])]
    const ok = click(r, both, 'built', {}, 0, { type: 'proxy' })
    expect(views(r, both, 'built', ok.edits)[0]).toMatchObject({ source: 'collection', type: 'proxy' })
  })
})

describe('setIntentEdit / stripIntentFields', () => {
  it('clears empty edits', () => {
    const a = setIntentEdit({}, 'k', 0, { source: 'new' })
    expect(a).toEqual({ k: { 0: { source: 'new' } } })
    expect(setIntentEdit(a, 'k', 0, {})).toEqual({})
    expect(setIntentEdit({}, 'k', 0, { source: 'none', type: undefined })).toEqual({ k: { 0: { source: 'none' } } })
  })
  it('strips source / add / move / printing and keeps row-editing fields', () => {
    const edits: IntentCopyEdits = {
      a: { 0: { source: 'new', type: 'proxy' }, 1: { add: false, move: { kind: 'skip' } } },
      b: { 0: { printing: 'use_mine', finish: 'foil' } },
    }
    expect(stripIntentFields(edits)).toEqual({ a: { 0: { type: 'proxy' } }, b: { 0: { finish: 'foil' } } })
  })
})
