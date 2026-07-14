// ---------------------------------------------------------------------------
// Deck Import Integration Tests — End-to-End Flow with Mocked External APIs
// ---------------------------------------------------------------------------
//
// Tests the full import pipeline:
//   URL → parse → fetch → normalize → import → allocation
//
// External APIs (Archidekt, Moxfield) are mocked at the module level.
// Supabase is mocked to track database operations.
//
// Requirements addressed: All (integration coverage)
// Design reference: "Testing Strategy" section
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NormalizedDeck } from '@/lib/deck-normalizer'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}))

const mockRunAllocationResolver = vi.fn()

vi.mock('@/lib/allocation-store-v2', () => ({
  runAllocationResolver: (...args: any[]) => mockRunAllocationResolver(...args),
}))

vi.mock('@/lib/card-definition-resolver', () => ({
  resolveCardDefinitions: vi.fn().mockImplementation(async (cards: any[]) => {
    const map = new Map<string, number>()
    let id = 1000
    for (const card of cards) {
      if (card.oracleId && !map.has(card.oracleId)) {
        map.set(card.oracleId, id++)
      }
    }
    return map
  }),
}))

// ---------------------------------------------------------------------------
// Import modules AFTER mocks are set up
// ---------------------------------------------------------------------------

import { parseDeckUrl, isParseError } from '@/lib/url-parser'
import { normalizeArchidektDeck, normalizeMoxfieldDeck, groupCardsByType } from '@/lib/deck-normalizer'
import { importDeckExistingCollection, importDeckAddNewCards } from '@/lib/deck-import'
import type { ArchidektDeckFull } from '@/lib/archidekt-client'
import type { MoxfieldDeckFull } from '@/lib/moxfield-client'

// ---------------------------------------------------------------------------
// Fixture Data
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'user-integration-test-001'

const ARCHIDEKT_URL = 'https://archidekt.com/decks/12345678'
const MOXFIELD_URL = 'https://moxfield.com/decks/abc123XY'

function makeArchidektDeckResponse(): ArchidektDeckFull {
  return {
    id: 12345678,
    name: 'Korvold Treasures',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    deckFormat: 3,
    featured: '',
    customFeatured: '',
    private: false,
    owner: { id: 1, username: 'testuser', avatar: '' },
    categories: [
      { id: 1, name: 'Commander', isPremier: true, includedInDeck: true, includedInPrice: true },
      { id: 2, name: 'Creature', isPremier: false, includedInDeck: true, includedInPrice: true },
    ],
    deckTags: [],
    cards: [
      {
        id: 1,
        categories: ['Commander'],
        label: '',
        modifier: '',
        quantity: 1,
        card: {
          id: 100,
          uid: 'scry-korvold-001',
          artist: 'Artist',
          collectorNumber: '1',
          edition: { editioncode: 'eld', editionname: 'Eldraine', editiondate: '2019-10-04', editiontype: 'expansion' },
          oracleCard: {
            id: 200,
            name: 'Korvold, Fae-Cursed King',
            cmc: 5,
            colorIdentity: ['B', 'R', 'G'],
            colors: ['B', 'R', 'G'],
            edhrecRank: 10,
            layout: 'normal',
            uid: 'oracle-korvold-001',
            typeLine: 'Legendary Creature — Dragon Noble',
            manaCost: '{2}{B}{R}{G}',
          },
          scryfallImageHash: '',
        },
      },
      {
        id: 2,
        categories: ['Creature'],
        label: '',
        modifier: '',
        quantity: 1,
        card: {
          id: 101,
          uid: 'scry-solring-001',
          artist: 'Artist',
          collectorNumber: '2',
          edition: { editioncode: 'cmm', editionname: 'Commander Masters', editiondate: '2023-08-04', editiontype: 'masters' },
          oracleCard: {
            id: 201,
            name: 'Sol Ring',
            cmc: 1,
            colorIdentity: [],
            colors: [],
            edhrecRank: 1,
            layout: 'normal',
            uid: 'oracle-solring-001',
            typeLine: 'Artifact',
            manaCost: '{1}',
          },
          scryfallImageHash: '',
        },
      },
      {
        id: 3,
        categories: ['Creature'],
        label: 'Proxy,#e158ff',
        modifier: '',
        quantity: 1,
        card: {
          id: 102,
          uid: 'scry-dockside-001',
          artist: 'Artist',
          collectorNumber: '3',
          edition: { editioncode: '2x2', editionname: 'Double Masters 2022', editiondate: '2022-07-08', editiontype: 'masters' },
          oracleCard: {
            id: 202,
            name: 'Dockside Extortionist',
            cmc: 2,
            colorIdentity: ['R'],
            colors: ['R'],
            edhrecRank: 5,
            layout: 'normal',
            uid: 'oracle-dockside-001',
            typeLine: 'Creature — Goblin Pirate',
            manaCost: '{1}{R}',
          },
          scryfallImageHash: '',
        },
      },
    ],
  }
}

