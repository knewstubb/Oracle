// ---------------------------------------------------------------------------
// Deck Import — Proxy Detection & Copy Creation — Unit Tests
// ---------------------------------------------------------------------------
//
// Validates: Requirements 7.1, 7.2, 7.3, 7.4
// Design reference: Correctness Property 5
//
// For any card with isProxy=true in the NormalizedDeck, when the import
// completes regardless of mode, then a collection row with is_proxy=true
// exists for that card.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importDeckDesign, importDeckNewCards } from '@/lib/deck-import'
import type { NormalizedDeck } from '@/lib/deck-normalizer'

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

const mockFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}))

// ---------------------------------------------------------------------------
// Fixture Data
// ---------------------------------------------------------------------------

function makeProxyCard(overrides: Partial<typeof baseProxyCard> = {}) {
  return { ...baseProxyCard, ...overrides }
}

const baseProxyCard = {
  cardName: 'Rhystic Study',
  scryfallId: 'scry-rhystic-001',
  oracleId: 'oracle-rhystic-001',
  setCode: 'pcy',
  quantity: 1,
  typeLine: 'Enchantment',
  isCommander: false,
  isProxy: true,
  manaCost: '{2}{U}',
  colorIdentity: ['U'],
}

const baseNonProxyCard = {
  cardName: 'Sol Ring',
  scryfallId: 'scry-solring-001',
  oracleId: 'oracle-solring-001',
  setCode: 'cmm',
  quantity: 1,
  typeLine: 'Artifact',
  isCommander: false,
  isProxy: false,
  manaCost: '{1}',
  colorIdentity: [],
}

function makeDeck(cards: typeof baseProxyCard[]): NormalizedDeck {
  return {
    name: 'Test Deck',
    platform: 'archidekt',
    platformDeckId: '99999',
    sourceUrl: 'https://archidekt.com/decks/99999',
    commander: null,
    cards,
    cardCount: cards.reduce((sum, c) => sum + c.quantity, 0),
    colourIdentity: 'U',
  }
}

const TEST_USER_ID = 'user-abc-123'

// ---------------------------------------------------------------------------
// Helpers for mock chain building
// ---------------------------------------------------------------------------

interface MockCall {
  table: string
  method: string
  args: any[]
}

/**
 * Tracks all Supabase calls and allows asserting on them.
 * Returns a configurable mock that handles the chained query builder pattern.
 */
function createSupabaseMock() {
  const calls: MockCall[] = []

  // Configuration for responses by table+method
  const responses: Record<string, any> = {}

  function setResponse(table: string, method: string, response: any) {
    responses[`${table}.${method}`] = response
  }

  function getResponse(table: string, method: string) {
    return responses[`${table}.${method}`] ?? { data: null, error: null }
  }

  function getCalls(table?: string, method?: string) {
    return calls.filter(c =>
      (!table || c.table === table) && (!method || c.method === method)
    )
  }

  function setupMockFrom(table: string): any {
    const chain: any = {}
    const methods = [
      'select', 'insert', 'delete', 'update', 'upsert',
      'eq', 'is', 'limit', 'single', 'maybeSingle',
    ]

    for (const method of methods) {
      chain[method] = (...args: any[]) => {
        calls.push({ table, method, args })

        // Terminal methods that return a promise
        if (method === 'single' || method === 'maybeSingle') {
          const resp = getResponse(table, method)
          // Return a thenable that also supports chaining
          const result = Promise.resolve(resp)
          // Attach chain methods to the promise for further chaining
          for (const m of methods) {
            ;(result as any)[m] = chain[m]
          }
          return result
        }

        return chain
      }
    }

    // Make the chain itself awaitable (for calls that don't end with single/maybeSingle)
    chain.then = (resolve: any, reject: any) => {
      const resp = getResponse(table, 'resolve')
      return Promise.resolve(resp).then(resolve, reject)
    }

    return chain
  }

  mockFrom.mockImplementation((table: string) => {
    return setupMockFrom(table)
  })

  return { calls, getCalls, setResponse }
}

// ---------------------------------------------------------------------------
// Tests: Existing Collection Mode — Proxy Handling
// ---------------------------------------------------------------------------

