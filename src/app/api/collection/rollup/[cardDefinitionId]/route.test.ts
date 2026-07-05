import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Supabase Client
// ---------------------------------------------------------------------------

type MockResponse = { data: unknown; error: unknown; count?: number }
type MockChainOverrides = Record<string, unknown>

// Table-specific data store for the mock
let mockTables: Record<string, unknown[]> = {}

function createQueryMock(table: string) {
  const rows = () => mockTables[table] || []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    _filters: [] as Array<{ field: string; op: string; value: unknown }>,
    _selectFields: '*',
    select(fields: string, opts?: { count?: string; head?: boolean }) {
      chain._selectFields = fields
      if (opts?.head && opts?.count === 'exact') {
        // Count query — return count of matching rows
        chain._countMode = true
      }
      return chain
    },
    eq(field: string, value: unknown) {
      chain._filters.push({ field, op: 'eq', value })
      return chain
    },
    in(field: string, values: unknown[]) {
      chain._filters.push({ field, op: 'in', value: values })
      return chain
    },
    not(field: string, op: string, value: unknown) {
      chain._filters.push({ field, op: `not_${op}`, value })
      return chain
    },
    single() {
      const filtered = applyFilters(rows(), chain._filters)
      if (filtered.length === 0) {
        return { data: null, error: { message: 'Not found', code: 'PGRST116' } }
      }
      return { data: filtered[0], error: null }
    },
    then(resolve: (val: MockResponse) => void) {
      const filtered = applyFilters(rows(), chain._filters)
      if (chain._countMode) {
        resolve({ data: null, error: null, count: filtered.length })
      } else {
        resolve({ data: filtered, error: null })
      }
    },
  }

  // Make chain thenable so `await query` works
  Object.defineProperty(chain, 'then', {
    value(
      onFulfilled: (val: MockResponse) => unknown,
      onRejected?: (err: unknown) => unknown
    ) {
      const filtered = applyFilters(rows(), chain._filters)
      if (chain._countMode) {
        return Promise.resolve({ data: null, error: null, count: filtered.length }).then(
          onFulfilled,
          onRejected
        )
      }
      return Promise.resolve({ data: filtered, error: null }).then(onFulfilled, onRejected)
    },
    enumerable: false,
    configurable: true,
  })

  return chain
}

function applyFilters(
  rows: unknown[],
  filters: Array<{ field: string; op: string; value: unknown }>
): unknown[] {
  let result = [...rows]
  for (const f of filters) {
    switch (f.op) {
      case 'eq':
        result = result.filter(
          (r) => (r as Record<string, unknown>)[f.field] === f.value
        )
        break
      case 'in':
        result = result.filter((r) =>
          (f.value as unknown[]).includes((r as Record<string, unknown>)[f.field])
        )
        break
      case 'not_is':
        // not(..., 'is', null) means field is NOT null
        result = result.filter(
          (r) => (r as Record<string, unknown>)[f.field] != null
        )
        break
    }
  }
  return result
}

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => createQueryMock(table),
  }),
}))

// Mock the price-store functions
vi.mock('@/lib/price-store', () => ({
  getOwnedValuation: vi.fn(),
}))

import { GET } from './route'
import { getOwnedValuation } from '@/lib/price-store'

const mockGetOwnedValuation = getOwnedValuation as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function callGET(cardDefinitionId: string) {
  const url = new URL(
    `http://localhost:3000/api/collection/rollup/${cardDefinitionId}`
  )
  const request = new NextRequest(url)
  return GET(request, { params: Promise.resolve({ cardDefinitionId }) })
}

function seedCardDefinition(id: number, oracleId: string, cardName: string, typeLine = '') {
  if (!mockTables['card_definitions']) mockTables['card_definitions'] = []
  mockTables['card_definitions'].push({ id, oracle_id: oracleId, card_name: cardName, type_line: typeLine })
}