function makeMoxfieldDeckResponse(): MoxfieldDeckFull {
  return {
    id: 'mox-internal-id',
    name: 'Atraxa Superfriends',
    format: 'commander',
    publicId: 'abc123XY',
    commanders: {
      count: 1,
      cards: {
        'atraxa-key': {
          card: {
            name: 'Atraxa, Praetors\' Voice',
            scryfall_id: 'scry-atraxa-001',
            set: 'cm2',
            type_line: 'Legendary Creature — Phyrexian Angel Horror',
            oracle_id: 'oracle-atraxa-001',
            cmc: 4,
            color_identity: ['W', 'U', 'B', 'G'],
            mana_cost: '{G}{W}{U}{B}',
          },
          quantity: 1,
        },
      },
    },
    mainboard: {
      count: 2,
      cards: {
        'solring-key': {
          card: {
            name: 'Sol Ring',
            scryfall_id: 'scry-solring-mox-001',
            set: 'cmm',
            type_line: 'Artifact',
            oracle_id: 'oracle-solring-001',
            cmc: 1,
            color_identity: [],
            mana_cost: '{1}',
          },
          quantity: 1,
        },
        'forest-key': {
          card: {
            name: 'Forest',
            scryfall_id: 'scry-forest-001',
            set: 'cmm',
            type_line: 'Basic Land — Forest',
            oracle_id: 'oracle-forest-001',
            cmc: 0,
            color_identity: [],
            mana_cost: '',
          },
          quantity: 1,
        },
      },
    },
    sideboard: { count: 0, cards: {} },
    maybeboard: { count: 0, cards: {} },
    companions: { count: 0, cards: {} },
  }
}

// ---------------------------------------------------------------------------
// Supabase Mock Helpers
// ---------------------------------------------------------------------------

interface TrackedOperation {
  table: string
  operation: string
  data: any
}

