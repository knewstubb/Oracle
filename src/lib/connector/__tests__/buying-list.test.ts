/* eslint-disable @typescript-eslint/no-explicit-any -- test results are inspected loosely */
import { describe, it, expect } from 'vitest'
import { getBuyingList, getBuyingListInput } from '../tools/get-buying-list'
import { MAX_RESPONSE_BYTES, byteLength } from '../limits'
import { hasEq, mockDb, type RecordedQuery, type Resolver } from './mock-db'

const U = 'user-1'
const fresh = new Date().toISOString()
const slot = (id: number, deck: number, name: string, status: string, extra: Record<string, unknown> = {}) => ({ id, deck_id: deck, card_name: name, quantity: 1, categories: null, ownership_status: status, is_generic: false, ...extra })
const decks = [{ id: 1, name: 'Korvold' }, { id: 2, name: 'Prosper' }]
const slots = [
  slot(1, 1, 'Sol Ring', 'proxy'),
  slot(2, 2, 'Sol Ring', 'not_owned'),
  slot(3, 2, 'Mana Crypt', 'not_owned', { quantity: 2 }),
  slot(4, 2, 'Rhystic Study', 'not_owned'),
  slot(5, 1, 'Cyclonic Rift', 'not_owned'),
  slot(6, 2, 'Maybe Card', 'not_owned', { categories: '["Maybeboard"]' }),
  slot(7, 1, 'Forest', 'not_owned', { is_generic: true }),
  slot(8, 1, 'Cyclonic Rift', 'proxy'),
]
const prints = [
  { name: 'Sol Ring', price_usd: 2, digital: false, updated_at: fresh },
  { name: 'Mana Crypt', price_usd: 100, digital: false, updated_at: fresh },
  { name: 'Cyclonic Rift', price_usd: 30.255, digital: false, updated_at: fresh },
]
// The mock ignores .in('ownership_status'), so filter like the database would.
const resolver: Resolver = (q: RecordedQuery) => {
  if (q.table === 'decks') return { data: decks }
  if (q.table === 'deck_cards') {
    const f = q.filters.find((x) => x.op === 'in' && x.args[0] === 'ownership_status')
    const allowed = (f?.args[1] as string[]) ?? []
    return { data: slots.filter((s) => allowed.includes(s.ownership_status)) }
  }
  if (q.table === 'ref_printings' && q.filters.some((f) => f.op === 'in')) return { data: prints }
  return { data: [] }
}
const run = async (input: object, r: Resolver = resolver) => (await getBuyingList({ db: mockDb(r).db, userId: U }, getBuyingListInput.parse(input))) as any

