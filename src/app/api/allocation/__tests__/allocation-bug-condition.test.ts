/**
 * Bug Condition Exploration Test
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 *
 * Property 1: Bug Condition - Allocation Routes Read Stale deck_allocations Data
 *
 * This test encodes the EXPECTED behavior: allocation routes should derive
 * state from `deck_cards.physical_copy_id` rather than the frozen `deck_allocations`
 * table. On UNFIXED code, this test MUST FAIL — proving the bug exists.
 *
 * Setup: deck_cards.physical_copy_id assigns copy X to deck A,
 *        but deck_allocations assigns copy X to deck B.
 * Assert: responses reflect deck_cards.physical_copy_id (not deck_allocations).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as fc from 'fast-check'

// ---------------------------------------------------------------------------
// Mock Auth — always authenticated
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(async () => ({ id: 'test-user' })),
}))

// ---------------------------------------------------------------------------
// Mock allocation-store (legacy paths — not under test)
// ---------------------------------------------------------------------------

vi.mock('@/lib/allocation-store', () => ({
  getAllocationsForDeck: vi.fn(async () => []),
  getAllocationsForCard: vi.fn(async () => []),
  getProxyReport: vi.fn(async () => []),
}))

// ---------------------------------------------------------------------------
// Test State — seeded per property run
// ---------------------------------------------------------------------------

interface MockDeckCard {
  card_name: string
  deck_id: number
  ownership_status: string | null
  proxy_of_deck_id: number | null
  scryfall_id: string | null
  set_code: string | null
  physical_copy_id: number | null
  decks: { name: string; status: string }
}

interface MockCollectionRow {
  id: number
  card_name: string
  scryfall_id: string | null
  set_code: string | null
  edition_name: string | null
  foil: boolean
  quantity: number
  storage_location_id: number | null
  collector_number: string | null
  finish: string | null
}

interface MockDeckAllocation {
  card_name: string
  scryfall_id: string | null
  deck_id: number
  role: string
}

interface MockPhysicalCopy {
  id: number
  card_definition_id: number
  is_proxy: boolean
  scryfall_printing_id: string | null
  is_foil?: boolean
  storage_location_id?: number | null
}

interface MockCardDefinition {
  id: number
  card_name: string
}

interface MockDeck {
  id: number
  name: string
  status: string
}

let mockDeckCards: MockDeckCard[] = []
let mockCollectionRows: MockCollectionRow[] = []
let mockDeckAllocations: MockDeckAllocation[] = []
let mockPhysicalCopies: MockPhysicalCopy[] = []
let mockCardDefinitions: MockCardDefinition[] = []
let mockDecks: MockDeck[] = []

// ---------------------------------------------------------------------------
// Mock Supabase — routes table-specific data
// ---------------------------------------------------------------------------

function createMockChain(data: unknown[] | null, error: unknown = null) {
  const chain: any = {
    _data: data ? [...data] : [],
    _error: error,
    select(_fields?: string, _opts?: any) { return chain },
    eq(field: string, value: any) {
      if (chain._data && Array.isArray(chain._data)) {
        // Skip relationship filter (e.g., 'decks.status') — already handled in select override
        if (!field.includes('.')) {
          chain._data = chain._data.filter((row: any) => row[field] === value)
        }
      }
      return chain
    },
    in(field: string, values: any[]) {
      if (chain._data && Array.isArray(chain._data)) {
        chain._data = chain._data.filter((row: any) =>
          values.includes(row[field])
        )
      }
      return chain
    },
    not(field: string, op: string, _val: any) {
      if (chain._data && Array.isArray(chain._data)) {
        if (op === 'is') {
          // .not('physical_copy_id', 'is', null) → filter rows WHERE physical_copy_id IS NOT NULL
          chain._data = chain._data.filter((row: any) => row[field] !== null && row[field] !== undefined)
        }
      }
      return chain
    },
    order(_field: string, _opts?: any) { return chain },
    range(_from: number, _to: number) { return chain },
    maybeSingle() {
      const item = chain._data?.[0] ?? null
      return Promise.resolve({ data: item, error: null })
    },
    then(
      onFulfilled: (val: any) => any,
      onRejected?: (err: any) => any
    ) {
      return Promise.resolve({
        data: chain._data,
        error: chain._error,
        count: chain._data?.length ?? 0
      }).then(onFulfilled, onRejected)
    },
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      switch (table) {
        case 'deck_cards': {
          const chain = createMockChain(mockDeckCards)
          // Override select to handle the join pattern for active decks
          chain.select = (fields: string, _opts?: any) => {
            if (fields.includes('decks!deck_cards_deck_id_fkey(status)')) {
              // Step 1 query: card_name, deck_id + join to decks for status filter
              // Return rows with the nested decks object (active filter via .eq)
              chain._data = mockDeckCards
                .filter(r => r.decks.status === 'active')
                .map(r => ({
                  card_name: r.card_name,
                  deck_id: r.deck_id,
                  decks: r.decks,
                }))
            } else if (fields.includes('decks!deck_cards_deck_id_fkey(name)')) {
              // Step 3 query or view=all assignment query: full deck_cards with deck name join
              chain._data = mockDeckCards.map(r => ({
                ...r,
                decks: { name: r.decks.name },
              }))
            } else if (fields === 'card_name, set_code, scryfall_id, deck_id, tags') {
              // shared-cards route query
              chain._data = mockDeckCards.map(r => ({
                card_name: r.card_name,
                set_code: r.set_code,
                scryfall_id: r.scryfall_id,
                deck_id: r.deck_id,
                tags: null,
              }))
            } else {
              chain._data = [...mockDeckCards]
            }
            return chain
          }
          return chain
        }
        case 'collection': {
          const chain = createMockChain(mockCollectionRows)
          chain.select = (_fields: string, opts?: any) => {
            if (opts?.count === 'exact' && opts?.head) {
              chain._data = []
              chain.then = (onFulfilled: any, onRejected?: any) => {
                return Promise.resolve({
                  data: null,
                  error: null,
                  count: mockCollectionRows.length
                }).then(onFulfilled, onRejected)
              }
            } else {
              chain._data = [...mockCollectionRows]
            }
            return chain
          }
          return chain
        }
        case 'deck_allocations':
          return createMockChain(mockDeckAllocations)
        case 'physical_copies': {
          const chain = createMockChain(mockPhysicalCopies)
          // Override select to handle the inner join pattern: card_definitions!physical_copies_card_definition_id_fkey(...)
          chain.select = (fields: string, opts?: any) => {
            if (opts?.count === 'exact' && opts?.head) {
              // Count query pattern
              chain._data = []
              chain.then = (onFulfilled: any, onRejected?: any) => {
                return Promise.resolve({
                  data: null,
                  error: null,
                  count: mockPhysicalCopies.length
                }).then(onFulfilled, onRejected)
              }
            } else if (fields.includes('card_definitions!physical_copies_card_definition_id_fkey')) {
              // Enrich physical_copies rows with nested card_definitions data
              chain._data = mockPhysicalCopies.map(pc => {
                const cd = mockCardDefinitions.find(d => d.id === pc.card_definition_id)
                return {
                  ...pc,
                  card_definitions: cd ? { card_name: cd.card_name, color_identity: '', type_line: '' } : null,
                }
              }).filter(pc => pc.card_definitions !== null) // FK hint with inner join semantics
            } else {
              chain._data = [...mockPhysicalCopies]
            }
            return chain
          }
          return chain
        }
        case 'card_definitions':
          return createMockChain(mockCardDefinitions)
        case 'decks':
          return createMockChain(mockDecks)
        case 'storage_locations':
          return createMockChain([])
        case 'sets':
          return createMockChain([])
        case 'printing_set_info':
          return createMockChain([])
        default:
          return createMockChain([])
      }
    },
  }),
}))

// Import after mocks
import { GET } from '../route'

// Import the shared-cards route separately
import { GET as GET_SHARED_CARDS } from '../../shared-cards/route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'))
}

// ---------------------------------------------------------------------------
// fast-check Arbitraries
// ---------------------------------------------------------------------------

/** Generate a plausible card name */
const arbCardName = fc.string({ minLength: 3, maxLength: 20 })
  .map(s => s.replace(/[^a-zA-Z ]/g, 'x').trim().replace(/\s+/g, ' '))
  .filter(s => s.length >= 3)