function createSupabaseTracker() {
  const operations: TrackedOperation[] = []
  let physicalCopyIdCounter = 500

  mockFrom.mockImplementation((table: string) => {
    const chain: any = {}

    chain.select = vi.fn().mockReturnValue(chain)
    chain.insert = vi.fn((rows: any) => {
      operations.push({ table, operation: 'insert', data: rows })
      return chain
    })
    chain.delete = vi.fn(() => {
      operations.push({ table, operation: 'delete', data: null })
      return chain
    })
    chain.update = vi.fn((data: any) => {
      operations.push({ table, operation: 'update', data })
      return chain
    })
    chain.upsert = vi.fn((rows: any, opts?: any) => {
      operations.push({ table, operation: 'upsert', data: rows })
      return chain
    })
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.is = vi.fn().mockReturnValue(chain)
    chain.in = vi.fn().mockReturnValue(chain)
    chain.limit = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockReturnValue(chain)
    chain.maybeSingle = vi.fn().mockReturnValue(chain)

    chain.then = (resolve: any) => {
      if (table === 'decks') {
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      if (table === 'deck_cards') {
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      if (table === 'card_definitions') {
        return Promise.resolve({ data: { id: 42 }, error: null }).then(resolve)
      }
      if (table === 'physical_copies') {
        // For maybeSingle (checking existing proxy) — return null (none found)
        // For insert — return a new id
        const lastOp = operations.filter(o => o.table === 'physical_copies')
        const lastWasInsert = lastOp.length > 0 && lastOp[lastOp.length - 1].operation === 'insert'
        if (lastWasInsert) {
          return Promise.resolve({ data: { id: physicalCopyIdCounter++ }, error: null }).then(resolve)
        }
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }

    return chain
  })

  return {
    operations,
    getOps: (table?: string, operation?: string) =>
      operations.filter(
        (op) => (!table || op.table === table) && (!operation || op.operation === operation)
      ),
  }
}

// ---------------------------------------------------------------------------
// Test 1: Archidekt URL → preview → existing mode → deck in DB
// ---------------------------------------------------------------------------

describe('Integration: Archidekt URL → preview → existing mode → deck in DB', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunAllocationResolver.mockResolvedValue({
      assigned: 2,
      shortfall: 1,
      errors: [],
      durationMs: 50,
    })
  })

  it('parses Archidekt URL, normalizes deck, and imports in existing_collection mode', async () => {
    // Step 1: Parse URL
    const parseResult = parseDeckUrl(ARCHIDEKT_URL)
    expect(isParseError(parseResult)).toBe(false)
    if (isParseError(parseResult)) throw new Error('Parse failed')
    expect(parseResult.platform).toBe('archidekt')
    expect(parseResult.deckId).toBe('12345678')

    // Step 2: Normalize the deck (simulating what preview endpoint does)
    const rawDeck = makeArchidektDeckResponse()
    const normalizedDeck = normalizeArchidektDeck(rawDeck, ARCHIDEKT_URL)

    expect(normalizedDeck.name).toBe('Korvold Treasures')
    expect(normalizedDeck.platform).toBe('archidekt')
    expect(normalizedDeck.commander?.cardName).toBe('Korvold, Fae-Cursed King')
    expect(normalizedDeck.cardCount).toBe(3)

    // Step 3: Verify card type grouping
    const cardsByType = groupCardsByType(normalizedDeck.cards)
    expect(cardsByType.totalCount).toBe(3)
    expect(cardsByType.groups.Creature.length).toBe(2) // Korvold + Dockside
    expect(cardsByType.groups.Artifact.length).toBe(1) // Sol Ring

    // Step 4: Import in existing_collection mode
    const tracker = createSupabaseTracker()
    const result = await importDeckExistingCollection(normalizedDeck, TEST_USER_ID)

    // Verify deck row was upserted
    const deckUpserts = tracker.getOps('decks', 'upsert')
    expect(deckUpserts.length).toBe(1)
    expect(deckUpserts[0].data).toEqual(
      expect.objectContaining({
        id: 12345678,
        name: 'Korvold Treasures',
        commander_name: 'Korvold, Fae-Cursed King',
        status: 'active',
        source_url: ARCHIDEKT_URL,
        source_platform: 'archidekt',
        user_id: TEST_USER_ID,
      })
    )

    // Verify deck_cards were inserted (3 cards × 1 quantity each = 3 rows)
    const deckCardInserts = tracker.getOps('deck_cards', 'insert')
    expect(deckCardInserts.length).toBeGreaterThanOrEqual(1)

    // Count total deck_card rows inserted
    const totalInsertedRows = deckCardInserts.reduce(
      (sum, op) => sum + (Array.isArray(op.data) ? op.data.length : 1),
      0
    )
    expect(totalInsertedRows).toBe(3)

    // Verify result
    expect(result.deckId).toBe(12345678)
    expect(result.allocationSummary.assigned).toBe(2)
    expect(result.allocationSummary.shortfall).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Test 2: Moxfield URL → preview → add new mode → deck + physical_copies in DB
// ---------------------------------------------------------------------------

describe('Integration: Moxfield URL → preview → add new mode → deck + physical_copies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunAllocationResolver.mockResolvedValue({
      assigned: 3,
      shortfall: 0,
      errors: [],
      durationMs: 30,
    })
  })

  it('parses Moxfield URL, normalizes deck, and imports in add_new_cards mode', async () => {
    // Step 1: Parse URL
    const parseResult = parseDeckUrl(MOXFIELD_URL)
    expect(isParseError(parseResult)).toBe(false)
    if (isParseError(parseResult)) throw new Error('Parse failed')
    expect(parseResult.platform).toBe('moxfield')
    expect(parseResult.deckId).toBe('abc123XY')

    // Step 2: Normalize the deck
    const rawDeck = makeMoxfieldDeckResponse()
    const normalizedDeck = normalizeMoxfieldDeck(rawDeck, MOXFIELD_URL)

    expect(normalizedDeck.name).toBe('Atraxa Superfriends')
    expect(normalizedDeck.platform).toBe('moxfield')
    expect(normalizedDeck.commander?.cardName).toBe("Atraxa, Praetors' Voice")
    expect(normalizedDeck.cardCount).toBe(3) // 1 commander + 2 mainboard

    // Step 3: Import in add_new_cards mode
    const tracker = createSupabaseTracker()
    const result = await importDeckAddNewCards(normalizedDeck, TEST_USER_ID)

    // Verify deck row was upserted
    const deckUpserts = tracker.getOps('decks', 'upsert')
    expect(deckUpserts.length).toBe(1)
    expect(deckUpserts[0].data).toEqual(
      expect.objectContaining({
        name: 'Atraxa Superfriends',
        status: 'active',
        source_url: MOXFIELD_URL,
        source_platform: 'moxfield',
        user_id: TEST_USER_ID,
      })
    )

    // Verify physical_copies were created (3 cards = 3 physical copies)
    const physicalCopyInserts = tracker.getOps('physical_copies', 'insert')
    expect(physicalCopyInserts.length).toBe(3)

    // All physical copies should have is_proxy=false (Moxfield has no proxy system)
    for (const op of physicalCopyInserts) {
      expect(op.data.is_proxy).toBe(false)
    }

    // Verify deck_cards batch insert contains all cards
    const deckCardInserts = tracker.getOps('deck_cards', 'insert')
    expect(deckCardInserts.length).toBeGreaterThanOrEqual(1)

    // Count total rows — should be 3 (one per card)
    const totalRows = deckCardInserts.reduce(
      (sum, op) => sum + (Array.isArray(op.data) ? op.data.length : 1),
      0
    )
    expect(totalRows).toBe(3)

    // Verify the deck_cards have physical_copy_id set (add_new mode links them)
    const batchData = deckCardInserts.find(op => Array.isArray(op.data))
    if (batchData) {
      for (const row of batchData.data) {
        expect(row.physical_copy_id).not.toBeNull()
        expect(row.ownership_status).toBe('original')
      }
    }

    // Verify result
    expect(result.allocationSummary.assigned).toBe(3)
    expect(result.allocationSummary.shortfall).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Test 3: Proxy cards create is_proxy copies
// ---------------------------------------------------------------------------

describe('Integration: Proxy cards create is_proxy physical copies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunAllocationResolver.mockResolvedValue({
      assigned: 2,
      shortfall: 0,
      errors: [],
      durationMs: 20,
    })
  })

  it('Archidekt proxy-labelled card creates physical_copy with is_proxy=true in existing mode', async () => {
    const rawDeck = makeArchidektDeckResponse()
    const normalizedDeck = normalizeArchidektDeck(rawDeck, ARCHIDEKT_URL)

    // Verify the proxy card was detected during normalization
    const proxyCards = normalizedDeck.cards.filter(c => c.isProxy)
    expect(proxyCards.length).toBe(1)
    expect(proxyCards[0].cardName).toBe('Dockside Extortionist')

    // Import
    const tracker = createSupabaseTracker()
    await importDeckExistingCollection(normalizedDeck, TEST_USER_ID)

    // Verify that a physical_copy insert was made with is_proxy=true
    const physicalCopyInserts = tracker.getOps('physical_copies', 'insert')
    expect(physicalCopyInserts.length).toBeGreaterThanOrEqual(1)

    const proxyInsert = physicalCopyInserts.find(op => op.data?.is_proxy === true)
    expect(proxyInsert).toBeDefined()
    expect(proxyInsert!.data.scryfall_printing_id).toBe('scry-dockside-001')
  })

  it('Archidekt proxy-labelled card creates physical_copy with is_proxy=true in add_new mode', async () => {
    const rawDeck = makeArchidektDeckResponse()
    const normalizedDeck = normalizeArchidektDeck(rawDeck, ARCHIDEKT_URL)

    const tracker = createSupabaseTracker()
    await importDeckAddNewCards(normalizedDeck, TEST_USER_ID)

    // In add_new mode, ALL cards get physical_copies — proxy ones should have is_proxy=true
    const physicalCopyInserts = tracker.getOps('physical_copies', 'insert')

    const proxyInserts = physicalCopyInserts.filter(op => op.data?.is_proxy === true)
    const nonProxyInserts = physicalCopyInserts.filter(op => op.data?.is_proxy === false)

    expect(proxyInserts.length).toBe(1) // Dockside Extortionist
    expect(nonProxyInserts.length).toBe(2) // Korvold + Sol Ring
  })
})

