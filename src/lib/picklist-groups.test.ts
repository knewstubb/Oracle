import { describe, it, expect } from 'vitest'
import { categorizeCards, type PicklistCard } from './picklist-groups'
import type { RankedCandidate } from '@/lib/allocation-candidates'

// These tests pin what the pick list screen does TODAY, before it is renamed and regrouped.
// They were written against the grouping code as it was moved out of the screen, unchanged.

const DECK = 10

function cand(over: { copyId?: number; tier?: 1 | 2 | 3 | 4 | 5; isProxy?: boolean; location?: string | null; deck?: { id: number; name: string } | null }): RankedCandidate {
  const { copyId = 1, tier = 1, isProxy = false, location = 'Box A', deck = null } = over
  return {
    entry: {
      physicalCopyId: copyId,
      cardId: 1,
      printingId: null,
      finish: 'nonfoil',
      isProxy,
      condition: null,
      locationId: null,
      locationName: location,
      assignedTo: deck ? { deckCardsId: 99, deckId: deck.id, deckName: deck.name } : null,
    },
    tier,
    tierLabel: '',
    withinTierScore: 0,
    autoSelectable: tier <= 2,
  }
}

function card(id: number, name: string, candidates: RankedCandidate[], over: Partial<PicklistCard> = {}): PicklistCard {
  return {
    deckCardsId: id, cardName: name, lifecycle: 'planned', allocationStatus: null, copyId: null, isResolved: false,
    physicalCopyId: null, ownershipStatus: null, candidates, ...over,
  }
}

describe("categorizeCards: today's grouping", () => {
  it('a card with a free copy is Available', () => {
    const r = categorizeCards([card(1, 'Sol Ring', [cand({})])], DECK)
    expect(r.available).toHaveLength(1)
    expect(r.available[0].items.map((i) => i.card.cardName)).toEqual(['Sol Ring'])
    expect(r.needsMoving).toEqual([])
    expect(r.unowned).toEqual([])
  })

  it('Available is grouped by the box the copy is in (before this step the screen put every card under "Unsorted": a field-name slip)', () => {
    const r = categorizeCards([card(1, 'A', [cand({ location: 'Box A' })]), card(2, 'B', [cand({ location: 'Binder' })])], DECK)
    expect(r.available.map((g) => g.location)).toEqual(['Binder', 'Box A'])
  })

  it('a free copy with no box falls under "Unsorted"', () => {
    const r = categorizeCards([card(1, 'A', [cand({ location: null })])], DECK)
    expect(r.available.map((g) => g.location)).toEqual(['Unsorted'])
  })

  it('a card whose only copy sits in another deck is in the Needs moving group for that deck', () => {
    const r = categorizeCards([card(1, 'Cultivate', [cand({ tier: 3, deck: { id: 3, name: 'Prosper' } })])], DECK)
    expect(r.available).toEqual([])
    expect(r.needsMoving).toHaveLength(1)
    expect(r.needsMoving[0].deckName).toBe('Prosper')
    expect(r.needsMoving[0].items[0].candidate.entry.physicalCopyId).toBe(1)
  })

  it('a free copy wins over a copy in another deck', () => {
    const r = categorizeCards([card(1, 'Sol Ring', [cand({ copyId: 1, tier: 3, deck: { id: 3, name: 'Prosper' } }), cand({ copyId: 2 })])], DECK)
    expect(r.needsMoving).toEqual([])
    expect(r.available[0].items[0].candidate.entry.physicalCopyId).toBe(2)
  })

  it('no candidates is Unowned', () => {
    const r = categorizeCards([card(1, 'Mox Diamond', [])], DECK)
    expect(r.unowned.map((u) => u.card.cardName)).toEqual(['Mox Diamond'])
  })

  it('a first candidate of tier 5 (nothing owned) is Unowned', () => {
    const r = categorizeCards([card(1, 'Mox Diamond', [cand({ tier: 5 })])], DECK)
    expect(r.unowned).toHaveLength(1)
    expect(r.available).toEqual([])
  })

  it('a copy already sitting in THIS deck is ignored', () => {
    const r = categorizeCards([card(1, 'Sol Ring', [cand({ tier: 3, deck: { id: DECK, name: 'This deck' } })])], DECK)
    expect(r.unowned).toHaveLength(1)
    expect(r.needsMoving).toEqual([])
  })

  it('cards already sleeved or resolved are not listed', () => {
    const r = categorizeCards([
      card(1, 'A', [cand({})], { lifecycle: 'sleeved' }),
      card(2, 'B', [cand({})], { isResolved: true, copyId: 5 }),
    ], DECK)
    expect(r).toEqual({ available: [], needsMoving: [], unowned: [] })
  })

  it('a card needed twice appears once per slot', () => {
    const r = categorizeCards([card(1, 'Island Hopper', [cand({})]), card(2, 'Island Hopper', [cand({})])], DECK)
    expect(r.available[0].items).toHaveLength(2)
  })

  it('sorts cards A to Z inside a group, claimed groups by deck name, and Unowned A to Z', () => {
    const r = categorizeCards([
      card(1, 'Zebra', [cand({ tier: 3, deck: { id: 4, name: 'Zurgo' } })]),
      card(2, 'Apple', [cand({ tier: 3, deck: { id: 3, name: 'Atraxa' } })]),
      card(3, 'Mango', [cand({ tier: 3, deck: { id: 3, name: 'Atraxa' } })]),
      card(4, 'Yak', []),
      card(5, 'Bat', []),
    ], DECK)
    expect(r.needsMoving.map((g) => g.deckName)).toEqual(['Atraxa', 'Zurgo'])
    expect(r.needsMoving[0].items.map((i) => i.card.cardName)).toEqual(['Apple', 'Mango'])
    expect(r.unowned.map((u) => u.card.cardName)).toEqual(['Bat', 'Yak'])
  })
})
