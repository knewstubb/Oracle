import { describe, it, expect } from 'vitest'
import { buildAllDecksPicklist, unownedFootnote, type WalkItem } from './all-decks-picklist'

const names = {
  decks: new Map([[1, 'Korvold'], [2, 'Atraxa']]),
  locations: new Map([[10, { name: 'Unsorted', isUnsorted: true }], [11, { name: 'Box B', isUnsorted: false }], [12, { name: 'Box A', isUnsorted: false }]]),
}
const item = (o: Partial<WalkItem> & { id: number }): WalkItem => ({
  state: 'to_find', copyId: o.id, cardName: `Card ${o.id}`, isProxy: false,
  fromDeckId: null, fromLocationId: null, toDeckId: 1, toDeckCardId: o.id, toLocationId: null, ...o,
})

describe('buildAllDecksPicklist', () => {
  it('orders stops Unsorted first, then boxes A to Z, then decks A to Z', () => {
    const r = buildAllDecksPicklist([
      item({ id: 1, fromLocationId: 11 }), item({ id: 2, fromLocationId: 10 }), item({ id: 3, fromLocationId: 12 }),
      item({ id: 4, fromDeckId: 2 }), item({ id: 5, fromDeckId: 1, toDeckId: 2 }),
    ], names)
    expect(r.takeFromBoxes.map((s) => s.placeName)).toEqual(['Unsorted', 'Box A', 'Box B'])
    expect(r.takeFromDecks.map((s) => s.placeName)).toEqual(['Atraxa', 'Korvold'])
  })
  it('puts picked-up and placed cards at their destination, and counts every state', () => {
    const r = buildAllDecksPicklist([
      item({ id: 1, state: 'found', fromDeckId: 2 }), item({ id: 2, state: 'placed', fromDeckId: 2 }),
      item({ id: 3, state: 'missing', fromLocationId: 11 }), item({ id: 4, fromLocationId: 11 }),
    ], names)
    expect(r.placeIn.map((s) => s.placeName)).toEqual(['Korvold'])
    expect(r.placeIn[0].rows.map((x) => x.state)).toEqual(['found', 'placed'])
    expect(r.counts).toEqual({ total: 4, found: 1, placed: 1, missing: 1, open: 1 })
    expect(r.takeFromBoxes[0].rows.map((x) => x.state).sort()).toEqual(['missing', 'to_find'])
  })
  it('is empty for no steps', () => {
    const r = buildAllDecksPicklist([], names)
    expect(r.takeFromBoxes).toEqual([]); expect(r.counts.total).toBe(0)
  })
})

describe('unowned counts', () => {
  it('passes counts through, drops zeros and sorts by deck name', () => {
    const r = buildAllDecksPicklist([], names, [{ deckId: 2, deckName: 'Prosper', count: 1 }, { deckId: 1, deckName: 'Korvold', count: 4 }, { deckId: 3, deckName: 'Atraxa', count: 0 }])
    expect(r.unownedByDeck.map((u) => `${u.deckName}:${u.count}`)).toEqual(['Korvold:4', 'Prosper:1'])
  })
  it('defaults to none', () => { expect(buildAllDecksPicklist([], names).unownedByDeck).toEqual([]) })
})

describe('unownedFootnote', () => {
  it('words singular and plural, and hides at zero', () => {
    expect(unownedFootnote(0, 'Korvold')).toBeNull()
    expect(unownedFootnote(1, 'Korvold')).toBe("1 unowned card in Korvold isn't listed here. Open the deck's Picklist.")
    expect(unownedFootnote(3, 'Korvold')).toContain('3 unowned cards')
  })
})
