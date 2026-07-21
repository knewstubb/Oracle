import { describe, it, expect } from 'vitest'
import { classifyTier, scoreCandidate, type EnrichedSupplyEntry } from './allocation-candidates'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<EnrichedSupplyEntry> = {}): EnrichedSupplyEntry {
  return {
    physicalCopyId: 1,
    cardDefinitionId: 100,
    scryfallPrintingId: null,
    isFoil: false,
    isProxy: false,
    condition: null,
    storageLocationId: null,
    storageLocationName: null,
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

  it('returns 3 for copy assigned to a brew-status deck', () => {
    const entry = makeEntry({
      assignedTo: {
        deckCardsId: 10,
        deckId: 5,
        deckName: 'My Brew Deck',
        deckStatus: 'brewing',
      },
    })
    expect(classifyTier(entry)).toBe(3)
  })

  it('returns 4 for copy assigned to a boxed-status deck', () => {
    const entry = makeEntry({
      assignedTo: {
        deckCardsId: 11,
        deckId: 6,
        deckName: 'My Boxed Deck',
        deckStatus: 'in_rotation',
      },
    })
    expect(classifyTier(entry)).toBe(4)
  })

  it('returns 4 for copy assigned to an archived-status deck', () => {
    const entry = makeEntry({
      assignedTo: {
        deckCardsId: 12,
        deckId: 7,
        deckName: 'My Archived Deck',
        deckStatus: 'graveyard',
      },
    })
    expect(classifyTier(entry)).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// scoreCandidate
// ---------------------------------------------------------------------------

describe('scoreCandidate', () => {
  it('gives +2 for matching scryfall printing', () => {
    const entry = makeEntry({
      scryfallPrintingId: 'abc-123',
      isFoil: true, // foil so non-foil bonus doesn't apply
      condition: 'lightly_played',
    })
    expect(scoreCandidate(entry, 'abc-123')).toBe(2)
  })

  it('gives +1 for non-foil', () => {
    const entry = makeEntry({
      scryfallPrintingId: null,
      isFoil: false,
      condition: 'lightly_played',
    })
    expect(scoreCandidate(entry, null)).toBe(1)
  })

  it('gives +1 for near_mint condition', () => {
    const entry = makeEntry({
      scryfallPrintingId: null,
      isFoil: true, // foil so non-foil bonus doesn't apply
      condition: 'near_mint',
    })
    expect(scoreCandidate(entry, null)).toBe(1)
  })

  it('scores accumulate: matching + non-foil + near_mint = 4', () => {
    const entry = makeEntry({
      scryfallPrintingId: 'xyz-789',
      isFoil: false,
      condition: 'near_mint',
    })
    expect(scoreCandidate(entry, 'xyz-789')).toBe(4)
  })
})