describe('get_buying_list', () => {
  it('default: not-owned only, one line per card across decks, dearest first, unpriced last and counted', async () => {
    const r = await run({})
    expect(r.items.map((i: any) => i.name)).toEqual(['Mana Crypt', 'Cyclonic Rift', 'Sol Ring', 'Rhystic Study'])
    expect(r.items[0]).toMatchObject({ toBuy: 2, estimatedCostUsd: 200, unitPriceUsd: 100 })
    expect(r.items.find((i: any) => i.name === 'Sol Ring')).toMatchObject({ toBuy: 1, notOwned: 1, proxyUpgrade: 0, estimatedCostUsd: 2 })
    expect(r.items.find((i: any) => i.name === 'Rhystic Study')).toMatchObject({ unitPriceUsd: null, estimatedCostUsd: null })
    expect(r.items.some((i: any) => i.name === 'Maybe Card' || i.name === 'Forest')).toBe(false)
    expect(r.totals).toMatchObject({ cardsToBuy: 5, notOwnedCopies: 5, proxyUpgradeCopies: 0, estimatedCostUsd: 232.26, unpricedCopies: 1, unpricedCards: 1 })
    expect(r.priceSource.notShopPrices).toMatch(/Card Kingdom/)
    expect(r.priceSource).toMatchObject({ currency: 'USD', stale: false })
    expect(r.truncated).toBe(false)
  })
  it('a card two decks want is two buys, with the per-deck split', async () => {
    const r = await run({ include_proxies: true })
    const sol = r.items.find((i: any) => i.name === 'Sol Ring')
    expect(sol).toMatchObject({ toBuy: 2, notOwned: 1, proxyUpgrade: 1, estimatedCostUsd: 4 })
    expect(sol.decks).toEqual([
      { deckId: 1, deckName: 'Korvold', notOwned: 0, proxyUpgrade: 1 },
      { deckId: 2, deckName: 'Prosper', notOwned: 1, proxyUpgrade: 0 },
    ])
  })
  it('include_proxies adds upgrades with separate subtotals', async () => {
    const r = await run({ include_proxies: true })
    expect(r.includesProxies).toBe(true)
    expect(r.totals).toMatchObject({ notOwnedCopies: 5, proxyUpgradeCopies: 2, cardsToBuy: 7 })
    expect(r.totals.proxyUpgradeCostUsd).toBeCloseTo(32.25, 1)
    expect(r.totals.estimatedCostUsd).toBeCloseTo(r.totals.notOwnedCostUsd + r.totals.proxyUpgradeCostUsd, 2)
  })
  it('include_maybeboard adds maybeboard cards; generic placeholders never count', async () => {
    const r = await run({ include_maybeboard: true })
    expect(r.items.some((i: any) => i.name === 'Maybe Card')).toBe(true)
    expect(r.items.some((i: any) => i.name === 'Forest')).toBe(false)
  })
  it('sort by name; deck_id scopes to one deck', async () => {
    expect((await run({ sort: 'name' })).items.map((i: any) => i.name)).toEqual(['Cyclonic Rift', 'Mana Crypt', 'Rhystic Study', 'Sol Ring'])
    const { db, queries } = mockDb((q) => (q.table === 'decks' ? { data: [decks[1]] } : resolver(q)))
    await getBuyingList({ db, userId: U }, getBuyingListInput.parse({ deck_id: 2 }))
    expect(queries.find((q) => q.table === 'decks')!.filters).toContainEqual({ op: 'eq', args: ['id', 2] })
  })
  it('everything is scoped to the signed-in owner', async () => {
    const { db, queries } = mockDb(resolver)
    await getBuyingList({ db, userId: U }, getBuyingListInput.parse({ include_proxies: true }))
    for (const q of queries.filter((q) => !q.table.startsWith('ref_'))) expect(hasEq(q, 'user_id', U)).toBe(true)
  })
  it('unknown or foreign deck is NOT_FOUND; db and price errors are LOOKUP_FAILED, never free', async () => {
    expect(await run({ deck_id: 9 }, () => ({ data: [] }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await run({}, () => ({ error: { message: 'x' } }))).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
    expect(await run({}, (q) => (q.table === 'ref_printings' ? { error: { message: 'x' } } : resolver(q)))).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
  })
  it('old price data is flagged stale; empty list is an honest zero', async () => {
    const old = prints.map((p) => ({ ...p, updated_at: '2020-01-01T00:00:00Z' }))
    expect((await run({}, (q) => (q.table === 'ref_printings' ? { data: old } : resolver(q)))).priceSource.stale).toBe(true)
    const e = await run({}, (q) => (q.table === 'deck_cards' ? { data: [] } : resolver(q)))
    expect(e).toMatchObject({ total: 0, items: [], totals: { cardsToBuy: 0, estimatedCostUsd: 0 } })
  })
  it('pages with offset; large results are cut by size and say so', async () => {
    const p = await run({ limit: 2 })
    expect(p).toMatchObject({ total: 4, returned: 2, truncated: true })
    expect(p.note).toMatch(/offset 2/)
    const many = Array.from({ length: 100 }, (_, i) => slot(100 + i, 1, `Card ${'x'.repeat(250)} ${i}`, 'not_owned'))
    const r = await run({ limit: 100 }, (q) => (q.table === 'deck_cards' ? { data: many } : resolver(q)))
    expect(byteLength(r)).toBeLessThanOrEqual(MAX_RESPONSE_BYTES)
    expect(r.total).toBe(100)
    expect(r.returned).toBeLessThan(100)
    expect(r.truncated).toBe(true)
  })
  it('rejects bad input', () => {
    expect(() => getBuyingListInput.parse({ sort: 'cheap' })).toThrow()
    expect(() => getBuyingListInput.parse({ user_id: 'x' })).toThrow()
    expect(() => getBuyingListInput.parse({ limit: 101 })).toThrow()
  })
})