/** Generate a deck ID (positive int) */
const arbDeckId = fc.integer({ min: 1, max: 100 })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bug Condition Exploration: Allocation routes read stale deck_allocations data', () => {
  beforeEach(() => {
    mockDeckCards = []
    mockCollectionRows = []
    mockDeckAllocations = []
    mockPhysicalCopies = []
    mockCardDefinitions = []
    mockDecks = []
  })

  /**
   * **Validates: Requirements 1.1, 1.3**
   *
   * Property: For ?view=shared, copies[*].assignedDeckId SHALL reflect
   * deck_cards.physical_copy_id assignments, NOT deck_allocations.
   *
   * Setup: physical_copy_id assigns copy to deckA, deck_allocations assigns to deckB.
   * On unfixed code, the route reads deck_allocations → returns deckB → FAILS.
   */
  it('view=shared: assignedDeckId matches deck_cards.physical_copy_id, not deck_allocations', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbCardName,
        arbDeckId,
        arbDeckId.filter(id => id > 50), // ensure deckB differs from deckA
        async (cardName, deckA, deckB) => {
          // Ensure deckA and deckB are different
          if (deckA === deckB) return

          const physicalCopyId = 1000 + deckA

          // Seed: card is in 2 decks (deckA and deckB)
          mockDeckCards = [
            {
              card_name: cardName,
              deck_id: deckA,
              ownership_status: 'original',
              proxy_of_deck_id: null,
              scryfall_id: 'sf-001',
              set_code: 'abc',
              physical_copy_id: physicalCopyId,
              decks: { name: `DeckA-${deckA}`, status: 'active' },
            },
            {
              card_name: cardName,
              deck_id: deckB,
              ownership_status: 'not_owned',
              proxy_of_deck_id: null,
              scryfall_id: 'sf-001',
              set_code: 'abc',
              physical_copy_id: null, // deckB has no copy assigned
              decks: { name: `DeckB-${deckB}`, status: 'active' },
            },
          ]

          // Collection has 1 copy
          mockCollectionRows = [
            {
              id: 1,
              card_name: cardName,
              scryfall_id: 'sf-001',
              set_code: 'abc',
              edition_name: 'Test Set',
              foil: false,
              quantity: 1,
              storage_location_id: null,
              collector_number: '001',
              finish: null,
            },
          ]

          // deck_allocations DISAGREES: says copy is assigned to deckB (stale)
          mockDeckAllocations = [
            {
              card_name: cardName,
              scryfall_id: 'sf-001',
              deck_id: deckB, // STALE: should be deckA per physical_copy_id
              role: 'original',
            },
          ]

          mockDecks = [
            { id: deckA, name: `DeckA-${deckA}`, status: 'active' },
            { id: deckB, name: `DeckB-${deckB}`, status: 'active' },
          ]

          // physical_copies has 1 copy (the truth source for the fix)
          mockPhysicalCopies = [
            {
              id: physicalCopyId,
              card_definition_id: 1,
              is_proxy: false,
              scryfall_printing_id: 'sf-001',
            },
          ]

          // card_definitions maps card name to definition ID
          mockCardDefinitions = [
            { id: 1, card_name: cardName },
          ]

          const response = await GET(makeRequest('/api/allocation?view=shared'))
          const data = await response.json()

          expect(data.cards).toBeDefined()
          expect(data.cards.length).toBeGreaterThan(0)

          const card = data.cards.find((c: any) => c.cardName === cardName)
          expect(card).toBeDefined()
          expect(card.copies).toBeDefined()
          expect(card.copies.length).toBeGreaterThan(0)

          // EXPECTED: The copy should be assigned to deckA
          // (per deck_cards.physical_copy_id), NOT deckB (per deck_allocations)
          const assignedCopy = card.copies.find((c: any) => c.assignedDeckId !== null)
          expect(assignedCopy).toBeDefined()
          expect(assignedCopy.assignedDeckId).toBe(deckA)

          // deckB should be in unmetDecks (it has no physical copy assigned)
          expect(card.unmetDecks).toBeDefined()
          const unmetDeckIds = card.unmetDecks.map((d: any) => d.deckId)
          expect(unmetDeckIds).toContain(deckB)
        }
      ),
      { numRuns: 3 }
    )
  })

  /**
   * **Validates: Requirements 1.1, 1.3**
   *
   * Property: ownedCopies SHALL equal COUNT(physical_copies WHERE is_proxy = false),
   * NOT collection.quantity.
   *
   * Setup: physical_copies has 2 non-proxy copies, collection has quantity 5.
   * On unfixed code, the route reads collection.quantity → returns 5 → FAILS.
   */
  it('view=shared: ownedCopies derives from physical_copies count, not collection.quantity', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbCardName,
        fc.integer({ min: 1, max: 5 }), // actual physical copies (truth)
        fc.integer({ min: 6, max: 15 }), // stale collection quantity (higher)
        async (cardName, realCopies, staleQuantity) => {
          const deckA = 1
          const deckB = 2

          // Card is in 2 decks
          mockDeckCards = [
            {
              card_name: cardName,
              deck_id: deckA,
              ownership_status: 'original',
              proxy_of_deck_id: null,
              scryfall_id: 'sf-001',
              set_code: 'abc',
              physical_copy_id: 100,
              decks: { name: 'DeckA', status: 'active' },
            },
            {
              card_name: cardName,
              deck_id: deckB,
              ownership_status: 'not_owned',
              proxy_of_deck_id: null,
              scryfall_id: 'sf-001',
              set_code: 'abc',
              physical_copy_id: null,
              decks: { name: 'DeckB', status: 'active' },
            },
          ]

          // Collection says staleQuantity (WRONG — stale data)
          mockCollectionRows = [
            {
              id: 1,
              card_name: cardName,
              scryfall_id: 'sf-001',
              set_code: 'abc',
              edition_name: 'Test Set',
              foil: false,
              quantity: staleQuantity,
              storage_location_id: null,
              collector_number: '001',
              finish: null,
            },
          ]

          // physical_copies has realCopies (TRUTH)
          mockPhysicalCopies = Array.from({ length: realCopies }, (_, i) => ({
            id: 100 + i,
            card_definition_id: 1,
            is_proxy: false,
            scryfall_printing_id: 'sf-001',
          }))

          mockDeckAllocations = []
          mockDecks = [
            { id: deckA, name: 'DeckA', status: 'active' },
            { id: deckB, name: 'DeckB', status: 'active' },
          ]

          // card_definitions maps card name to definition ID
          mockCardDefinitions = [
            { id: 1, card_name: cardName },
          ]

          const response = await GET(makeRequest('/api/allocation?view=shared'))
          const data = await response.json()

          expect(data.cards).toBeDefined()
          expect(data.cards.length).toBeGreaterThan(0)

          const card = data.cards.find((c: any) => c.cardName === cardName)
          expect(card).toBeDefined()

          // EXPECTED: ownedCopies = realCopies (from physical_copies)
          // NOT staleQuantity (from collection.quantity)
          expect(card.ownedCopies).toBe(realCopies)
        }
      ),
      { numRuns: 3 }
    )
  })

  /**
   * **Validates: Requirements 1.2, 1.4**
   *
   * Property: For ?view=all, status SHALL derive from deck_cards.physical_copy_id
   * presence, NOT from deck_allocations role.
   *
   * Setup: deck_cards.physical_copy_id references the copy (it's assigned),
   *        but deck_allocations has NO row → unfixed code shows 'unallocated'.
   * On unfixed code, the route reads deck_allocations → returns 'unallocated' → FAILS.
   */
  it('view=all: status derives from deck_cards.physical_copy_id, not deck_allocations', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbCardName,
        arbDeckId,
        async (cardName, deckA) => {
          const physicalCopyId = 500

          // deck_cards says copy is assigned to deckA (via physical_copy_id)
          mockDeckCards = [
            {
              card_name: cardName,
              deck_id: deckA,
              ownership_status: 'original',
              proxy_of_deck_id: null,
              scryfall_id: 'sf-001',
              set_code: 'abc',
              physical_copy_id: physicalCopyId,
              decks: { name: `DeckA-${deckA}`, status: 'active' },
            },
          ]

          // Collection has the card
          mockCollectionRows = [
            {
              id: 1,
              card_name: cardName,
              scryfall_id: 'sf-001',
              set_code: 'abc',
              edition_name: 'Test Set',
              foil: false,
              quantity: 1,
              storage_location_id: null,
              collector_number: '001',
              finish: null,
            },
          ]

          // deck_allocations is EMPTY — no allocation recorded (stale/missing)
          mockDeckAllocations = []

          mockDecks = [
            { id: deckA, name: `DeckA-${deckA}`, status: 'active' },
          ]

          // physical_copies has 1 copy (the truth source for the fix)
          mockPhysicalCopies = [
            {
              id: physicalCopyId,
              card_definition_id: 1,
              is_proxy: false,
              scryfall_printing_id: 'sf-001',
              storage_location_id: null,
            },
          ]

          // card_definitions maps card name to definition ID
          mockCardDefinitions = [
            { id: 1, card_name: cardName },
          ]

          const response = await GET(makeRequest('/api/allocation?view=all'))
          const data = await response.json()

          expect(data.cards).toBeDefined()
          expect(data.cards.length).toBeGreaterThan(0)

          const matchingCard = data.cards.find((c: any) => c.cardName === cardName)
          expect(matchingCard).toBeDefined()

          // EXPECTED: status is 'in-deck' because deck_cards.physical_copy_id
          // references this copy. NOT 'unallocated' (which is what deck_allocations
          // absence would imply on unfixed code).
          expect(matchingCard.status).toBe('in-deck')
          expect(matchingCard.assignedDeckId).toBe(deckA)
        }
      ),
      { numRuns: 3 }
    )
  })

  /**
   * **Validates: Requirements 1.1, 1.4**
   *
   * Property: For /api/shared-cards, owned_total SHALL derive from
   * physical_copies count (non-proxy), NOT collection.quantity.
   *
   * Setup: physical_copies has N non-proxy copies, collection has M (M > N).
   * On unfixed code, the route reads collection.quantity → returns M → FAILS.
   */
  it('/api/shared-cards: owned_total derives from physical_copies count, not collection.quantity', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbCardName,
        fc.integer({ min: 1, max: 4 }),  // actual physical copies
        fc.integer({ min: 5, max: 12 }), // stale collection quantity
        async (cardName, realOwned, staleQuantity) => {
          const deckA = 1
          const deckB = 2

          // Card is in 2+ decks (required for shared-cards)
          mockDeckCards = [
            {
              card_name: cardName,
              deck_id: deckA,
              ownership_status: 'original',
              proxy_of_deck_id: null,
              scryfall_id: 'sf-001',
              set_code: 'abc',
              physical_copy_id: 100,
              decks: { name: 'DeckA', status: 'active' },
            },
            {
              card_name: cardName,
              deck_id: deckB,
              ownership_status: 'not_owned',
              proxy_of_deck_id: null,
              scryfall_id: 'sf-001',
              set_code: 'abc',
              physical_copy_id: null,
              decks: { name: 'DeckB', status: 'active' },
            },
          ]

          // Collection says staleQuantity (STALE data)
          mockCollectionRows = [
            {
              id: 1,
              card_name: cardName,
              scryfall_id: 'sf-001',
              set_code: 'abc',
              edition_name: 'Test Set',
              foil: false,
              quantity: staleQuantity,
              storage_location_id: null,
              collector_number: '001',
              finish: null,
            },
          ]

          // physical_copies is truth: realOwned non-proxy copies
          mockPhysicalCopies = Array.from({ length: realOwned }, (_, i) => ({
            id: 100 + i,
            card_definition_id: 1,
            is_proxy: false,
            scryfall_printing_id: 'sf-001',
          }))

          // card_definitions maps card name to definition ID
          mockCardDefinitions = [
            { id: 1, card_name: cardName },
          ]

          mockDecks = [
            { id: deckA, name: 'DeckA', status: 'active' },
            { id: deckB, name: 'DeckB', status: 'active' },
          ]

          const response = await GET_SHARED_CARDS(
            makeRequest('/api/shared-cards')
          )
          const data = await response.json()

          expect(data.groups).toBeDefined()

          const group = data.groups.find((g: any) => g.card_name === cardName)
          expect(group).toBeDefined()

          // EXPECTED: owned_total = realOwned (from physical_copies)
          // NOT staleQuantity (from collection.quantity)
          expect(group.owned_total).toBe(realOwned)
        }
      ),
      { numRuns: 3 }
    )
  })
})