describe('importDeckDesign — proxy handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts card for proxy cards (Req 7.1)', async () => {
    const proxyCard = makeProxyCard()
    const deck = makeDeck([proxyCard])

    // Track which tables get which operations
    const insertedCollectionRows: any[] = []
    const upsertedCards: any[] = []

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {}
      const addChaining = () => {
        chain.select = vi.fn().mockReturnValue(chain)
        chain.insert = vi.fn((rows: any) => {
          if (table === 'collection') insertedCollectionRows.push(rows)
          return chain
        })
        chain.delete = vi.fn().mockReturnValue(chain)
        chain.update = vi.fn().mockReturnValue(chain)
        chain.upsert = vi.fn((rows: any) => {
          if (table === 'cards') upsertedCards.push(rows)
          return chain
        })
        chain.eq = vi.fn().mockReturnValue(chain)
        chain.is = vi.fn().mockReturnValue(chain)
        chain.limit = vi.fn().mockReturnValue(chain)
        chain.single = vi.fn().mockReturnValue(chain)
        chain.maybeSingle = vi.fn().mockReturnValue(chain)
        // Make awaitable
        chain.then = (resolve: any) => {
          if (table === 'decks') return Promise.resolve({ data: null, error: null }).then(resolve)
          if (table === 'deck_cards' && chain._lastMethod === 'delete')
            return Promise.resolve({ data: null, error: null }).then(resolve)
          if (table === 'deck_cards' && chain._lastMethod === 'insert')
            return Promise.resolve({ data: null, error: null }).then(resolve)
          if (table === 'cards')
            return Promise.resolve({ data: { id: 42 }, error: null }).then(resolve)
          if (table === 'collection' && chain._lastMethod === 'select')
            return Promise.resolve({ data: null, error: null }).then(resolve)
          if (table === 'collection' && chain._lastMethod === 'insert')
            return Promise.resolve({ data: { id: 100 }, error: null }).then(resolve)
          return Promise.resolve({ data: null, error: null }).then(resolve)
        }
        return chain
      }
      addChaining()
      return chain
    })

    await importDeckDesign(deck, TEST_USER_ID)

    // Verify cards was upserted with the proxy card's oracle_id
    expect(upsertedCards.length).toBeGreaterThan(0)
    expect(upsertedCards[0]).toEqual(
      expect.objectContaining({
        oracle_id: 'oracle-rhystic-001',
        card_name: 'Rhystic Study',
      })
    )
  })

  it('creates new proxy copy when none exists (Req 7.2)', async () => {
    const proxyCard = makeProxyCard()
    const deck = makeDeck([proxyCard])

    const insertedCollectionRows: any[] = []

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn((rows: any) => {
        if (table === 'collection') insertedCollectionRows.push(rows)
        return chain
      })
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.upsert = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.is = vi.fn().mockReturnValue(chain)
      chain.limit = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: any) => {
        if (table === 'decks') return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'deck_cards')
          return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'cards')
          return Promise.resolve({ data: { id: 42 }, error: null }).then(resolve)
        if (table === 'collection') {
          // First query is the select (checking for existing proxy) — return null (none found)
          // Second call is the insert (creating new proxy)
          const collCalls = insertedCollectionRows.length
          if (collCalls === 0) {
            // This is the maybeSingle check — no existing proxy
            return Promise.resolve({ data: null, error: null }).then(resolve)
          }
          // After insert — return the new proxy
          return Promise.resolve({ data: { id: 200 }, error: null }).then(resolve)
        }
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      return chain
    })

    await importDeckDesign(deck, TEST_USER_ID)

    // Verify a collection row was inserted with is_proxy=true
    expect(insertedCollectionRows.length).toBeGreaterThan(0)
    expect(insertedCollectionRows[0]).toEqual(
      expect.objectContaining({
        card_id: 42,
        is_proxy: true,
        user_id: TEST_USER_ID,
        printing_id: 'scry-rhystic-001',
      })
    )
  })

  it('reuses existing proxy copy when one already exists (Req 7.3)', async () => {
    const proxyCard = makeProxyCard()
    const deck = makeDeck([proxyCard])

    const insertedCollectionRows: any[] = []
    const updatedDeckCards: any[] = []

    // Track whether collection insert is called
    let collectionInsertCalled = false

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn((rows: any) => {
        if (table === 'collection') {
          collectionInsertCalled = true
          insertedCollectionRows.push(rows)
        }
        return chain
      })
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn((data: any) => {
        if (table === 'deck_cards') updatedDeckCards.push(data)
        return chain
      })
      chain.upsert = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.is = vi.fn().mockReturnValue(chain)
      chain.limit = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: any) => {
        if (table === 'decks') return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'deck_cards')
          return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'cards')
          return Promise.resolve({ data: { id: 42 }, error: null }).then(resolve)
        if (table === 'collection') {
          // Return an existing proxy (id=999) for the maybeSingle select check
          return Promise.resolve({ data: { id: 999 }, error: null }).then(resolve)
        }
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      return chain
    })

    await importDeckDesign(deck, TEST_USER_ID)

    // Verify collection INSERT was NOT called (reusing existing)
    expect(collectionInsertCalled).toBe(false)

    // Verify deck_cards were updated to link to the existing proxy (id=999)
    expect(updatedDeckCards.length).toBeGreaterThan(0)
    expect(updatedDeckCards[0]).toEqual(
      expect.objectContaining({
        copy_id: 999,
        ownership_status: 'proxy',
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Tests: Add New Cards Mode — Proxy Handling
// ---------------------------------------------------------------------------

describe('importDeckAddNewCards — proxy handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates collection row with is_proxy=true for proxy cards (Req 7.2, 7.4)', async () => {
    const proxyCard = makeProxyCard()
    const nonProxyCard = { ...baseNonProxyCard }
    const deck = makeDeck([proxyCard, nonProxyCard])

    const insertedCollectionRows: any[] = []
    let collectionInsertCount = 0

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn((rows: any) => {
        if (table === 'collection') {
          insertedCollectionRows.push(rows)
          collectionInsertCount++
        }
        return chain
      })
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.upsert = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.is = vi.fn().mockReturnValue(chain)
      chain.limit = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: any) => {
        if (table === 'decks') return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'deck_cards')
          return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'cards')
          return Promise.resolve({ data: { id: collectionInsertCount + 10 }, error: null }).then(resolve)
        if (table === 'collection')
          return Promise.resolve({ data: { id: collectionInsertCount + 100 }, error: null }).then(resolve)
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      return chain
    })

    await importDeckAddNewCards(deck, TEST_USER_ID)

    // The proxy card should have is_proxy=true
    const proxyInsert = insertedCollectionRows.find(
      (row: any) => row.is_proxy === true
    )
    expect(proxyInsert).toBeDefined()
    expect(proxyInsert.printing_id).toBe('scry-rhystic-001')

    // The non-proxy card should have is_proxy=false
    const nonProxyInsert = insertedCollectionRows.find(
      (row: any) => row.is_proxy === false
    )
    expect(nonProxyInsert).toBeDefined()
    expect(nonProxyInsert.printing_id).toBe('scry-solring-001')
  })

  it('upserts card for proxy cards in add new mode (Req 7.4)', async () => {
    const proxyCard = makeProxyCard()
    const deck = makeDeck([proxyCard])

    const upsertedCards: any[] = []

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn().mockReturnValue(chain)
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.upsert = vi.fn((rows: any) => {
        if (table === 'cards') upsertedCards.push(rows)
        return chain
      })
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.is = vi.fn().mockReturnValue(chain)
      chain.limit = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: any) => {
        if (table === 'decks') return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'deck_cards')
          return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'cards')
          return Promise.resolve({ data: { id: 50 }, error: null }).then(resolve)
        if (table === 'collection')
          return Promise.resolve({ data: { id: 300 }, error: null }).then(resolve)
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      return chain
    })

    await importDeckAddNewCards(deck, TEST_USER_ID)

    // Verify cards was upserted with the proxy card's oracle_id
    expect(upsertedCards.length).toBeGreaterThan(0)
    expect(upsertedCards[0]).toEqual(
      expect.objectContaining({
        oracle_id: 'oracle-rhystic-001',
        card_name: 'Rhystic Study',
      })
    )
  })

  it('handles multiple quantity proxy cards correctly', async () => {
    const proxyCard = makeProxyCard({ quantity: 3 })
    const deck = makeDeck([proxyCard])

    const insertedCollectionRows: any[] = []
    let insertCounter = 0

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn((rows: any) => {
        if (table === 'collection') {
          insertedCollectionRows.push(rows)
          insertCounter++
        }
        return chain
      })
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.upsert = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.is = vi.fn().mockReturnValue(chain)
      chain.limit = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: any) => {
        if (table === 'decks') return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'deck_cards')
          return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'cards')
          return Promise.resolve({ data: { id: 42 }, error: null }).then(resolve)
        if (table === 'collection')
          return Promise.resolve({ data: { id: 300 + insertCounter }, error: null }).then(resolve)
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      return chain
    })

    await importDeckAddNewCards(deck, TEST_USER_ID)

    // Should create 3 collection rows, all with is_proxy=true
    expect(insertedCollectionRows).toHaveLength(3)
    for (const row of insertedCollectionRows) {
      expect(row.is_proxy).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: Both Modes — Proxy Invariant (Correctness Property 5)
// ---------------------------------------------------------------------------

describe('Correctness Property 5 — proxy completeness across both modes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('existing collection mode: proxy card results in is_proxy=true collection row', async () => {
    const proxyCard = makeProxyCard()
    const deck = makeDeck([baseNonProxyCard, proxyCard])

    const insertedCollectionRows: any[] = []

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn((rows: any) => {
        if (table === 'collection') insertedCollectionRows.push(rows)
        return chain
      })
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.upsert = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.is = vi.fn().mockReturnValue(chain)
      chain.limit = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: any) => {
        if (table === 'decks') return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'deck_cards')
          return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'cards')
          return Promise.resolve({ data: { id: 42 }, error: null }).then(resolve)
        if (table === 'collection') {
          // maybeSingle returns null — no existing proxy found
          if (insertedCollectionRows.length === 0)
            return Promise.resolve({ data: null, error: null }).then(resolve)
          return Promise.resolve({ data: { id: 500 }, error: null }).then(resolve)
        }
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      return chain
    })

    await importDeckDesign(deck, TEST_USER_ID)

    // Only the proxy card should create a collection row
    expect(insertedCollectionRows).toHaveLength(1)
    expect(insertedCollectionRows[0].is_proxy).toBe(true)
  })

  it('add new cards mode: proxy card results in is_proxy=true collection row', async () => {
    const proxyCard = makeProxyCard()
    const deck = makeDeck([baseNonProxyCard, proxyCard])

    const insertedCollectionRows: any[] = []
    let insertCount = 0

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn((rows: any) => {
        if (table === 'collection') {
          insertedCollectionRows.push(rows)
          insertCount++
        }
        return chain
      })
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.upsert = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.is = vi.fn().mockReturnValue(chain)
      chain.limit = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: any) => {
        if (table === 'decks') return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'deck_cards')
          return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'cards')
          return Promise.resolve({ data: { id: insertCount + 10 }, error: null }).then(resolve)
        if (table === 'collection')
          return Promise.resolve({ data: { id: insertCount + 200 }, error: null }).then(resolve)
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      return chain
    })

    await importDeckAddNewCards(deck, TEST_USER_ID)

    // Both cards should create collection rows in add new mode
    expect(insertedCollectionRows).toHaveLength(2)

    // Find the proxy one
    const proxyInsert = insertedCollectionRows.find(r => r.is_proxy === true)
    const nonProxyInsert = insertedCollectionRows.find(r => r.is_proxy === false)

    expect(proxyInsert).toBeDefined()
    expect(nonProxyInsert).toBeDefined()
  })

  it('non-proxy cards do NOT create collection rows in existing collection mode', async () => {
    const deck = makeDeck([baseNonProxyCard])

    const insertedCollectionRows: any[] = []

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn((rows: any) => {
        if (table === 'collection') insertedCollectionRows.push(rows)
        return chain
      })
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.upsert = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.is = vi.fn().mockReturnValue(chain)
      chain.limit = vi.fn().mockReturnValue(chain)
      chain.range = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: any) => {
        if (table === 'decks') return Promise.resolve({ data: null, error: null }).then(resolve)
        if (table === 'deck_cards')
          return Promise.resolve({ data: [], error: null }).then(resolve)
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      return chain
    })

    await importDeckDesign(deck, TEST_USER_ID)

    // No collection rows should be created for non-proxy cards in existing mode
    expect(insertedCollectionRows).toHaveLength(0)
  })
})
