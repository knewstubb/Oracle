/**
 * Integration Tests — Full Reimport & Batch Resolution Flows
 *
 * Tests end-to-end scenarios using the diff primitive and SupplyPool together.
 * These test the pure function layer + SupplyPool class without hitting a real database.
 *
 * Validates: Requirements 2.1, 2.6, 2.7, 2.8, 2.9, 2.11, 3.3
 */

import { describe, it, expect } from 'vitest'
import { diffDeckCards } from '@/lib/deck-cards-diff'
import type { ExistingDeckCardRow, IncomingCard } from '@/lib/deck-cards-diff'
import { SupplyPool } from '@/lib/supply-pool'
import type { EnrichedSupplyEntry } from '@/lib/allocation-candidates'

// ---------------------------------------------------------------------------
// Test Data Helpers
// ---------------------------------------------------------------------------

let nextRowId = 1

function makeExistingRow(overrides: Partial<ExistingDeckCardRow> = {}): ExistingDeckCardRow {
  const id = nextRowId++
  return {
    id,
    deck_id: 1,
    card_name: 'Sol Ring',
    scryfall_id: 'sol-ring-001',
    set_code: 'cmd',
    quantity: 1,
    categories: 'Ramp',
    is_commander: false,
    user_id: 'user-1',
    physical_copy_id: null,
    ownership_status: null,
    proxy_of_deck_id: null,
    dead_weight_flag: null,
    dead_weight_reason: null,
    ...overrides,
  }
}

function makeIncoming(overrides: Partial<IncomingCard> = {}): IncomingCard {
  return {
    card_name: 'Sol Ring',
    scryfall_id: 'sol-ring-001',
    set_code: 'cmd',
    quantity: 1,
    categories: 'Ramp',
    is_commander: false,
    ...overrides,
  }
}