function seedPhysicalCopy(
  id: number,
  cardDefinitionId: number,
  scryfallPrintingId: string,
  isFoil: boolean,
  isProxy: boolean,
  quantity: number
) {
  if (!mockTables['physical_copies']) mockTables['physical_copies'] = []
  mockTables['physical_copies'].push({
    id,
    card_definition_id: cardDefinitionId,
    scryfall_printing_id: scryfallPrintingId,
    is_foil: isFoil,
    is_proxy: isProxy,
    quantity,
  })
}

function seedDeck(id: number, name: string) {
  if (!mockTables['decks']) mockTables['decks'] = []
  mockTables['decks'].push({ id, name })
}

function seedDeckCard(deckId: number, cardName: string, physicalCopyId: number | null, quantity = 1) {
  if (!mockTables['deck_cards']) mockTables['deck_cards'] = []
  mockTables['deck_cards'].push({
    deck_id: deckId,
    card_name: cardName,
    physical_copy_id: physicalCopyId,
    quantity,
    decks: mockTables['decks']?.find((d: unknown) => (d as { id: number }).id === deckId) || { id: deckId, name: `Deck ${deckId}` },
  })
}

function seedCollection(cardName: string, scryfallId: string, setCode: string, editionName: string) {
  if (!mockTables['collection']) mockTables['collection'] = []
  mockTables['collection'].push({
    card_name: cardName,
    scryfall_id: scryfallId,
    set_code: setCode,
    edition_name: editionName,
  })
}

