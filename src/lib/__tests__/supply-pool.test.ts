/**
 * Unit Tests for SupplyPool class
 *
 * Tests the in-memory pool operations:
 * - getAvailableCopies() filtering by card_name and tier eligibility
 * - markAssigned() removes copy from available pool
 * - markFreed() returns copy to available pool
 * - detectContentions() identifies correct contention pairs
 *
 * The SupplyPool is a pure in-memory data structure — no mocking needed.
 */

import { describe, it, expect } from 'vitest'
import { SupplyPool } from '@/lib/supply-pool'
import type { EnrichedSupplyEntry } from '@/lib/allocation-candidates'

// ---------------------------------------------------------------------------
// Test Data Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<EnrichedSupplyEntry> = {}): EnrichedSupplyEntry {
  return {
    physicalCopyId: 1,
    cardDefinitionId: 100,
    scryfallPrintingId: 'abc-123',
    isFoil: false,
    isProxy: false,
    condition: 'near_mint',
    storageLocationId: 1,
    storageLocationName: 'Binder A',
    assignedTo: null,
    ...overrides,
  }
}

function buildPool(entries: Map<string, EnrichedSupplyEntry[]>): SupplyPool {
  return new SupplyPool(entries)
}

// ---------------------------------------------------------------------------
// getAvailableCopies()
// ---------------------------------------------------------------------------

describe('SupplyPool.getAvailableCopies()', () => {
  it('returns Tier 1 (unassigned originals) and Tier 2 (unassigned proxies) copies sorted correctly', () => {
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [
      // Tier 1: unassigned original
      makeEntry({ physicalCopyId: 1, isProxy: false, assignedTo: null }),
      // Tier 2: unassigned proxy
      makeEntry({ physicalCopyId: 2, isProxy: true, assignedTo: null }),
      // Tier 3: assigned to another deck (excluded from auto-selection — all decks claim equally)
      makeEntry({
        physicalCopyId: 3,
        isProxy: false,
        assignedTo: {
          deckCardsId: 10,
          deckId: 5,
          deckName: 'World Breaker',
          deckStatus: 'brewing',
        },
      }),
      // Tier 3: assigned to another deck (also excluded)
      makeEntry({
        physicalCopyId: 4,
        isProxy: false,
        assignedTo: {
          deckCardsId: 20,
          deckId: 6,
          deckName: 'Arti-facts',
          deckStatus: 'in_rotation',
        },
      }),
    ])

    const pool = buildPool(entries)
    const available = pool.getAvailableCopies('Sol Ring')

    // Should include only Tier 1 and 2 (unassigned copies)
    // Tier 3 (assigned to any deck) is excluded from auto-selection
    expect(available).toHaveLength(2)

    // Verify Tier 3 copies are excluded
    const ids = available.map((e) => e.physicalCopyId)
    expect(ids).not.toContain(3)
    expect(ids).not.toContain(4)

    // Verify sorted by tier: Tier 1 first, then Tier 2
    expect(available[0].physicalCopyId).toBe(1) // Tier 1
    expect(available[1].physicalCopyId).toBe(2) // Tier 2
  })

  it('returns empty array for unknown card names', () => {
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [makeEntry({ physicalCopyId: 1 })])

    const pool = buildPool(entries)
    const available = pool.getAvailableCopies('Unknown Card')

    expect(available).toEqual([])
  })

  it('returns empty array when card exists but all copies are assigned to other decks', () => {
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Mana Crypt', [
      makeEntry({
        physicalCopyId: 10,
        assignedTo: {
          deckCardsId: 30,
          deckId: 7,
          deckName: 'Ice Queen',
          deckStatus: 'in_rotation',
        },
      }),
      makeEntry({
        physicalCopyId: 11,
        assignedTo: {
          deckCardsId: 31,
          deckId: 8,
          deckName: 'Enchantress',
          deckStatus: 'graveyard',
        },
      }),
    ])

    const pool = buildPool(entries)
    const available = pool.getAvailableCopies('Mana Crypt')

    expect(available).toEqual([])
  })

  it('sorts within same tier by score descending (non-foil preferred)', () => {
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Lightning Greaves', [
      // Tier 1, foil, non-near_mint — lower score
      makeEntry({ physicalCopyId: 1, isFoil: true, condition: 'lightly_played' }),
      // Tier 1, non-foil, near_mint — higher score
      makeEntry({ physicalCopyId: 2, isFoil: false, condition: 'near_mint' }),
    ])

    const pool = buildPool(entries)
    const available = pool.getAvailableCopies('Lightning Greaves')

    // Non-foil + near_mint should come first (higher score)
    expect(available[0].physicalCopyId).toBe(2)
    expect(available[1].physicalCopyId).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// markAssigned()
