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

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFrom = vi.fn()
const mockRpc = vi.fn()
const mockCreateVersionSnapshot = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

vi.mock('@/lib/card-definition-resolver', () => ({
  resolveCardDefinitions: vi.fn().mockImplementation(async (cards: Array<{ oracleId: string }>) => {
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

vi.mock('@/lib/deck-versions', () => ({
  createVersionSnapshot: (...args: unknown[]) => mockCreateVersionSnapshot(...args),
}))

// ---------------------------------------------------------------------------
// Import modules AFTER mocks are set up
// ---------------------------------------------------------------------------

import { parseDeckUrl, isParseError } from '@/lib/url-parser'
import { normalizeArchidektDeck, normalizeMoxfieldDeck, groupCardsByType } from '@/lib/deck-normalizer'
import { importDeckTheorycrafted, importDeckNewCards } from '@/lib/deck-import'
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
          boardType: 'commanders',
          finish: 'nonfoil',
          isFoil: false,
          isAlter: false,
          isProxy: false,
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
          boardType: 'mainboard',
          finish: 'nonfoil',
          isFoil: false,
          isAlter: false,
          isProxy: false,
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
          boardType: 'mainboard',
          finish: 'nonfoil',
          isFoil: false,
          isAlter: false,
          isProxy: false,
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
  data: unknown
}

interface QueryMock {
  select: () => QueryMock
  upsert: (rows: unknown) => QueryMock
  eq: () => QueryMock
  range: () => QueryMock
  then: (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise<unknown>
}

/**
 * Mock the Supabase query builder for the tables the import functions read.
 * Records upserts so tests can assert what the import wrote.
 */
function createSupabaseTracker() {
  const operations: TrackedOperation[] = []

  mockFrom.mockImplementation((table: string) => {
    const response = (): { data: unknown; error: unknown } => {
      if (table === 'decks') return { data: [{ id: 12345678, name: 'Deck' }], error: null }
      if (table === 'deck_cards') return { data: [], error: null }
      return { data: null, error: null }
    }

    const chain: QueryMock = {
      select: vi.fn(() => chain),
      upsert: vi.fn((rows: unknown) => {
        operations.push({ table, operation: 'upsert', data: rows })
        return chain
      }),
      eq: vi.fn(() => chain),
      range: vi.fn(() => chain),
      then: (resolve, reject) => Promise.resolve(response()).then(resolve, reject),
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

interface RpcArgs {
  p_deck_id?: number
  p_rows?: unknown[]
  p_delete_ids?: unknown[]
  p_insert_rows?: unknown[]
}

/** Mock the atomic RPCs the import functions call. */
function setupRpcMock() {
  mockRpc.mockImplementation(async (name: string, args: RpcArgs) => {
    if (name === 'apply_deck_cards_diff') {
      return {
        data: {
          success: true,
          deleted_count: (args.p_delete_ids ?? []).length,
          inserted_count: (args.p_insert_rows ?? []).length,
        },
        error: null,
      }
    }
    if (name === 'replace_deck_with_new_cards') {
      return {
        data: {
          success: true,
          inserted_count: (args.p_rows ?? []).length,
          removed_count: 0,
        },
        error: null,
      }
    }
    throw new Error(`Unexpected RPC: ${name}`)
  })
}

// ---------------------------------------------------------------------------
// Test 1: Archidekt URL → preview → theorycrafted import
// ---------------------------------------------------------------------------

describe('Integration: Archidekt URL → preview → theorycrafted import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupRpcMock()
    mockCreateVersionSnapshot.mockResolvedValue(null)
  })

  it('parses Archidekt URL, normalizes deck, and imports on the deck diff path', async () => {
    // Step 1: Parse URL
    const parseResult = parseDeckUrl(ARCHIDEKT_URL)
    expect(isParseError(parseResult)).toBe(false)
    if (isParseError(parseResult)) throw new Error('Parse failed')
    expect(parseResult.platform).toBe('archidekt')
    expect(parseResult.deckId).toBe('12345678')

    // Step 2: Normalize the deck (simulating what the preview endpoint does)
    const normalizedDeck = normalizeArchidektDeck(makeArchidektDeckResponse(), ARCHIDEKT_URL)

    expect(normalizedDeck.name).toBe('Korvold Treasures')
    expect(normalizedDeck.platform).toBe('archidekt')
    expect(normalizedDeck.commander?.cardName).toBe('Korvold, Fae-Cursed King')
    expect(normalizedDeck.cardCount).toBe(3)

    // Step 3: Verify card type grouping
    const cardsByType = groupCardsByType(normalizedDeck.cards)
    expect(cardsByType.totalCount).toBe(3)
    expect(cardsByType.groups.Creature.length).toBe(2) // Korvold + Dockside
    expect(cardsByType.groups.Artifact.length).toBe(1) // Sol Ring

    // Step 4: Import in theorycrafted mode
    const tracker = createSupabaseTracker()
    const result = await importDeckTheorycrafted(normalizedDeck, TEST_USER_ID)

    // Deck row upserted
    const deckUpserts = tracker.getOps('decks', 'upsert')
    expect(deckUpserts).toHaveLength(1)
    expect(deckUpserts[0].data).toEqual(
      expect.objectContaining({
        id: 12345678,
        name: 'Korvold Treasures',
        commander_name: 'Korvold, Fae-Cursed King',
        is_active: false,
        source_url: ARCHIDEKT_URL,
        source_platform: 'archidekt',
        user_id: TEST_USER_ID,
      })
    )

    // Theorycrafted mode replaces deck_cards through the atomic diff RPC
    const diffCall = mockRpc.mock.calls.find(([name]) => name === 'apply_deck_cards_diff')
    expect(diffCall).toBeDefined()
    expect(diffCall![1].p_deck_id).toBe(12345678)
    expect(diffCall![1].p_delete_ids).toEqual([])
    expect(diffCall![1].p_insert_rows).toHaveLength(3)

    // A version snapshot is taken after import
    expect(mockCreateVersionSnapshot).toHaveBeenCalledTimes(1)

    expect(result.deckId).toBe(12345678)
    expect(result.allocationSummary).toEqual({
      assigned: 0,
      shortfall: 0,
      errors: [],
      conflicts: [],
    })
  })
})

// ---------------------------------------------------------------------------
// Test 2: Moxfield URL → preview → new_cards import
// ---------------------------------------------------------------------------

describe('Integration: Moxfield URL → preview → new_cards import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupRpcMock()
    mockCreateVersionSnapshot.mockResolvedValue(null)
  })

  it('parses Moxfield URL, normalizes deck, and imports on the new-cards path', async () => {
    // Step 1: Parse URL
    const parseResult = parseDeckUrl(MOXFIELD_URL)
    expect(isParseError(parseResult)).toBe(false)
    if (isParseError(parseResult)) throw new Error('Parse failed')
    expect(parseResult.platform).toBe('moxfield')
    expect(parseResult.deckId).toBe('abc123XY')

    // Step 2: Normalize the deck
    const normalizedDeck = normalizeMoxfieldDeck(makeMoxfieldDeckResponse(), MOXFIELD_URL)

    expect(normalizedDeck.name).toBe('Atraxa Superfriends')
    expect(normalizedDeck.platform).toBe('moxfield')
    expect(normalizedDeck.commander?.cardName).toBe("Atraxa, Praetors' Voice")
    expect(normalizedDeck.cardCount).toBe(3) // 1 commander + 2 mainboard

    // Step 3: Import in new_cards mode
    const tracker = createSupabaseTracker()
    const result = await importDeckNewCards(normalizedDeck, TEST_USER_ID)

    const deckUpserts = tracker.getOps('decks', 'upsert')
    expect(deckUpserts).toHaveLength(1)
    expect(deckUpserts[0].data).toEqual(
      expect.objectContaining({
        name: 'Atraxa Superfriends',
        is_active: true,
        source_url: MOXFIELD_URL,
        source_platform: 'moxfield',
        user_id: TEST_USER_ID,
      })
    )

    // New-cards mode writes one atomic payload containing a row per copy
    const replaceCall = mockRpc.mock.calls.find(([name]) => name === 'replace_deck_with_new_cards')
    expect(replaceCall).toBeDefined()
    const rows = replaceCall![1].p_rows as Array<Record<string, unknown>>
    expect(rows).toHaveLength(3)
    // Moxfield has no proxy system — every row is a plain copy
    expect(rows.every((row) => row.is_proxy === false)).toBe(true)

    expect(result.allocationSummary.assigned).toBe(3)
    expect(result.allocationSummary.shortfall).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Test 3: Proxy identity preserved on the new-cards path
// ---------------------------------------------------------------------------

describe('Integration: Proxy identity is preserved on import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupRpcMock()
    mockCreateVersionSnapshot.mockResolvedValue(null)
  })

  it('Archidekt proxy-labelled card is flagged is_proxy in the new-cards payload', async () => {
    const normalizedDeck = normalizeArchidektDeck(makeArchidektDeckResponse(), ARCHIDEKT_URL)

    // The proxy card is detected during normalization
    const proxyCards = normalizedDeck.cards.filter((c) => c.isProxy)
    expect(proxyCards).toHaveLength(1)
    expect(proxyCards[0].cardName).toBe('Dockside Extortionist')

    createSupabaseTracker()
    await importDeckNewCards(normalizedDeck, TEST_USER_ID)

    const replaceCall = mockRpc.mock.calls.find(([name]) => name === 'replace_deck_with_new_cards')
    if (!replaceCall) throw new Error('replace_deck_with_new_cards was not called')
    const rows = replaceCall[1].p_rows as Array<Record<string, unknown>>

    const proxyRows = rows.filter((row) => row.is_proxy === true)
    const nonProxyRows = rows.filter((row) => row.is_proxy === false)

    expect(proxyRows).toHaveLength(1) // Dockside Extortionist
    expect(proxyRows[0].printing_id).toBe('scry-dockside-001')
    expect(nonProxyRows).toHaveLength(2) // Korvold + Sol Ring
  })
})

// ---------------------------------------------------------------------------
// Test 4: Re-import same deck upserts in place
// ---------------------------------------------------------------------------

describe('Integration: Re-import same deck upserts in place', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupRpcMock()
    mockCreateVersionSnapshot.mockResolvedValue(null)
  })

  it('importing the same Archidekt deck twice reuses the deck id and diff path', async () => {
    const normalizedDeck = normalizeArchidektDeck(makeArchidektDeckResponse(), ARCHIDEKT_URL)

    // First import
    const result1 = await importDeckTheorycrafted(normalizedDeck, TEST_USER_ID)
    expect(result1.deckId).toBe(12345678)

    // Second import (same deck)
    vi.clearAllMocks()
    setupRpcMock()
    mockCreateVersionSnapshot.mockResolvedValue(null)

    const tracker2 = createSupabaseTracker()
    const result2 = await importDeckTheorycrafted(normalizedDeck, TEST_USER_ID)

    // Same deck ID both times (Archidekt uses its own numeric ID)
    expect(result2.deckId).toBe(12345678)

    // Deck row is UPSERTed (not inserted as a duplicate)
    const deckUpserts = tracker2.getOps('decks', 'upsert')
    expect(deckUpserts).toHaveLength(1)
    expect((deckUpserts[0].data as { id: number }).id).toBe(12345678)

    // Re-import replaces deck_cards through the same atomic diff RPC
    const diffCalls = mockRpc.mock.calls.filter(([name]) => name === 'apply_deck_cards_diff')
    expect(diffCalls).toHaveLength(1)
    expect(diffCalls[0][1].p_deck_id).toBe(12345678)
  })

  it('generates a stable deck id for Moxfield decks from the publicId', async () => {
    const normalizedDeck = normalizeMoxfieldDeck(makeMoxfieldDeckResponse(), MOXFIELD_URL)

    expect(normalizedDeck.platformDeckId).toBe('abc123XY')

    const first = await importDeckTheorycrafted(normalizedDeck, TEST_USER_ID)

    vi.clearAllMocks()
    setupRpcMock()
    mockCreateVersionSnapshot.mockResolvedValue(null)

    const second = await importDeckTheorycrafted(normalizedDeck, TEST_USER_ID)
    expect(second.deckId).toBe(first.deckId)
  })
})
