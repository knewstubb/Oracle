import { describe, it, expect } from 'vitest'
import { shapeCollectionCopies, collectionValue, cheapestPrice, type CollectionCopyRow } from './collection-copies'

const printings = new Map([
  ['p1', { set_code: 'c21', set_name: 'Commander 2021', collector_number: '263', price_usd: '2.10', price_usd_foil: '4.80' }],
  ['p2', { set_code: 'cmr', set_name: 'Commander Legends', collector_number: '472', price_usd: null, price_usd_foil: null }],
])
const decks = new Map([[9, { name: 'Auntie Ool', state: 'playable' as const }]])
const locationNames = new Map([[3, 'Binder 2']])
const row = (over: Partial<CollectionCopyRow>): CollectionCopyRow => ({
  id: 1, is_proxy: false, missing: false, condition: 'near_mint', finish: 'nonfoil', printing_id: 'p1', location_id: 3, deck_cards: null, ...over,
})
const shape = (rows: CollectionCopyRow[]) => shapeCollectionCopies(rows, { decks, printings, locationNames })

describe('shapeCollectionCopies', () => {
  it('gives each copy a state: in deck, open or missing', () => {
    const out = shape([row({ id: 1 }), row({ id: 2, deck_cards: [{ id: 50, deck_id: 9 }] }), row({ id: 3, missing: true })])
    expect(out.map((c) => [c.copyId, c.state])).toEqual([[2, 'in_deck'], [1, 'open'], [3, 'missing']])
    expect(out[0].assigned).toEqual({ deckId: 9, deckName: 'Auntie Ool', deckState: 'playable', deckCardsId: 50 })
    expect(out[1].storage).toEqual({ id: 3, name: 'Binder 2' })
  })
  it('prices by printing and finish, and never prices a Proxy', () => {
    const out = shape([row({ id: 1 }), row({ id: 2, finish: 'foil' }), row({ id: 3, is_proxy: true }), row({ id: 4, printing_id: 'p2' })])
    const price = (id: number) => out.find((c) => c.copyId === id)!.priceUsd
    expect(price(1)).toBe(2.1)
    expect(price(2)).toBe(4.8)
    expect(price(3)).toBeNull()
    expect(price(4)).toBeNull()
  })
  it('includes copies of every printing of the card', () => {
    const out = shape([row({ id: 1, printing_id: 'p1' }), row({ id: 2, printing_id: 'p2' })])
    expect(out.map((c) => c.printing?.setCode)).toEqual(['c21', 'cmr'])
  })
})

describe('collectionValue and cheapestPrice', () => {
  it('sums Originals only, skips Proxies and Missing, and is null when nothing is priced', () => {
    const out = shape([row({ id: 1 }), row({ id: 2, finish: 'foil' }), row({ id: 3, is_proxy: true }), row({ id: 4, missing: true })])
    expect(collectionValue(out)).toBeCloseTo(6.9)
    expect(collectionValue(shape([row({ id: 5, printing_id: 'p2' }), row({ id: 6, is_proxy: true })]))).toBeNull()
    expect(collectionValue([])).toBeNull()
  })
  it('finds the lowest known printing price', () => {
    expect(cheapestPrice([{ price_usd: '2.10' }, { price_usd: 0.9 }, { price_usd: null }])).toBe(0.9)
    expect(cheapestPrice([{ price_usd: null }])).toBeNull()
  })
})