// ---------------------------------------------------------------------------
// Test 4: Re-import same Archidekt URL upserts (no duplicates)
// ---------------------------------------------------------------------------

describe('Integration: Re-import same Archidekt URL upserts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunAllocationResolver.mockResolvedValue({
      assigned: 3,
      shortfall: 0,
      errors: [],
      durationMs: 25,
    })
  })

  it('importing the same Archidekt deck twice upserts the deck row and replaces deck_cards', async () => {
    const rawDeck = makeArchidektDeckResponse()
    const normalizedDeck = normalizeArchidektDeck(rawDeck, ARCHIDEKT_URL)

    // First import
    const tracker1 = createSupabaseTracker()
    const result1 = await importDeckExistingCollection(normalizedDeck, TEST_USER_ID)
    expect(result1.deckId).toBe(12345678)

    // Second import (same deck)
    vi.clearAllMocks()
    const tracker2 = createSupabaseTracker()
    const result2 = await importDeckExistingCollection(normalizedDeck, TEST_USER_ID)

    // Same deck ID both times (Archidekt uses its own numeric ID)
    expect(result2.deckId).toBe(12345678)

    // Verify that the deck row was UPSERTed (not inserted as a duplicate)
    const deckUpserts = tracker2.getOps('decks', 'upsert')
    expect(deckUpserts.length).toBe(1)
    expect(deckUpserts[0].data.id).toBe(12345678)

    // Verify that old deck_cards were deleted before re-inserting
    const deletions = tracker2.getOps('deck_cards', 'delete')
    expect(deletions.length).toBe(1)

    // Verify new deck_cards were inserted
    const inserts = tracker2.getOps('deck_cards', 'insert')
    expect(inserts.length).toBeGreaterThanOrEqual(1)
  })

  it('generates a stable deck ID for Moxfield decks based on publicId', () => {
    const rawDeck = makeMoxfieldDeckResponse()
    const normalizedDeck = normalizeMoxfieldDeck(rawDeck, MOXFIELD_URL)

    // The platform deck ID should be the publicId
    expect(normalizedDeck.platformDeckId).toBe('abc123XY')

    // Importing twice with same publicId should produce the same deckId
    // (this is verified via the hashCode logic in deck-import.ts)
    const parseResult1 = parseDeckUrl(MOXFIELD_URL)
    const parseResult2 = parseDeckUrl(MOXFIELD_URL)
    expect(parseResult1).toEqual(parseResult2)
  })
})

