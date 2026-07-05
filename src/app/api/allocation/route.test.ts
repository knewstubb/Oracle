import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Data Store
// ---------------------------------------------------------------------------

let mockDeckCards: Array<{
  card_name: string
  deck_id: number
  ownership_status: string | null
  proxy_of_deck_id: number | null
  decks: { name: string }
}> = []

// ---------------------------------------------------------------------------
// Mock Supabase Client
// ---------------------------------------------------------------------------

function createMockChain(data: unknown[] | null, error: unknown = null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    _data: data,
    _error: error,
    select() { return chain },
    eq() { return chain },
    in(field: string, values: unknown[]) {
      // Filter the data by matching field values
      if (chain._data && Array.isArray(chain._data)) {
        chain._data = chain._data.filter((row: Record<string, unknown>) =>
          (values as unknown[]).includes(row[field])
        )
      }
      return chain
    },
    single() {
      if (chain._data && Array.isArray(chain._data) && chain._data.length > 0) {
        return { data: chain._data[0], error: null }
      }
      return { data: null, error: { message: 'Not found', code: 'PGRST116' } }
    },
    then(
      onFulfilled: (val: { data: unknown; error: unknown }) => unknown,
      onRejected?: (err: unknown) => unknown
    ) {
      return Promise.resolve({ data: chain._data, error: chain._error }).then(onFulfilled, onRejected)
    },
  }

  // Make chain thenable
  Object.defineProperty(chain, 'then', {
    value(
      onFulfilled: (val: { data: unknown; error: unknown }) => unknown,
      onRejected?: (err: unknown) => unknown
    ) {
      return Promise.resolve({ data: chain._data, error: chain._error }).then(onFulfilled, onRejected)
    },
    enumerable: false,
    configurable: true,
  })

  return chain
}

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'deck_cards') {
        // First call: select card_name, deck_id (without joins)
        // Second call: select with decks join and .in() filter
        const chain = createMockChain([...mockDeckCards])
        // Override select to handle the two different call patterns
        chain.select = (fields: string) => {
          if (fields.includes('decks')) {
            // This is the second query with the join — return full data
            chain._data = [...mockDeckCards]
          } else {
            // First query — just card_name and deck_id
            chain._data = mockDeckCards.map((r) => ({
              card_name: r.card_name,
              deck_id: r.deck_id,
            }))
          }
          return chain
        }
        return chain
      }
      return createMockChain([])
    },
  }),
}))

// Mock allocation-store for legacy paths
vi.mock('@/lib/allocation-store', () => ({
  getAllocationsForDeck: vi.fn(() => []),
  getAllocationsForCard: vi.fn(() => []),
  getProxyReport: vi.fn(() => []),
}))

import { GET } from './route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'))
}