function seedSet(code: string, name: string) {
  if (!mockTables['sets']) mockTables['sets'] = []
  mockTables['sets'].push({ code, name })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/collection/rollup/[cardDefinitionId]', () => {
  beforeEach(() => {
    mockTables = {}
    mockGetOwnedValuation.mockReset()
    mockGetOwnedValuation.mockResolvedValue(null)
  })

  it('returns 404 for non-numeric cardDefinitionId', async () => {
    const res = await callGET('abc')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Card not found')
  })

  it('returns 404 for non-existent cardDefinitionId', async () => {
    const res = await callGET('999')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Card not found')
  })

  it('returns empty array when card has no physical copies', async () => {
    seedCardDefinition(1, 'oracle-1', 'Sol Ring', 'Artifact')

    const res = await callGET('1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ subgroups: [], proxyPlacementCount: 0 })
  })

  it('returns printing subgroups for a card with physical copies', async () => {
    seedCardDefinition(1, 'oracle-1', 'Sol Ring', 'Artifact')
    seedCollection('Sol Ring', 'print-1', 'cmm', 'Commander Masters')
    seedSet('cmm', 'Commander Masters')
    seedPhysicalCopy(1, 1, 'print-1', false, false, 2)

    mockGetOwnedValuation.mockResolvedValue(1.49)

    const res = await callGET('1')
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.subgroups).toHaveLength(1)
    expect(body.proxyPlacementCount).toBe(0)
    expect(body.subgroups[0]).toMatchObject({
      physicalCopyId: 1,
      scryfallPrintingId: 'print-1',
      setCode: 'cmm',
      setName: 'Commander Masters',
      isFoil: false,
      quantity: 2,
      inUseCount: 0,
      ownedValuation: 1.49,
      deckUsage: [],
    })
  })

  it('includes deck usage entries', async () => {
    seedCardDefinition(1, 'oracle-1', 'Sol Ring', 'Artifact')
    seedPhysicalCopy(1, 1, 'print-1', false, false, 1)
    seedDeck(1, 'Muldrotha Graveyard')
    seedDeck(2, 'Korvold Sacrifice')
    seedDeckCard(1, 'Sol Ring', 1)
    seedDeckCard(2, 'Sol Ring', 1)

    const res = await callGET('1')
    const body = await res.json()

    expect(body.subgroups[0].inUseCount).toBe(2)
    expect(body.subgroups[0].deckUsage).toHaveLength(2)
    expect(body.subgroups[0].deckUsage).toContainEqual({
      deckId: 1,
      deckName: 'Muldrotha Graveyard',
      quantity: 1,
    })
    expect(body.subgroups[0].deckUsage).toContainEqual({
      deckId: 2,
      deckName: 'Korvold Sacrifice',
      quantity: 1,
    })
  })

  it('returns null ownedValuation for basic lands', async () => {
    seedCardDefinition(1, 'oracle-forest', 'Forest', 'Basic Land — Forest')
    seedPhysicalCopy(1, 1, 'forest-print', false, false, 10)

    // Even if price-store would return a value, basic lands return null
    mockGetOwnedValuation.mockResolvedValue(0.25)

    const res = await callGET('1')
    const body = await res.json()

    // Route skips price lookup for basic lands
    expect(body.subgroups[0].ownedValuation).toBeNull()
  })

  it('returns null ownedValuation when no price entry exists', async () => {
    seedCardDefinition(1, 'oracle-1', 'Lightning Bolt', 'Instant')
    seedPhysicalCopy(1, 1, 'bolt-print', false, false, 1)

    mockGetOwnedValuation.mockResolvedValue(null)

    const res = await callGET('1')
    const body = await res.json()

    expect(body.subgroups[0].ownedValuation).toBeNull()
  })

  it('excludes proxy physical copies from results', async () => {
    seedCardDefinition(1, 'oracle-1', 'Sol Ring', 'Artifact')
    seedPhysicalCopy(1, 1, 'print-1', false, false, 1) // Non-proxy
    seedPhysicalCopy(2, 1, 'print-1', false, true, 1) // Proxy — should not appear

    const res = await callGET('1')
    const body = await res.json()

    expect(body.subgroups).toHaveLength(1)
    expect(body.subgroups[0].physicalCopyId).toBe(1)
  })

  it('handles multiple printings of the same card', async () => {
    seedCardDefinition(1, 'oracle-1', 'Sol Ring', 'Artifact')
    seedCollection('Sol Ring', 'print-1', 'cmm', 'Commander Masters')
    seedCollection('Sol Ring', 'print-2', 'c21', 'Commander 2021')
    seedPhysicalCopy(1, 1, 'print-1', false, false, 2)
    seedPhysicalCopy(2, 1, 'print-2', true, false, 1)

    mockGetOwnedValuation
      .mockResolvedValueOnce(1.49) // print-1, non-foil
      .mockResolvedValueOnce(4.99) // print-2, foil

    const res = await callGET('1')
    const body = await res.json()

    expect(body.subgroups).toHaveLength(2)
    const nonFoil = body.subgroups.find(
      (r: { physicalCopyId: number }) => r.physicalCopyId === 1
    )
    const foil = body.subgroups.find(
      (r: { physicalCopyId: number }) => r.physicalCopyId === 2
    )

    expect(nonFoil.isFoil).toBe(false)
    expect(nonFoil.quantity).toBe(2)
    expect(nonFoil.ownedValuation).toBe(1.49)

    expect(foil.isFoil).toBe(true)
    expect(foil.quantity).toBe(1)
    expect(foil.ownedValuation).toBe(4.99)
  })

  it('returns proxyPlacementCount when proxy placements exist', async () => {
    seedCardDefinition(1, 'oracle-1', 'Sol Ring', 'Artifact')
    seedPhysicalCopy(1, 1, 'print-1', false, false, 1) // Non-proxy
    seedPhysicalCopy(2, 1, 'print-1', false, true, 1) // Proxy
    seedDeck(1, 'Deck A')
    seedDeck(2, 'Deck B')
    seedDeckCard(1, 'Sol Ring', 2)
    seedDeckCard(2, 'Sol Ring', 2)

    const res = await callGET('1')
    const body = await res.json()

    expect(body.proxyPlacementCount).toBe(2)
    expect(body.subgroups).toHaveLength(1) // Only non-proxy shows
  })

  it('returns proxyPlacementCount of 0 when no proxy placements exist', async () => {
    seedCardDefinition(1, 'oracle-1', 'Sol Ring', 'Artifact')
    seedPhysicalCopy(1, 1, 'print-1', false, false, 1)

    const res = await callGET('1')
    const body = await res.json()

    expect(body.proxyPlacementCount).toBe(0)
  })
})