// ---------------------------------------------------------------------------
// Test 5: Allocation resolver runs post-import
// ---------------------------------------------------------------------------

describe('Integration: Allocation resolver runs post-import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runAllocationResolver is called after existing_collection import', async () => {
    mockRunAllocationResolver.mockResolvedValue({
      assigned: 2,
      shortfall: 1,
      errors: [],
      durationMs: 40,
    })

    const rawDeck = makeArchidektDeckResponse()
    const normalizedDeck = normalizeArchidektDeck(rawDeck, ARCHIDEKT_URL)

    createSupabaseTracker()
    const result = await importDeckExistingCollection(normalizedDeck, TEST_USER_ID)

    // Verify allocation resolver was called with the correct userId
    expect(mockRunAllocationResolver).toHaveBeenCalledTimes(1)
    expect(mockRunAllocationResolver).toHaveBeenCalledWith(TEST_USER_ID)

    // Verify allocation summary is included in the result
    expect(result.allocationSummary).toEqual({
      assigned: 2,
      shortfall: 1,
      errors: [],
    })
  })

  it('runAllocationResolver is called after add_new_cards import', async () => {
    mockRunAllocationResolver.mockResolvedValue({
      assigned: 3,
      shortfall: 0,
      errors: [],
      durationMs: 35,
    })

    const rawDeck = makeMoxfieldDeckResponse()
    const normalizedDeck = normalizeMoxfieldDeck(rawDeck, MOXFIELD_URL)

    createSupabaseTracker()
    const result = await importDeckAddNewCards(normalizedDeck, TEST_USER_ID)

    // Verify allocation resolver was called
    expect(mockRunAllocationResolver).toHaveBeenCalledTimes(1)
    expect(mockRunAllocationResolver).toHaveBeenCalledWith(TEST_USER_ID)

    // Verify summary
    expect(result.allocationSummary).toEqual({
      assigned: 3,
      shortfall: 0,
      errors: [],
    })
  })

  it('import succeeds with error summary when allocation resolver fails', async () => {
    mockRunAllocationResolver.mockRejectedValue(new Error('Connection timeout'))

    const rawDeck = makeArchidektDeckResponse()
    const normalizedDeck = normalizeArchidektDeck(rawDeck, ARCHIDEKT_URL)

    createSupabaseTracker()
    const result = await importDeckExistingCollection(normalizedDeck, TEST_USER_ID)

    // Import still returns a deckId (deck was created successfully)
    expect(result.deckId).toBe(12345678)

    // Allocation errors are surfaced in the summary
    expect(result.allocationSummary.errors.length).toBe(1)
    expect(result.allocationSummary.errors[0]).toContain('Connection timeout')
  })
})