function seedData() {
  mockDeckCards = [
    // Sol Ring in all 3 decks
    { card_name: 'Sol Ring', deck_id: 1, ownership_status: 'original', proxy_of_deck_id: null, decks: { name: 'World Breaker' } },
    { card_name: 'Sol Ring', deck_id: 2, ownership_status: 'proxy', proxy_of_deck_id: 1, decks: { name: 'Ice Queen' } },
    { card_name: 'Sol Ring', deck_id: 3, ownership_status: 'proxy', proxy_of_deck_id: 1, decks: { name: 'Arti-facts' } },

    // Command Tower in deck 1 and 2
    { card_name: 'Command Tower', deck_id: 1, ownership_status: 'original', proxy_of_deck_id: null, decks: { name: 'World Breaker' } },
    { card_name: 'Command Tower', deck_id: 2, ownership_status: 'proxy', proxy_of_deck_id: 1, decks: { name: 'Ice Queen' } },

    // Arcane Signet only in deck 3 (not shared)
    { card_name: 'Arcane Signet', deck_id: 3, ownership_status: 'original', proxy_of_deck_id: null, decks: { name: 'Arti-facts' } },

    // Rhystic Study in deck 2 and 3
    { card_name: 'Rhystic Study', deck_id: 2, ownership_status: 'original', proxy_of_deck_id: null, decks: { name: 'Ice Queen' } },
    { card_name: 'Rhystic Study', deck_id: 3, ownership_status: 'not_owned', proxy_of_deck_id: null, decks: { name: 'Arti-facts' } },
  ]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/allocation?view=shared', () => {
  beforeEach(() => {
    seedData()
  })

  it('returns all cards appearing in 2+ decks', async () => {
    const response = await GET(makeRequest('/api/allocation?view=shared'))
    const data = await response.json()

    expect(data.cards).toBeDefined()
    expect(data.cards.length).toBe(3) // Sol Ring, Command Tower, Rhystic Study

    const cardNames = data.cards.map((c: { cardName: string }) => c.cardName).sort()
    expect(cardNames).toEqual(['Command Tower', 'Rhystic Study', 'Sol Ring'])
  })

  it('does not include cards in only one deck', async () => {
    const response = await GET(makeRequest('/api/allocation?view=shared'))
    const data = await response.json()

    const cardNames = data.cards.map((c: { cardName: string }) => c.cardName)
    expect(cardNames).not.toContain('Arcane Signet')
  })

  it('includes per-deck ownership status for each card', async () => {
    const response = await GET(makeRequest('/api/allocation?view=shared'))
    const data = await response.json()

    const solRing = data.cards.find((c: { cardName: string }) => c.cardName === 'Sol Ring')
    expect(solRing).toBeDefined()
    expect(solRing.decks.length).toBe(3)

    // Verify each deck entry has required fields
    for (const deck of solRing.decks) {
      expect(deck.deckId).toBeDefined()
      expect(deck.deckName).toBeDefined()
      expect(deck.ownershipStatus).toBeDefined()
      expect(['original', 'proxy', 'not_owned']).toContain(deck.ownershipStatus)
      expect('proxyOfDeckId' in deck).toBe(true)
    }

    // Verify Sol Ring's specific statuses
    const deck1 = solRing.decks.find((d: { deckId: number }) => d.deckId === 1)
    expect(deck1.ownershipStatus).toBe('original')
    expect(deck1.proxyOfDeckId).toBeNull()

    const deck2 = solRing.decks.find((d: { deckId: number }) => d.deckId === 2)
    expect(deck2.ownershipStatus).toBe('proxy')
    expect(deck2.proxyOfDeckId).toBe(1)
  })

  it('filters by deckId to show cards in that deck AND at least one other', async () => {
    const response = await GET(makeRequest('/api/allocation?view=shared&deckId=3'))
    const data = await response.json()

    // Deck 3 has: Sol Ring (shared), Arcane Signet (unique), Rhystic Study (shared)
    // Should return Sol Ring and Rhystic Study (both shared with other decks)
    expect(data.cards.length).toBe(2)
    const cardNames = data.cards.map((c: { cardName: string }) => c.cardName).sort()
    expect(cardNames).toEqual(['Rhystic Study', 'Sol Ring'])
  })

  it('filters by deckId=1 correctly', async () => {
    const response = await GET(makeRequest('/api/allocation?view=shared&deckId=1'))
    const data = await response.json()

    // Deck 1 has: Sol Ring (shared), Command Tower (shared)
    expect(data.cards.length).toBe(2)
    const cardNames = data.cards.map((c: { cardName: string }) => c.cardName).sort()
    expect(cardNames).toEqual(['Command Tower', 'Sol Ring'])
  })

  it('returns empty array when deckId has no shared cards', async () => {
    // Add a deck with a unique card only
    mockDeckCards.push({
      card_name: 'Unique Card',
      deck_id: 99,
      ownership_status: 'original',
      proxy_of_deck_id: null,
      decks: { name: 'Empty Deck' },
    })

    const response = await GET(makeRequest('/api/allocation?view=shared&deckId=99'))
    const data = await response.json()

    expect(data.cards).toEqual([])
  })

  it('returns 400 for invalid deckId', async () => {
    const response = await GET(makeRequest('/api/allocation?view=shared&deckId=abc'))
    expect(response.status).toBe(400)
  })

  it('includes deck names in the response', async () => {
    const response = await GET(makeRequest('/api/allocation?view=shared'))
    const data = await response.json()

    const solRing = data.cards.find((c: { cardName: string }) => c.cardName === 'Sol Ring')
    const deckNames = solRing.decks.map((d: { deckName: string }) => d.deckName).sort()
    expect(deckNames).toEqual(['Arti-facts', 'Ice Queen', 'World Breaker'])
  })

  it('defaults ownership_status to not_owned when null in DB', async () => {
    // Insert cards with null ownership_status
    mockDeckCards.push(
      { card_name: 'New Card', deck_id: 1, ownership_status: null, proxy_of_deck_id: null, decks: { name: 'World Breaker' } },
      { card_name: 'New Card', deck_id: 2, ownership_status: null, proxy_of_deck_id: null, decks: { name: 'Ice Queen' } },
    )

    const response = await GET(makeRequest('/api/allocation?view=shared'))
    const data = await response.json()

    const newCard = data.cards.find((c: { cardName: string }) => c.cardName === 'New Card')
    expect(newCard).toBeDefined()
    for (const deck of newCard.decks) {
      expect(deck.ownershipStatus).toBe('not_owned')
    }
  })
})

describe('GET /api/allocation (legacy behavior)', () => {
  beforeEach(() => {
    seedData()
  })

  it('returns proxy report when no params given', async () => {
    const response = await GET(makeRequest('/api/allocation'))
    const data = await response.json()

    expect(data.success).toBe(true)
    expect(data.proxyReport).toBeDefined()
  })

  it('returns allocations for deck when deckId given (without view=shared)', async () => {
    const response = await GET(makeRequest('/api/allocation?deckId=1'))
    const data = await response.json()

    expect(data.success).toBe(true)
    expect(data.deckId).toBe(1)
  })
})
