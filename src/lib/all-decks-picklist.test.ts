import { describe, it, expect } from 'vitest'
import { applyWalkOptimistic, buildAllDecksPicklist, placedSummary, walkRowKey, type PlannedSlot, type WalkItem } from './all-decks-picklist'
import type { RankedCandidate } from './allocation-candidates'

const names = {
  decks: new Map([[1, 'Korvold'], [2, 'Atraxa'], [3, 'TEST A'], [4, 'TEST B']]),
  locations: new Map([[10, { name: 'Unsorted', isUnsorted: true }], [11, { name: 'Box B', isUnsorted: false }], [12, { name: 'Box A', isUnsorted: false }]]),
}

const item = (o: Partial<WalkItem> & { id: number }): WalkItem => ({
  state: 'to_find', copyId: o.id, cardName: `Card ${o.id}`, isProxy: false,
  fromDeckId: null, fromLocationId: null, toDeckId: 1, toDeckCardId: o.id, toLocationId: null, ...o,
})

/** A ranked candidate: free in a box (locationId) or in another deck (inDeck). */
const cand = (copyId: number, o: { locationId?: number | null; inDeck?: { deckId: number; deckName: string }; tier?: 1 | 2 | 3 | 5 } = {}): RankedCandidate => ({
  entry: {
    physicalCopyId: copyId, cardId: 1, printingId: null, finish: 'nonfoil', isProxy: o.tier === 2, condition: null,
    locationId: o.locationId ?? null, locationName: o.locationId ? names.locations.get(o.locationId)!.name : null,
    assignedTo: o.inDeck ? { deckCardsId: 900 + copyId, deckId: o.inDeck.deckId, deckName: o.inDeck.deckName, isActive: true } : null,
  },
  tier: o.tier ?? (o.inDeck ? 3 : 1), tierLabel: '', withinTierScore: 0, autoSelectable: true,
})
const unownedCand: RankedCandidate = { ...cand(-1, { tier: 5 }) }
const slot = (deckId: number, deckCardId: number, cardName: string, candidates: RankedCandidate[]): PlannedSlot => ({ deckId, deckCardId, cardName, candidates })

describe('buildAllDecksPicklist: saved steps', () => {
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
    expect(r.counts).toEqual({ total: 4, found: 1, placed: 1, missing: 1, open: 1, unowned: 0 })
    expect(r.takeFromBoxes[0].rows.map((x) => x.state).sort()).toEqual(['missing', 'to_find'])
  })

  it('is empty for no steps and no planned cards', () => {
    const r = buildAllDecksPicklist([], names)
    expect(r.takeFromBoxes).toEqual([]); expect(r.unowned).toEqual([]); expect(r.counts.total).toBe(0); expect(r.decks).toEqual([])
  })
})

