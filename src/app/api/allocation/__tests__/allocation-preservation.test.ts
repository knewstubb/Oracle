/**
 * Preservation Property Tests — Response Shape, Filters, and Non-Allocation Behavior
 *
 * These tests lock in the current (unfixed) behavior for:
 * - Response shapes from /api/allocation?view=shared
 * - Response shapes from /api/allocation?view=all
 * - Response shapes from /api/shared-cards
 * - Search filter on /api/collection/allocation
 * - Basic lands exclusion from shared-cards
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock data store — tests configure this before each property check
// ---------------------------------------------------------------------------

const mockSupabaseData: Record<string, any[]> = {}

function applyFilters(data: any[], filters: Array<{ type: string; args: any[] }>): any[] {
  let result = [...data]
  for (const filter of filters) {
    if (filter.type === 'eq') {
      const [field, value] = filter.args
      if (field.includes('.')) continue // skip join-level filters
      result = result.filter((r) => r[field] === value)
    } else if (filter.type === 'in') {
      const [field, values] = filter.args
      result = result.filter((r) => values.includes(r[field]))
    } else if (filter.type === 'not') {
      const [field, op, value] = filter.args
      if (op === 'is' && value === null) {
        result = result.filter((r) => r[field] !== null && r[field] !== undefined)
      }
    }
  }
  return result
}

function createMockQueryBuilder(tableName: string) {
  const filters: Array<{ type: string; args: any[] }> = []
  let rangeApplied = false
  let rangeStart = 0
  let rangeEnd = Infinity
  let countOnly = false
  let headOnly = false

  const builder: any = {
    select: (fields?: string, opts?: any) => {
      if (opts?.count === 'exact') countOnly = true
      if (opts?.head) headOnly = true
      return builder
    },
    eq: (field: string, value: any) => {
      filters.push({ type: 'eq', args: [field, value] })
      return builder
    },
    in: (field: string, values: any[]) => {
      filters.push({ type: 'in', args: [field, values] })
      return builder
    },
    not: (field: string, op: string, value: any) => {
      filters.push({ type: 'not', args: [field, op, value] })
      return builder
    },
    order: () => builder,
    range: (start: number, end: number) => {
      rangeApplied = true
      rangeStart = start
      rangeEnd = end
      return builder
    },
    maybeSingle: () => {
      const filtered = applyFilters(mockSupabaseData[tableName] || [], filters)
      return Promise.resolve({ data: filtered[0] || null, error: null })
    },
  }

  // Make builder thenable
  Object.defineProperty(builder, 'then', {
    value: (onFulfilled?: any, onRejected?: any) => {
      let source = mockSupabaseData[tableName] || []
      const filtered = applyFilters(source, filters)
      let result: any
      if (headOnly && countOnly) {
        result = { count: filtered.length, data: null, error: null }
      } else if (rangeApplied) {
        result = { data: filtered.slice(rangeStart, rangeEnd + 1), error: null }
      } else {
        result = { data: filtered, error: null, count: filtered.length }
      }
      return Promise.resolve(result).then(onFulfilled, onRejected)
    },
    configurable: true,
    enumerable: false,
  })

  return builder
}

// ---------------------------------------------------------------------------
// Mocks — must be at top level before any imports of the modules under test
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: 'test-user', email: 'test@test.com' }),
}))

vi.mock('@/lib/supabase-server', () => ({
  createAuthServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u' } }, error: null }) },
  }),
}))

vi.mock('@/lib/supabase', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => createMockQueryBuilder(table),
  })),
  createServerClient: vi.fn(() => ({
    from: (table: string) => createMockQueryBuilder(table),
  })),
}))

vi.mock('@/lib/allocation-store', () => ({
  getAllocationsForDeck: vi.fn().mockResolvedValue([]),
  getAllocationsForCard: vi.fn().mockResolvedValue([]),
  getProxyReport: vi.fn().mockResolvedValue([]),
}))

// ---------------------------------------------------------------------------
// Import routes AFTER mocks are set up
// ---------------------------------------------------------------------------

import { GET as allocationGET } from '../route'
import { GET as sharedCardsGET } from '../../shared-cards/route'
import { GET as collectionAllocationGET } from '../../collection/allocation/route'

// ---------------------------------------------------------------------------
// Constants & Generators
// ---------------------------------------------------------------------------

const BASIC_LANDS = new Set([
  'Plains', 'Island', 'Swamp', 'Mountain', 'Forest',
  'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
  'Snow-Covered Mountain', 'Snow-Covered Forest', 'Wastes',
])

const nonBasicCardNameArb = fc.string({ minLength: 1, maxLength: 20 })
  .map((s) => s.replace(/[^a-zA-Z0-9 '-]/g, 'x').trim())
  .filter((s) => s.length > 0 && !BASIC_LANDS.has(s))

const deckIdArb = fc.integer({ min: 1, max: 50 })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Preservation Property Tests', () => {
  beforeEach(() => {
    // Reset mock data between tests
    for (const key of Object.keys(mockSupabaseData)) {
      delete mockSupabaseData[key]
    }
  })

  describe('Property: ?view=shared response shape has required keys', () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * For all responses from ?view=shared, every card object has keys:
     * cardName (string), decks (array), ownedCopies (number >= 0),
     * copies (array), unmetDecks (array)
     */
    it('every AllocationCardGroup has cardName, decks, ownedCopies, copies, unmetDecks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nonBasicCardNameArb, { minLength: 1, maxLength: 4 }),
          fc.array(deckIdArb, { minLength: 2, maxLength: 4 }),
          async (cardNames, deckIds) => {
            const uniqueCards = [...new Set(cardNames)].slice(0, 3)
            const uniqueDecks = [...new Set(deckIds)]
            if (uniqueCards.length === 0 || uniqueDecks.length < 2) return

            // deck_cards: each card in all decks (ensures 2+ decks)
            const deckCardsData = uniqueCards.flatMap((cardName) =>
              uniqueDecks.map((deckId) => ({
                card_name: cardName,
                deck_id: deckId,
                ownership_status: 'original',
                proxy_of_deck_id: null,
                scryfall_id: 'scry-1',
                set_code: 'neo',
                decks: { name: `Deck ${deckId}`, status: 'active' },
              }))
            )

            // collection: 1 copy per card
            const collectionData = uniqueCards.map((cardName, i) => ({
              id: i + 1,
              card_name: cardName,
              scryfall_id: 'scry-1',
              set_code: 'neo',
              edition_name: 'Neon Dynasty',
              foil: false,
              quantity: 1,
            }))

            // deck_allocations: assign to first deck
            const allocData = uniqueCards.map((cardName) => ({
              card_name: cardName,
              scryfall_id: 'scry-1',
              deck_id: uniqueDecks[0],
            }))

            // decks
            const decksData = uniqueDecks.map((id) => ({
              id,
              name: `Deck ${id}`,
              status: 'active',
            }))

            mockSupabaseData['deck_cards'] = deckCardsData
            mockSupabaseData['collection'] = collectionData
            mockSupabaseData['deck_allocations'] = allocData
            mockSupabaseData['decks'] = decksData

            const url = new URL('http://localhost:3000/api/allocation?view=shared')
            const request = new NextRequest(url)
            const response = await allocationGET(request)
            const json = await response.json()

            expect(json).toHaveProperty('cards')
            expect(Array.isArray(json.cards)).toBe(true)

            for (const group of json.cards) {
              expect(typeof group.cardName).toBe('string')
              expect(group.cardName.length).toBeGreaterThan(0)
              expect(Array.isArray(group.decks)).toBe(true)
              expect(typeof group.ownedCopies).toBe('number')
              expect(group.ownedCopies).toBeGreaterThanOrEqual(0)
              expect(Array.isArray(group.copies)).toBe(true)
              expect(Array.isArray(group.unmetDecks)).toBe(true)
            }
          }
        ),
        { numRuns: 5 }
      )
    })
  })

  describe('Property: ?view=all status values are valid', () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * For all responses from ?view=all, every entry has status in
     * ['in-deck', 'proxy', 'unallocated']
     */
    it('every card entry has status in the valid set', async () => {
      const VALID_STATUSES = ['in-deck', 'proxy', 'unallocated']

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              cardName: nonBasicCardNameArb,
              quantity: fc.integer({ min: 1, max: 3 }),
              hasAllocation: fc.boolean(),
              role: fc.constantFrom('original', 'proxy'),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (cardSpecs) => {
            const uniqueCards = cardSpecs.filter(
              (c, i, arr) => arr.findIndex((x) => x.cardName === c.cardName) === i
            )
            if (uniqueCards.length === 0) return

            // physical_copies: one row per card (non-proxy physical copies)
            const physicalCopiesData = uniqueCards.flatMap((c, i) => {
              const copies: any[] = []
              for (let q = 0; q < c.quantity; q++) {
                copies.push({
                  id: i * 10 + q + 1,
                  card_definition_id: i + 1,
                  scryfall_printing_id: `scry-${i}`,
                  is_proxy: false,
                  is_foil: false,
                  storage_location_id: null,
                  card_definitions: { card_name: c.cardName },
                })
              }
              return copies
            })

            // deck_cards: only for cards with hasAllocation, referencing physical_copy_id
            const deckCardsData = uniqueCards
              .filter((c) => c.hasAllocation)
              .map((c, i) => ({
                physical_copy_id: i * 10 + 1, // references the first copy
                deck_id: 1,
                ownership_status: c.role,
                decks: { name: 'Test Deck' },
              }))

            mockSupabaseData['physical_copies'] = physicalCopiesData
            mockSupabaseData['deck_cards'] = deckCardsData
            mockSupabaseData['printing_set_info'] = uniqueCards.map((c, i) => ({
              scryfall_printing_id: `scry-${i}`,
              set_code: 'neo',
            }))
            mockSupabaseData['storage_locations'] = []

            const url = new URL('http://localhost:3000/api/allocation?view=all')
            const request = new NextRequest(url)
            const response = await allocationGET(request)
            const json = await response.json()

            expect(json).toHaveProperty('cards')
            expect(Array.isArray(json.cards)).toBe(true)
            expect(json).toHaveProperty('total')
            expect(typeof json.total).toBe('number')

            for (const entry of json.cards) {
              expect(VALID_STATUSES).toContain(entry.status)
            }
          }
        ),
        { numRuns: 5 }
      )
    })
  })

  describe('Property: /api/shared-cards excludes basic lands', () => {
    /**
     * **Validates: Requirements 3.1, 3.5**
     *
     * For all responses from /api/shared-cards, no group has card_name
     * in the basic lands set.
     */
    it('no shared card group contains a basic land name', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Mix basic and non-basic cards
          fc.array(
            fc.oneof(
              nonBasicCardNameArb,
              fc.constantFrom('Plains', 'Island', 'Swamp', 'Mountain', 'Forest')
            ),
            { minLength: 2, maxLength: 6 }
          ),
          fc.array(deckIdArb, { minLength: 2, maxLength: 4 }),
          async (cardNames, deckIds) => {
            const uniqueDecks = [...new Set(deckIds)]
            if (uniqueDecks.length < 2) return
            const allCards = [...new Set(cardNames)].filter((c) => c.length > 0)
            if (allCards.length === 0) return

            // deck_cards: all cards in all decks
            const deckCardsData = allCards.flatMap((cardName) =>
              uniqueDecks.map((deckId) => ({
                card_name: cardName,
                set_code: 'neo',
                scryfall_id: 'abc',
                deck_id: deckId,
                tags: null,
              }))
            )

            // collection
            const collectionData = allCards.map((cardName, i) => ({
              id: i + 1,
              card_name: cardName,
              set_code: 'neo',
              scryfall_id: 'abc',
              quantity: 1,
              color_identity: 'W',
              types: 'Creature',
            }))

            const setsData = [{ code: 'neo', name: 'Kamigawa: Neon Dynasty' }]

            mockSupabaseData['deck_cards'] = deckCardsData
            mockSupabaseData['collection'] = collectionData
            mockSupabaseData['sets'] = setsData

            const url = new URL('http://localhost:3000/api/shared-cards')
            const request = new NextRequest(url)
            const response = await sharedCardsGET(request)
            const json = await response.json()

            expect(json).toHaveProperty('groups')
            expect(Array.isArray(json.groups)).toBe(true)

            for (const group of json.groups) {
              expect(BASIC_LANDS.has(group.card_name)).toBe(false)
            }
          }
        ),
        { numRuns: 5 }
      )
    })
  })

  describe('Property: /api/shared-cards total_deck_count >= 2', () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * For all responses, total_deck_count >= 2 for every shared card group.
     */
    it('every group has total_deck_count >= 2', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nonBasicCardNameArb, { minLength: 1, maxLength: 5 }),
          fc.array(deckIdArb, { minLength: 1, maxLength: 5 }),
          async (cardNames, deckIds) => {
            // Note: we include cards that might only be in 1 deck
            // The route should filter those out
            const allCards = [...new Set(cardNames)].filter((c) => c.length > 0)
            const uniqueDecks = [...new Set(deckIds)]
            if (allCards.length === 0 || uniqueDecks.length === 0) return

            // Some cards in 1 deck, some in 2+
            const deckCardsData: any[] = []
            for (const cardName of allCards) {
              // Put each card in a random subset of decks
              const decksForCard = uniqueDecks.slice(0, Math.max(1, Math.floor(Math.random() * uniqueDecks.length) + 1))
              for (const deckId of decksForCard) {
                deckCardsData.push({
                  card_name: cardName,
                  set_code: 'neo',
                  scryfall_id: 'abc',
                  deck_id: deckId,
                  tags: null,
                })
              }
            }

            const collectionData = allCards.map((cardName, i) => ({
              id: i + 1,
              card_name: cardName,
              set_code: 'neo',
              scryfall_id: 'abc',
              quantity: 1,
              color_identity: 'W',
              types: 'Creature',
            }))

            const setsData = [{ code: 'neo', name: 'Kamigawa: Neon Dynasty' }]

            mockSupabaseData['deck_cards'] = deckCardsData
            mockSupabaseData['collection'] = collectionData
            mockSupabaseData['sets'] = setsData

            const url = new URL('http://localhost:3000/api/shared-cards')
            const request = new NextRequest(url)
            const response = await sharedCardsGET(request)
            const json = await response.json()

            expect(json).toHaveProperty('groups')

            // Every returned group must have total_deck_count >= 2
            for (const group of json.groups) {
              expect(group.total_deck_count).toBeGreaterThanOrEqual(2)
            }
          }
        ),
        { numRuns: 5 }
      )
    })
  })

  describe('Property: Search filter returns only matching cards', () => {
    /**
     * **Validates: Requirements 3.2, 3.3**
     *
     * For all generated card name strings, search filter on
     * /api/collection/allocation?search=X returns only cards whose name
     * includes the search string (case-insensitive).
     */
    it('all returned cards contain the search string in their name', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nonBasicCardNameArb, { minLength: 2, maxLength: 6 }),
          fc.string({ minLength: 1, maxLength: 4 })
            .map((s) => s.replace(/[^a-zA-Z]/g, 'a'))
            .filter((s) => s.length > 0),
          fc.array(deckIdArb, { minLength: 1, maxLength: 3 }),
          async (cardNames, searchStr, deckIds) => {
            const uniqueCards = [...new Set(cardNames)].filter((c) => c.length > 0).slice(0, 5)
            const uniqueDecks = [...new Set(deckIds)]
            if (uniqueCards.length === 0 || uniqueDecks.length === 0) return

            // deck_cards: each card in decks
            const deckCardsData = uniqueCards.flatMap((cardName) =>
              uniqueDecks.map((deckId) => ({
                card_name: cardName,
                deck_id: deckId,
                ownership_status: 'original',
                decks: { name: `Deck ${deckId}` },
              }))
            )

            const decksData = uniqueDecks.map((id) => ({
              id,
              name: `Deck ${id}`,
              card_count: 100,
            }))

            const collectionData = uniqueCards.map((cardName, i) => ({
              id: i + 1,
              card_name: cardName,
              quantity: 1,
              types: 'Creature',
            }))

            mockSupabaseData['deck_cards'] = deckCardsData
            mockSupabaseData['decks'] = decksData
            mockSupabaseData['collection'] = collectionData

            const url = new URL(
              `http://localhost:3000/api/collection/allocation?search=${encodeURIComponent(searchStr)}`
            )
            const request = new NextRequest(url)
            const response = await collectionAllocationGET(request)
            const json = await response.json()

            expect(json).toHaveProperty('cards')
            expect(Array.isArray(json.cards)).toBe(true)

            const lowerSearch = searchStr.toLowerCase()
            for (const card of json.cards) {
              expect(card.cardName.toLowerCase()).toContain(lowerSearch)
            }
          }
        ),
        { numRuns: 5 }
      )
    })
  })
})
