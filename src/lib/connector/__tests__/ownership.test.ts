/* eslint-disable @typescript-eslint/no-explicit-any -- test results are inspected loosely */
import { describe, it, expect } from 'vitest'
import { listDeckCardsByOwnership, listByOwnershipInput } from '../tools/list-deck-cards-by-ownership'
import { listDecks, listDecksInput } from '../tools/list-decks'
import { MAX_RESPONSE_BYTES, byteLength } from '../limits'
import { hasEq, mockDb, type RecordedQuery } from './mock-db'

const U = 'user-1'
const fresh = new Date().toISOString()
const slot = (id: number, deck: number, name: string, status: string, extra: Record<string, unknown> = {}) => ({ id, deck_id: deck, card_name: name, quantity: 1, categories: null, ownership_status: status, is_generic: false, ...extra })
const decks = [{ id: 1, name: 'Korvold', is_active: true }, { id: 2, name: 'Prosper', is_active: true }]
const slots = [
  slot(1, 1, 'Sol Ring', 'proxy'),
  slot(2, 2, 'Mana Crypt', 'proxy', { quantity: 2 }),
  slot(3, 2, 'Rhystic Study', 'proxy'),
  slot(4, 2, 'Cyclonic Rift', 'not_owned'),
  slot(5, 2, 'Maybe Card', 'proxy', { categories: '["Maybeboard"]' }),
  slot(6, 1, 'Forest', 'proxy', { is_generic: true }),
]
const prints = [
  { name: 'Sol Ring', price_usd: 2, digital: false, updated_at: fresh },
  { name: 'Sol Ring', price_usd: 1.5, digital: false, updated_at: fresh },
  { name: 'Sol Ring', price_usd: 0.1, digital: true, updated_at: fresh },
  { name: 'Mana Crypt', price_usd: 100, digital: false, updated_at: fresh },
  { name: 'Cyclonic Rift', price_usd: 30.255, digital: false, updated_at: fresh },
]
const resolver = (q: RecordedQuery) => (q.table === 'decks' ? { data: decks } : q.table === 'deck_cards' ? { data: slots } : q.table === 'ref_printings' && q.filters.some((f) => f.op === 'in') ? { data: prints } : { data: [] })