describe('buildAllDecksPicklist: every planned card', () => {
  it('lists planned cards with no step, grouped by Storage, Another deck and Unowned', () => {
    const r = buildAllDecksPicklist([], names, [
      slot(3, 101, 'Sol Ring', [cand(51, { locationId: 10 })]),
      slot(3, 102, 'Cultivate', [cand(52, { inDeck: { deckId: 1, deckName: 'Korvold' } })]),
      slot(4, 201, 'Black Lotus', [unownedCand]),
      slot(4, 202, 'Mox Pearl', []),
    ])
    expect(r.takeFromBoxes.map((s) => s.placeName)).toEqual(['Unsorted'])
    expect(r.takeFromBoxes[0].rows[0]).toMatchObject({ itemId: null, state: 'to_find', copyId: 51, cardName: 'Sol Ring', toDeckId: 3, toDeckCardId: 101, toName: 'TEST A', blockedBy: null })
    expect(r.takeFromDecks.map((s) => s.placeName)).toEqual(['Korvold'])
    expect(r.takeFromDecks[0].rows[0]).toMatchObject({ copyId: 52, fromName: 'Korvold', toDeckCardId: 102 })
    expect(r.unowned.map((s) => s.placeName)).toEqual(['TEST B'])
    expect(r.unowned[0].rows.map((x) => [x.cardName, x.copyId])).toEqual([['Black Lotus', null], ['Mox Pearl', null]])
    expect(r.counts).toMatchObject({ total: 4, placed: 0, open: 2, unowned: 2 })
    expect(r.decks).toEqual([
      { deckId: 3, deckName: 'TEST A', placed: 0, total: 2 },
      { deckId: 4, deckName: 'TEST B', placed: 0, total: 2 },
    ])
  })

  it('prefers a free copy in storage over a copy in another deck, and skips copies already in this deck', () => {
    const r = buildAllDecksPicklist([], names, [
      slot(3, 101, 'Sol Ring', [cand(60, { inDeck: { deckId: 3, deckName: 'TEST A' } }), cand(61, { inDeck: { deckId: 1, deckName: 'Korvold' } }), cand(62, { locationId: 12 })]),
      slot(3, 102, 'Arcane Signet', [cand(63, { inDeck: { deckId: 3, deckName: 'TEST A' } })]),
    ])
    expect(r.takeFromBoxes[0].rows[0]).toMatchObject({ copyId: 62, fromName: 'Box A' })
    expect(r.unowned[0].rows.map((x) => x.cardName)).toEqual(['Arcane Signet'])
  })

  it('a saved step takes precedence for its slot; a placed step whose slot is planned again is dropped', () => {
    const r = buildAllDecksPicklist([
      item({ id: 7, state: 'found', copyId: 51, toDeckId: 3, toDeckCardId: 101, cardName: 'Sol Ring', fromLocationId: 10 }),
      item({ id: 8, state: 'placed', copyId: 53, toDeckId: 3, toDeckCardId: 103, cardName: 'Cultivate', fromLocationId: 10 }),
    ], names, [
      slot(3, 101, 'Sol Ring', [cand(54, { locationId: 10 })]),
      slot(3, 103, 'Cultivate', [cand(53, { locationId: 10 })]),
    ])
    expect(r.placeIn[0].rows.map((x) => [x.cardName, x.state, x.itemId])).toEqual([['Sol Ring', 'found', 7]])
    expect(r.takeFromBoxes[0].rows.map((x) => [x.cardName, x.itemId])).toEqual([['Cultivate', null]])
    expect(r.counts).toMatchObject({ total: 2, found: 1, placed: 0, open: 1 })
    expect(r.decks).toEqual([{ deckId: 3, deckName: 'TEST A', placed: 0, total: 2 }])
  })

  it('counts placed steps in "N of M cards placed" per deck', () => {
    const r = buildAllDecksPicklist([item({ id: 1, state: 'placed', toDeckId: 3 })], names, [slot(3, 101, 'Sol Ring', [cand(51, { locationId: 10 })])])
    expect(r.decks).toEqual([{ deckId: 3, deckName: 'TEST A', placed: 1, total: 2 }])
    expect(placedSummary(r.counts.placed, r.counts.total)).toBe('1 of 2 cards placed')
    expect(placedSummary(0, 1)).toBe('0 of 1 card placed')
  })

  it('hands one free copy to one row only; the other row names where it is going and is not tickable', () => {
    const r = buildAllDecksPicklist([], names, [
      slot(4, 201, 'Sol Ring', [cand(51, { locationId: 10 })]),
      slot(3, 101, 'Sol Ring', [cand(51, { locationId: 10 })]),
    ])
    const rows = r.takeFromBoxes[0].rows
    expect(rows.map((x) => [x.toName, x.blockedBy])).toEqual([['TEST A', null], ['TEST B', 'TEST A']])
  })

  it('gives the second row the next free copy when there is one, or a copy in another deck', () => {
    const r = buildAllDecksPicklist([], names, [
      slot(3, 101, 'Sol Ring', [cand(51, { locationId: 10 }), cand(55, { inDeck: { deckId: 1, deckName: 'Korvold' } })]),
      slot(4, 201, 'Sol Ring', [cand(51, { locationId: 10 }), cand(55, { inDeck: { deckId: 1, deckName: 'Korvold' } })]),
    ])
    expect(r.takeFromBoxes[0].rows.map((x) => [x.toName, x.copyId])).toEqual([['TEST A', 51]])
    expect(r.takeFromDecks[0].rows.map((x) => [x.toName, x.copyId, x.blockedBy])).toEqual([['TEST B', 55, null]])
  })

  it('a copy that already has an open step is not offered to another row', () => {
    const r = buildAllDecksPicklist([item({ id: 9, state: 'to_find', copyId: 51, toDeckId: 1, toDeckCardId: 900, cardName: 'Sol Ring', fromLocationId: 10 })], names, [
      slot(3, 101, 'Sol Ring', [cand(51, { locationId: 10 })]),
    ])
    const derived = r.takeFromBoxes[0].rows.find((x) => x.itemId === null)!
    expect(derived.blockedBy).toBe('Korvold')
  })
})

describe('applyWalkOptimistic', () => {
  it('moves a planned row (no step yet) to its destination when Picked, keyed by its slot', () => {
    const data = buildAllDecksPicklist([], names, [slot(3, 101, 'Sol Ring', [cand(51, { locationId: 10 })])])
    const row = data.takeFromBoxes[0].rows[0]
    const r = applyWalkOptimistic(data, [{ itemId: walkRowKey(row), state: 'found' }])
    expect(r.takeFromBoxes).toEqual([])
    expect(r.placeIn[0]).toMatchObject({ placeName: 'TEST A' })
    expect(r.counts).toMatchObject({ open: 0, found: 1 })
  })
  it('updates the deck count when a row is Placed', () => {
    const data = buildAllDecksPicklist([item({ id: 1, state: 'found', toDeckId: 3 })], names)
    const r = applyWalkOptimistic(data, [{ itemId: 1, state: 'placed' }])
    expect(r.decks[0]).toMatchObject({ placed: 1, total: 1 })
  })
})
