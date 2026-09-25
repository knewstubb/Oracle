import { describe, it, expect } from 'vitest'
import { classifyTier, scoreCandidate, type EnrichedSupplyEntry } from './allocation-candidates'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<EnrichedSupplyEntry> = {}): EnrichedSupplyEntry {
  return {
    physicalCopyId: 1,
    cardId: 100,
    printingId: null,
    finish: 'nonfoil',
    isProxy: false,
    condition: null,
    locationId: null,
    locationName: null,
    assignedTo: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// classifyTier
// ---------------------------------------------------------------------------

describe('classifyTier', () => {
  it('returns 1 for unallocated non-proxy (free original)', () => {
    const entry = makeEntry({ assignedTo: null, isProxy: false })
    expect(classifyTier(entry)).toBe(1)
  })

  it('returns 2 for unallocated proxy (free proxy)', () => {
    const entry = makeEntry({ assignedTo: null, isProxy: true })
    expect(classifyTier(entry)).toBe(2)
  })

  it('returns 3 for a copy assigned to another deck (all decks claim equally)', () => {
    const entry = makeEntry({
      assignedTo: {
        deckCardsId: 10,
        deckId: 5,
        deckName: 'My Brew Deck',
      },
    })
    expect(classifyTier(entry)).toBe(3)
  })

  it('returns 3 for a copy assigned to a boxed deck (Tier 4 was retired)', () => {
    const entry = makeEntry({
      assignedTo: {
        deckCardsId: 11,
        deckId: 6,
        deckName: 'My Boxed Deck',
      },
    })
    expect(classifyTier(entry)).toBe(3)
  })

  it('returns 3 for a copy assigned to an archived deck', () => {
    const entry = makeEntry({
      assignedTo: {
        deckCardsId: 12,
        deckId: 7,
        deckName: 'My Archived Deck',
      },
    })
    expect(classifyTier(entry)).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// scoreCandidate
// ---------------------------------------------------------------------------

describe('scoreCandidate', () => {
  it('gives +2 for matching scryfall printing', () => {
    const entry = makeEntry({
      printingId: 'abc-123',
      finish: 'foil', // foil so non-foil bonus doesn't apply
      condition: 'lightly_played',
    })
    expect(scoreCandidate(entry, 'abc-123')).toBe(2)
  })

  it('gives +1 for non-foil', () => {
    const entry = makeEntry({
      printingId: null,
      finish: 'nonfoil',
      condition: 'lightly_played',
    })
    expect(scoreCandidate(entry, null)).toBe(1)
  })

  it('gives +1 for near_mint condition', () => {
    const entry = makeEntry({
      printingId: null,
      finish: 'foil', // foil so non-foil bonus doesn't apply
      condition: 'near_mint',
    })
    expect(scoreCandidate(entry, null)).toBe(1)
  })

  it('scores accumulate: matching + non-foil + near_mint = 4', () => {
    const entry = makeEntry({
      printingId: 'xyz-789',
      finish: 'nonfoil',
      condition: 'near_mint',
    })
    expect(scoreCandidate(entry, 'xyz-789')).toBe(4)
  })
})