describe('list_deck_cards_by_ownership', () => {
  it('both: counts by quantity, most proxies first, labelled two figures, unknown price is null', async () => {
    const { db, queries } = mockDb(resolver)
    const r = (await listDeckCardsByOwnership({ db, userId: U }, listByOwnershipInput.parse({}))) as any
    expect(r.decks.map((d: any) => d.deckName)).toEqual(['Prosper', 'Korvold'])
    expect(r.decks[0]).toMatchObject({ proxy: 3, notOwned: 1, matching: 4, currentValueUsd: 0, unpricedCards: 1 })
    expect(r.decks[0].valueIfBoughtUsd).toBeCloseTo(230.26, 2)
    expect(r.decks[1]).toMatchObject({ matching: 1, valueIfBoughtUsd: 1.5, unpricedCards: 0 })
    const rhystic = r.items.find((i: any) => i.name === 'Rhystic Study')
    expect(rhystic).toMatchObject({ unitPriceUsd: null, valueIfBoughtUsd: null, currentValueUsd: 0 })
    expect(r.items.find((i: any) => i.name === 'Mana Crypt')).toMatchObject({ unitPriceUsd: 100, valueIfBoughtUsd: 200 })
    expect(r.items.some((i: any) => i.name === 'Maybe Card' || i.name === 'Forest')).toBe(false)
    expect(r.totals).toMatchObject({ proxy: 4, notOwned: 1, matching: 5, unpricedCards: 1, currentValueUsd: 0 })
    expect(r.priceSource).toMatchObject({ currency: 'USD', stale: false })
    expect(r.truncated).toBe(false)
    for (const q of queries.filter((q) => !q.table.startsWith('ref_'))) expect(hasEq(q, 'user_id', U)).toBe(true)
  })
  it('state filter and deck_id', async () => {
    const { db, queries } = mockDb((q) => (q.table === 'decks' ? { data: [decks[1]] } : resolver(q)))
    const r = (await listDeckCardsByOwnership({ db, userId: U }, listByOwnershipInput.parse({ state: 'not_owned', deck_id: 2 }))) as any
    expect(r.items.map((i: any) => i.name)).toEqual(['Cyclonic Rift'])
    expect(queries.find((q) => q.table === 'decks')!.filters).toContainEqual({ op: 'eq', args: ['id', 2] })
  })
  it('unknown or foreign deck is NOT_FOUND; db error is LOOKUP_FAILED', async () => {
    expect(await listDeckCardsByOwnership({ db: mockDb(() => ({ data: [] })).db, userId: U }, listByOwnershipInput.parse({ deck_id: 9 }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await listDeckCardsByOwnership({ db: mockDb(() => ({ error: { message: 'x' } })).db, userId: U }, listByOwnershipInput.parse({}))).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
  })
  it('a price lookup failure is LOOKUP_FAILED, never "free"', async () => {
    const { db } = mockDb((q) => (q.table === 'ref_printings' ? { error: { message: 'x' } } : resolver(q)))
    expect(await listDeckCardsByOwnership({ db, userId: U }, listByOwnershipInput.parse({}))).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
  })
  it('old price data is flagged stale', async () => {
    const old = prints.map((p) => ({ ...p, updated_at: '2020-01-01T00:00:00Z' }))
    const { db } = mockDb((q) => (q.table === 'ref_printings' ? { data: old } : resolver(q)))
    const r = (await listDeckCardsByOwnership({ db, userId: U }, listByOwnershipInput.parse({}))) as any
    expect(r.priceSource.stale).toBe(true)
  })
  it('pages with offset and says so; large results are cut by size and say so', async () => {
    const { db } = mockDb(resolver)
    const p = (await listDeckCardsByOwnership({ db, userId: U }, listByOwnershipInput.parse({ limit: 2 }))) as any
    expect(p).toMatchObject({ total: 4, returned: 2, truncated: true })
    expect(p.note).toMatch(/offset 2/)
    const many = Array.from({ length: 150 }, (_, i) => slot(100 + i, 1, `Card ${'x'.repeat(200)} ${i}`, 'proxy'))
    const big = mockDb((q) => (q.table === 'deck_cards' ? { data: many } : resolver(q))).db
    const r = (await listDeckCardsByOwnership({ db: big, userId: U }, listByOwnershipInput.parse({}))) as any
    expect(byteLength(r)).toBeLessThanOrEqual(MAX_RESPONSE_BYTES)
    expect(r.total).toBe(150)
    expect(r.returned).toBeLessThan(150)
    expect(r.truncated).toBe(true)
    expect(r.note).toMatch(/offset/)
  })
  it('rejects bad input', () => {
    expect(() => listByOwnershipInput.parse({ state: 'original' })).toThrow()
    expect(() => listByOwnershipInput.parse({ user_id: 'x' })).toThrow()
  })
})

describe('list_decks ownership counts', () => {
  it('adds original/proxy/notOwned per deck by quantity, main deck and non-generic only', async () => {
    const dr = { id: 1, name: 'D', commander_name: null, format: null, status: null, bracket: null, card_count: 3, is_active: true }
    const rowsX = [slot(1, 1, 'A', 'original', { quantity: 2 }), slot(2, 1, 'B', 'proxy'), slot(3, 1, 'C', 'not_owned'), slot(4, 1, 'M', 'proxy', { categories: '["Maybeboard"]' }), slot(5, 1, 'G', 'original', { is_generic: true })]
    const { db } = mockDb((q) => (q.table === 'decks' ? { data: [dr], count: 1 } : { data: rowsX }))
    const r = (await listDecks({ db, userId: U }, listDecksInput.parse({}))) as any
    expect(r.items[0].ownershipCounts).toEqual({ original: 2, proxy: 1, notOwned: 1 })
  })
})