// ---------------------------------------------------------------------------

describe('SupplyPool.markAssigned()', () => {
  it('removes a copy from available pool after marking it assigned', () => {
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [
      makeEntry({ physicalCopyId: 1, assignedTo: null }),
      makeEntry({ physicalCopyId: 2, assignedTo: null }),
    ])

    const pool = buildPool(entries)

    // Before assignment: both available (Tier 1)
    expect(pool.getAvailableCopies('Sol Ring')).toHaveLength(2)

    // Assign copy 1
    pool.markAssigned(1, 100, 5, 'World Breaker')

    // After assignment: copy 1 is now Tier 3 (assigned), copy 2 still Tier 1
    // Only Tier 1-2 are returned by getAvailableCopies, so only 1 remains
    const available = pool.getAvailableCopies('Sol Ring')
    expect(available).toHaveLength(1)
    expect(available[0].physicalCopyId).toBe(2)
  })

  it('updates in-memory assignment state correctly', () => {
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [makeEntry({ physicalCopyId: 1, assignedTo: null })])

    const pool = buildPool(entries)
    pool.markAssigned(1, 100, 5, 'World Breaker')

    // The entry should now have assignedTo populated (but won't appear in getAvailableCopies)
    // We can verify by checking the raw pool - but since that's private, we verify
    // that getAvailableCopies returns empty (copy is now Tier 3)
    const available = pool.getAvailableCopies('Sol Ring')
    expect(available).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// markFreed()
// ---------------------------------------------------------------------------

describe('SupplyPool.markFreed()', () => {
  it('returns a previously-assigned copy to the available pool as Tier 1', () => {
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [
      makeEntry({
        physicalCopyId: 1,
        isProxy: false,
        assignedTo: {
          deckCardsId: 10,
          deckId: 5,
          deckName: 'World Breaker',
          deckStatus: 'brewing',
        },
      }),
    ])

    const pool = buildPool(entries)

    // Before freeing: copy is Tier 3 (assigned), excluded from available
    const beforeFree = pool.getAvailableCopies('Sol Ring')
    expect(beforeFree).toHaveLength(0)

    // Free the copy
    pool.markFreed(1)

    // After freeing: copy is Tier 1 (unassigned original)
    const afterFree = pool.getAvailableCopies('Sol Ring')
    expect(afterFree).toHaveLength(1)
    expect(afterFree[0].assignedTo).toBeNull()
  })

  it('makes an assigned copy available as Tier 1 after freeing', () => {
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Arcane Signet', [
      makeEntry({
        physicalCopyId: 5,
        isProxy: false,
        assignedTo: {
          deckCardsId: 20,
          deckId: 6,
          deckName: 'Arti-facts',
          deckStatus: 'in_rotation',
        },
      }),
    ])

    const pool = buildPool(entries)

    // Before freeing: Tier 3 — excluded from available
    expect(pool.getAvailableCopies('Arcane Signet')).toHaveLength(0)

    // Free the copy
    pool.markFreed(5)

    // After freeing: Tier 1 — now available
    const available = pool.getAvailableCopies('Arcane Signet')
    expect(available).toHaveLength(1)
    expect(available[0].physicalCopyId).toBe(5)
    expect(available[0].assignedTo).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// detectContentions()
// ---------------------------------------------------------------------------

describe('SupplyPool.detectContentions()', () => {
  it('identifies contention when deck B cannot get a card that deck A claimed in this session', () => {
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [
      makeEntry({ physicalCopyId: 1, assignedTo: null }),
    ])

    const pool = buildPool(entries)

    // Deck A (id=5, "World Breaker") claims Sol Ring
    pool.markAssigned(1, 100, 5, 'World Breaker')

    // Deck B (id=6, "Arti-facts") wants Sol Ring but supply is exhausted
    const unresolvedCards = [
      { cardName: 'Sol Ring', deckId: 6, deckName: 'Arti-facts' },
    ]

    const contentions = pool.detectContentions(unresolvedCards, 6)

    expect(contentions).toHaveLength(1)
    expect(contentions[0]).toEqual({
      cardName: 'Sol Ring',
      keptByDeckId: 5,
      keptByDeckName: 'World Breaker',
      lostByDeckId: 6,
      lostByDeckName: 'Arti-facts',
    })
  })

  it('returns empty array when no contentions exist (no session assignments for card)', () => {
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [
      makeEntry({ physicalCopyId: 1, assignedTo: null }),
    ])

    const pool = buildPool(entries)

    // No assignments made during this session
    const unresolvedCards = [
      { cardName: 'Sol Ring', deckId: 6, deckName: 'Arti-facts' },
    ]

    const contentions = pool.detectContentions(unresolvedCards, 6)

    expect(contentions).toEqual([])
  })

  it('returns empty array when the unresolved card does not exist in the pool', () => {
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [makeEntry({ physicalCopyId: 1 })])

    const pool = buildPool(entries)

    const unresolvedCards = [
      { cardName: 'Nonexistent Card', deckId: 6, deckName: 'Arti-facts' },
    ]

    const contentions = pool.detectContentions(unresolvedCards, 6)

    expect(contentions).toEqual([])
  })

  it('correctly identifies multiple contentions across different cards', () => {
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [makeEntry({ physicalCopyId: 1, assignedTo: null })])
    entries.set('Mana Crypt', [makeEntry({ physicalCopyId: 2, assignedTo: null })])

    const pool = buildPool(entries)

    // Deck A (id=5) claims both Sol Ring and Mana Crypt
    pool.markAssigned(1, 100, 5, 'World Breaker')
    pool.markAssigned(2, 101, 5, 'World Breaker')

    // Deck B (id=6) wants both but can't get them
    const unresolvedCards = [
      { cardName: 'Sol Ring', deckId: 6, deckName: 'Arti-facts' },
      { cardName: 'Mana Crypt', deckId: 6, deckName: 'Arti-facts' },
    ]

    const contentions = pool.detectContentions(unresolvedCards, 6)

    expect(contentions).toHaveLength(2)
    expect(contentions.find((c) => c.cardName === 'Sol Ring')).toEqual({
      cardName: 'Sol Ring',
      keptByDeckId: 5,
      keptByDeckName: 'World Breaker',
      lostByDeckId: 6,
      lostByDeckName: 'Arti-facts',
    })
    expect(contentions.find((c) => c.cardName === 'Mana Crypt')).toEqual({
      cardName: 'Mana Crypt',
      keptByDeckId: 5,
      keptByDeckName: 'World Breaker',
      lostByDeckId: 6,
      lostByDeckName: 'Arti-facts',
    })
  })

  it('does not report contention when the same deck assigned the copy to itself', () => {
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [makeEntry({ physicalCopyId: 1, assignedTo: null })])

    const pool = buildPool(entries)

    // Deck A assigns Sol Ring to itself
    pool.markAssigned(1, 100, 5, 'World Breaker')

    // Same deck (id=5) has an unresolved card issue — but it assigned it to itself
    const unresolvedCards = [
      { cardName: 'Sol Ring', deckId: 5, deckName: 'World Breaker' },
    ]

    // Current deck is also 5 — detecting contentions for deck 5's perspective
    const contentions = pool.detectContentions(unresolvedCards, 5)

    // No contention because the keeper (5) is the same as both currentDeckId and lostByDeckId
    expect(contentions).toEqual([])
  })
})