function makeSupplyEntry(overrides: Partial<EnrichedSupplyEntry> = {}): EnrichedSupplyEntry {
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

// ---------------------------------------------------------------------------
// Scenario 1: Full Reimport Flow
// ---------------------------------------------------------------------------

describe('Integration: Full Reimport Flow', () => {
  it('preserves enriched columns on persisting cards, nulls on new cards, removes deleted cards', () => {
    // Simulate a deck that has been enriched after initial import
    const existingRows: ExistingDeckCardRow[] = [
      // Card 1: Sol Ring — enriched with physical copy + categories edited
      makeExistingRow({
        id: 100,
        card_name: 'Sol Ring',
        scryfall_id: 'sol-ring-001',
        categories: 'Ramp,Must-Have',
        physical_copy_id: 501,
        ownership_status: 'original',
      }),
      // Card 2: Mana Crypt — enriched with dead_weight flag
      makeExistingRow({
        id: 101,
        card_name: 'Mana Crypt',
        scryfall_id: 'mana-crypt-001',
        categories: 'Ramp',
        physical_copy_id: 502,
        ownership_status: 'original',
        dead_weight_flag: 'true',
        dead_weight_reason: 'Too expensive for casual pod',
      }),
      // Card 3: Lightning Greaves — enriched with proxy reference
      makeExistingRow({
        id: 102,
        card_name: 'Lightning Greaves',
        scryfall_id: 'greaves-001',
        categories: 'Protection',
        physical_copy_id: 503,
        ownership_status: 'proxy',
        proxy_of_deck_id: 5,
      }),
      // Card 4: Counterspell — will be REMOVED in reimport
      makeExistingRow({
        id: 103,
        card_name: 'Counterspell',
        scryfall_id: 'counter-001',
        categories: 'Interaction',
        physical_copy_id: 504,
        ownership_status: 'original',
      }),
      // Card 5: Arcane Signet — no enrichment
      makeExistingRow({
        id: 104,
        card_name: 'Arcane Signet',
        scryfall_id: 'signet-001',
        categories: 'Ramp',
        physical_copy_id: null,
        ownership_status: null,
      }),
    ]

    // Incoming cards from Archidekt reimport:
    // - Sol Ring still present (persists)
    // - Mana Crypt still present (persists)
    // - Lightning Greaves still present (persists)
    // - Counterspell REMOVED
    // - Arcane Signet still present (persists)
    // - Swan Song ADDED (new card)
    // - Fierce Guardianship ADDED (new card)
    const incoming: IncomingCard[] = [
      makeIncoming({ card_name: 'Sol Ring', scryfall_id: 'sol-ring-001', categories: 'Ramp' }),
      makeIncoming({ card_name: 'Mana Crypt', scryfall_id: 'mana-crypt-001', categories: 'Ramp' }),
      makeIncoming({ card_name: 'Lightning Greaves', scryfall_id: 'greaves-001', categories: 'Protection' }),
      makeIncoming({ card_name: 'Arcane Signet', scryfall_id: 'signet-001', categories: 'Ramp' }),
      makeIncoming({ card_name: 'Swan Song', scryfall_id: 'swan-001', set_code: 'c16', categories: 'Interaction' }),
      makeIncoming({ card_name: 'Fierce Guardianship', scryfall_id: 'fierce-001', set_code: 'c20', categories: 'Interaction' }),
    ]

    const diff = diffDeckCards(existingRows, incoming)

    // Verify: Persisting cards are in toKeep (enriched columns preserved implicitly)
    expect(diff.toKeep).toContain(100) // Sol Ring
    expect(diff.toKeep).toContain(101) // Mana Crypt
    expect(diff.toKeep).toContain(102) // Lightning Greaves
    expect(diff.toKeep).toContain(104) // Arcane Signet

    // Verify: Removed card is in toDelete
    expect(diff.toDelete).toContain(103) // Counterspell

    // Verify: New cards are in toInsert with null enriched columns
    expect(diff.toInsert).toHaveLength(2)
    const swanSong = diff.toInsert.find(r => r.card_name === 'Swan Song')
    const fierce = diff.toInsert.find(r => r.card_name === 'Fierce Guardianship')

    expect(swanSong).toBeDefined()
    expect(swanSong!.physical_copy_id).toBeNull()
    expect(swanSong!.ownership_status).toBeNull()
    expect(swanSong!.categories).toBe('Interaction')

    expect(fierce).toBeDefined()
    expect(fierce!.physical_copy_id).toBeNull()
    expect(fierce!.ownership_status).toBeNull()

    // Verify: Overall card count
    // Started with 5, removed 1, added 2 → should end with 6
    const finalCount = diff.toKeep.length + diff.toInsert.length
    expect(finalCount).toBe(6)
  })

  it('handles quantity increase for existing printing slot', () => {
    // Deck has 1 copy of a card, reimport says 2
    const existingRows: ExistingDeckCardRow[] = [
      makeExistingRow({
        id: 200,
        card_name: 'Reliquary Tower',
        scryfall_id: 'tower-001',
        physical_copy_id: 600,
        ownership_status: 'original',
      }),
    ]

    const incoming: IncomingCard[] = [
      makeIncoming({ card_name: 'Reliquary Tower', scryfall_id: 'tower-001', quantity: 2 }),
    ]

    const diff = diffDeckCards(existingRows, incoming)

    // Existing row preserved
    expect(diff.toKeep).toContain(200)
    // One new row inserted (no enrichment)
    expect(diff.toInsert).toHaveLength(1)
    expect(diff.toInsert[0].card_name).toBe('Reliquary Tower')
    expect(diff.toInsert[0].physical_copy_id).toBeNull()
    // Nothing deleted
    expect(diff.toDelete).toHaveLength(0)
  })

  it('prefers deleting unassigned rows when quantity decreases', () => {
    // Deck has 3 copies: 2 assigned, 1 unassigned. Reimport reduces to 2.
    const existingRows: ExistingDeckCardRow[] = [
      makeExistingRow({
        id: 300,
        card_name: 'Forest',
        scryfall_id: 'forest-001',
        physical_copy_id: 700,
        ownership_status: 'original',
      }),
      makeExistingRow({
        id: 301,
        card_name: 'Forest',
        scryfall_id: 'forest-001',
        physical_copy_id: null,
        ownership_status: null,
      }),
      makeExistingRow({
        id: 302,
        card_name: 'Forest',
        scryfall_id: 'forest-001',
        physical_copy_id: 701,
        ownership_status: 'original',
      }),
    ]

    const incoming: IncomingCard[] = [
      makeIncoming({ card_name: 'Forest', scryfall_id: 'forest-001', quantity: 2 }),
    ]

    const diff = diffDeckCards(existingRows, incoming)

    // The unassigned row (301) should be deleted, assigned rows kept
    expect(diff.toDelete).toContain(301)
    expect(diff.toDelete).toHaveLength(1)
    expect(diff.toKeep).toContain(300)
    expect(diff.toKeep).toContain(302)
  })
})

// ---------------------------------------------------------------------------
// Scenario 2: Batch Resolution with SupplyPool
// ---------------------------------------------------------------------------

describe('Integration: Batch Resolution with SupplyPool', () => {
  it('resolves 3 decks sequentially — first pick priority, supply exhaustion', () => {
    // Create a pool with limited supply:
    // Sol Ring: 2 copies
    // Mana Crypt: 1 copy
    // Arcane Signet: 3 copies
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [
      makeSupplyEntry({ physicalCopyId: 1, assignedTo: null }),
      makeSupplyEntry({ physicalCopyId: 2, assignedTo: null }),
    ])
    entries.set('Mana Crypt', [
      makeSupplyEntry({ physicalCopyId: 3, assignedTo: null }),
    ])
    entries.set('Arcane Signet', [
      makeSupplyEntry({ physicalCopyId: 4, assignedTo: null }),
      makeSupplyEntry({ physicalCopyId: 5, assignedTo: null }),
      makeSupplyEntry({ physicalCopyId: 6, assignedTo: null }),
    ])

    const pool = new SupplyPool(entries)

    // --- Deck 1: "World Breaker" wants Sol Ring, Mana Crypt, Arcane Signet ---
    const deck1Cards = ['Sol Ring', 'Mana Crypt', 'Arcane Signet']
    const deck1Assignments: Array<{ cardName: string; physicalCopyId: number }> = []

    for (const cardName of deck1Cards) {
      const available = pool.getAvailableCopies(cardName)
      if (available.length > 0) {
        const best = available[0]
        pool.markAssigned(best.physicalCopyId, 1000 + deck1Assignments.length, 10, 'World Breaker')
        deck1Assignments.push({ cardName, physicalCopyId: best.physicalCopyId })
      }
    }

    // Deck 1 gets first pick of everything
    expect(deck1Assignments).toHaveLength(3)
    expect(deck1Assignments.find(a => a.cardName === 'Sol Ring')!.physicalCopyId).toBe(1)
    expect(deck1Assignments.find(a => a.cardName === 'Mana Crypt')!.physicalCopyId).toBe(3)
    expect(deck1Assignments.find(a => a.cardName === 'Arcane Signet')!.physicalCopyId).toBe(4)

    // --- Deck 2: "Ice Queen" wants Sol Ring, Mana Crypt, Arcane Signet ---
    const deck2Cards = ['Sol Ring', 'Mana Crypt', 'Arcane Signet']
    const deck2Assignments: Array<{ cardName: string; physicalCopyId: number }> = []
    const deck2Unresolved: Array<{ cardName: string; deckId: number; deckName: string }> = []

    for (const cardName of deck2Cards) {
      const available = pool.getAvailableCopies(cardName)
      // Filter to Tier 1-2 only (unassigned) for simplicity —
      // In real code, Tier 3 (assigned to brew) is also eligible but we test pure exhaustion
      const unassigned = available.filter(e => e.assignedTo === null)
      if (unassigned.length > 0) {
        const best = unassigned[0]
        pool.markAssigned(best.physicalCopyId, 2000 + deck2Assignments.length, 20, 'Ice Queen')
        deck2Assignments.push({ cardName, physicalCopyId: best.physicalCopyId })
      } else {
        deck2Unresolved.push({ cardName, deckId: 20, deckName: 'Ice Queen' })
      }
    }

    // Deck 2 gets second Sol Ring copy, cannot get Mana Crypt (only 1 existed)
    expect(deck2Assignments.find(a => a.cardName === 'Sol Ring')!.physicalCopyId).toBe(2)
    expect(deck2Assignments.find(a => a.cardName === 'Arcane Signet')!.physicalCopyId).toBe(5)
    expect(deck2Unresolved.find(u => u.cardName === 'Mana Crypt')).toBeDefined()

    // --- Deck 3: "Arti-facts" wants Sol Ring, Arcane Signet ---
    const deck3Cards = ['Sol Ring', 'Arcane Signet']
    const deck3Assignments: Array<{ cardName: string; physicalCopyId: number }> = []
    const deck3Unresolved: Array<{ cardName: string; deckId: number; deckName: string }> = []

    for (const cardName of deck3Cards) {
      const available = pool.getAvailableCopies(cardName)
      const unassigned = available.filter(e => e.assignedTo === null)
      if (unassigned.length > 0) {
        const best = unassigned[0]
        pool.markAssigned(best.physicalCopyId, 3000 + deck3Assignments.length, 30, 'Arti-facts')
        deck3Assignments.push({ cardName, physicalCopyId: best.physicalCopyId })
      } else {
        deck3Unresolved.push({ cardName, deckId: 30, deckName: 'Arti-facts' })
      }
    }

    // Deck 3: Sol Ring supply exhausted (both copies taken), Arcane Signet has last copy
    expect(deck3Unresolved.find(u => u.cardName === 'Sol Ring')).toBeDefined()
    expect(deck3Assignments.find(a => a.cardName === 'Arcane Signet')!.physicalCopyId).toBe(6)

    // Verify final pool state: all Sol Rings assigned, Mana Crypt assigned, all Signets assigned
    const solRingAvailable = pool.getAvailableCopies('Sol Ring').filter(e => e.assignedTo === null)
    const manaCryptAvailable = pool.getAvailableCopies('Mana Crypt').filter(e => e.assignedTo === null)
    const signetAvailable = pool.getAvailableCopies('Arcane Signet').filter(e => e.assignedTo === null)

    expect(solRingAvailable).toHaveLength(0)
    expect(manaCryptAvailable).toHaveLength(0)
    expect(signetAvailable).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Scenario 3: Transaction Rollback Simulation (Edge Cases)
// ---------------------------------------------------------------------------

describe('Integration: Diff Computation Edge Cases (Rollback Scenarios)', () => {
  it('handles empty existing rows (first-time import)', () => {
    const incoming: IncomingCard[] = [
      makeIncoming({ card_name: 'Sol Ring', scryfall_id: 'sol-001' }),
      makeIncoming({ card_name: 'Mana Crypt', scryfall_id: 'crypt-001' }),
      makeIncoming({ card_name: 'Command Tower', scryfall_id: 'tower-001' }),
    ]

    const diff = diffDeckCards([], incoming)

    expect(diff.toDelete).toHaveLength(0)
    expect(diff.toKeep).toHaveLength(0)
    expect(diff.toInsert).toHaveLength(3)
    // All inserts have null enriched columns
    for (const row of diff.toInsert) {
      expect(row.physical_copy_id).toBeNull()
      expect(row.ownership_status).toBeNull()
    }
  })

  it('handles empty incoming cards (all cards removed)', () => {
    const existingRows: ExistingDeckCardRow[] = [
      makeExistingRow({ id: 400, card_name: 'Sol Ring', scryfall_id: 'sol-001' }),
      makeExistingRow({ id: 401, card_name: 'Mana Crypt', scryfall_id: 'crypt-001' }),
    ]

    const diff = diffDeckCards(existingRows, [])

    expect(diff.toDelete).toEqual([400, 401])
    expect(diff.toKeep).toHaveLength(0)
    expect(diff.toInsert).toHaveLength(0)
  })

  it('handles both empty (no existing, no incoming)', () => {
    const diff = diffDeckCards([], [])

    expect(diff.toDelete).toHaveLength(0)
    expect(diff.toKeep).toHaveLength(0)
    expect(diff.toInsert).toHaveLength(0)
  })

  it('handles complete replacement (all old removed, all new added)', () => {
    const existingRows: ExistingDeckCardRow[] = [
      makeExistingRow({ id: 500, card_name: 'Card A', scryfall_id: 'a-001' }),
      makeExistingRow({ id: 501, card_name: 'Card B', scryfall_id: 'b-001' }),
    ]

    const incoming: IncomingCard[] = [
      makeIncoming({ card_name: 'Card C', scryfall_id: 'c-001' }),
      makeIncoming({ card_name: 'Card D', scryfall_id: 'd-001' }),
    ]

    const diff = diffDeckCards(existingRows, incoming)

    // All old rows deleted
    expect(diff.toDelete).toContain(500)
    expect(diff.toDelete).toContain(501)
    expect(diff.toDelete).toHaveLength(2)
    // All new rows inserted
    expect(diff.toInsert).toHaveLength(2)
    expect(diff.toKeep).toHaveLength(0)
  })

  it('correctly computes diff when same card name has different scryfall_ids (printing swap)', () => {
    // Sol Ring printing changed from one set to another
    const existingRows: ExistingDeckCardRow[] = [
      makeExistingRow({
        id: 600,
        card_name: 'Sol Ring',
        scryfall_id: 'sol-ring-old-printing',
        physical_copy_id: 800,
        ownership_status: 'original',
      }),
    ]

    const incoming: IncomingCard[] = [
      makeIncoming({ card_name: 'Sol Ring', scryfall_id: 'sol-ring-new-printing' }),
    ]

    const diff = diffDeckCards(existingRows, incoming)

    // Different scryfall_id = different printing slot → old deleted, new inserted
    expect(diff.toDelete).toContain(600)
    expect(diff.toInsert).toHaveLength(1)
    expect(diff.toInsert[0].scryfall_id).toBe('sol-ring-new-printing')
    expect(diff.toInsert[0].physical_copy_id).toBeNull()
  })
})


// ---------------------------------------------------------------------------
// Scenario 4: Contention Detection
// ---------------------------------------------------------------------------

describe('Integration: Contention Detection from Pool State', () => {
  it('detects contention when two decks want the same scarce card', () => {
    // Pool has exactly 1 Sol Ring
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [
      makeSupplyEntry({ physicalCopyId: 10, assignedTo: null }),
    ])
    entries.set('Arcane Signet', [
      makeSupplyEntry({ physicalCopyId: 11, assignedTo: null }),
      makeSupplyEntry({ physicalCopyId: 12, assignedTo: null }),
    ])

    const pool = new SupplyPool(entries)

    // Deck A ("World Breaker") resolves first — gets Sol Ring + Arcane Signet
    const deckACards = ['Sol Ring', 'Arcane Signet']
    for (const cardName of deckACards) {
      const available = pool.getAvailableCopies(cardName)
      if (available.length > 0) {
        pool.markAssigned(available[0].physicalCopyId, 100, 1, 'World Breaker')
      }
    }

    // Deck B ("Ice Queen") resolves second — wants Sol Ring but can't get it
    const deckBCards = ['Sol Ring', 'Arcane Signet']
    const deckBUnresolved: Array<{ cardName: string; deckId: number; deckName: string }> = []

    for (const cardName of deckBCards) {
      const available = pool.getAvailableCopies(cardName)
      const unassigned = available.filter(e => e.assignedTo === null)
      if (unassigned.length > 0) {
        pool.markAssigned(unassigned[0].physicalCopyId, 200, 2, 'Ice Queen')
      } else {
        deckBUnresolved.push({ cardName, deckId: 2, deckName: 'Ice Queen' })
      }
    }

    // Deck B couldn't get Sol Ring
    expect(deckBUnresolved).toHaveLength(1)
    expect(deckBUnresolved[0].cardName).toBe('Sol Ring')

    // Detect contentions from Deck B's perspective
    const contentions = pool.detectContentions(deckBUnresolved, 2)

    expect(contentions).toHaveLength(1)
    expect(contentions[0]).toEqual({
      cardName: 'Sol Ring',
      keptByDeckId: 1,
      keptByDeckName: 'World Breaker',
      lostByDeckId: 2,
      lostByDeckName: 'Ice Queen',
    })
  })

  it('reports no contention when supply is sufficient for all decks', () => {
    // Pool has 3 Sol Rings — enough for 2 decks
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [
      makeSupplyEntry({ physicalCopyId: 20, assignedTo: null }),
      makeSupplyEntry({ physicalCopyId: 21, assignedTo: null }),
      makeSupplyEntry({ physicalCopyId: 22, assignedTo: null }),
    ])

    const pool = new SupplyPool(entries)

    // Deck A gets one
    pool.markAssigned(20, 100, 1, 'World Breaker')

    // Deck B gets another
    const available = pool.getAvailableCopies('Sol Ring').filter(e => e.assignedTo === null)
    expect(available.length).toBeGreaterThan(0)
    pool.markAssigned(available[0].physicalCopyId, 200, 2, 'Ice Queen')

    // No unresolved cards for Deck B — no contentions
    const contentions = pool.detectContentions([], 2)
    expect(contentions).toHaveLength(0)
  })

  it('detects multiple contentions across different card names', () => {
    // Pool: 1 Sol Ring, 1 Mana Crypt — both scarce
    const entries = new Map<string, EnrichedSupplyEntry[]>()
    entries.set('Sol Ring', [
      makeSupplyEntry({ physicalCopyId: 30, assignedTo: null }),
    ])
    entries.set('Mana Crypt', [
      makeSupplyEntry({ physicalCopyId: 31, assignedTo: null }),
    ])

    const pool = new SupplyPool(entries)

    // Deck A claims both
    pool.markAssigned(30, 100, 1, 'World Breaker')
    pool.markAssigned(31, 101, 1, 'World Breaker')

    // Deck B can't get either
    const deckBUnresolved = [
      { cardName: 'Sol Ring', deckId: 2, deckName: 'Ice Queen' },
      { cardName: 'Mana Crypt', deckId: 2, deckName: 'Ice Queen' },
    ]

    const contentions = pool.detectContentions(deckBUnresolved, 2)

    expect(contentions).toHaveLength(2)
    expect(contentions.find(c => c.cardName === 'Sol Ring')).toEqual({
      cardName: 'Sol Ring',
      keptByDeckId: 1,
      keptByDeckName: 'World Breaker',
      lostByDeckId: 2,
      lostByDeckName: 'Ice Queen',
    })
    expect(contentions.find(c => c.cardName === 'Mana Crypt')).toEqual({
      cardName: 'Mana Crypt',
      keptByDeckId: 1,
      keptByDeckName: 'World Breaker',
      lostByDeckId: 2,
      lostByDeckName: 'Ice Queen',
    })
  })
})
