import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Supabase Client — per-table response queues, consumed in call order.
// ---------------------------------------------------------------------------

type MockResponse = { data?: unknown; error?: unknown; count?: number | null }

let queues: Record<string, MockResponse[]>
let orCalls: Array<{ table: string; expr: string }>

function nextResponse(table: string): MockResponse {
  const q = queues[table]
  if (!q || q.length === 0) return { data: [], error: null, count: 0 }
  return q.shift() as MockResponse
}

function queue(table: string, resp: MockResponse) {
  if (!queues[table]) queues[table] = []
  queues[table].push(resp)
}

function createQueryMock(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    ilike: () => chain,
    not: () => chain,
    or: (expr: string) => {
      orCalls.push({ table, expr })
      return chain
    },
    order: () => chain,
    range: () => chain,
  }
  Object.defineProperty(chain, 'then', {
    value(onFulfilled: (val: MockResponse) => unknown, onRejected?: (err: unknown) => unknown) {
      return Promise.resolve(nextResponse(table)).then(onFulfilled, onRejected)
    },
    enumerable: false,
    configurable: true,
  })
  return chain
}

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => createQueryMock(table),
  }),
}))

let mockAuthResult: unknown = { id: 'user-123' }
vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve(mockAuthResult),
}))

const mockGetLastRefreshTimestamp = vi.fn()
const mockIsPriceDataStale = vi.fn()
vi.mock('@/lib/price-store', () => ({
  getLastRefreshTimestamp: (...args: unknown[]) => mockGetLastRefreshTimestamp(...args),
  isPriceDataStale: (...args: unknown[]) => mockIsPriceDataStale(...args),
}))

import { GET } from './route'
import { clearFactlessCopyCache } from '@/lib/collection-colour-filter'

function callGET(params: Record<string, string> = {}) {
  const url = new URL('http://localhost:3000/api/collection/printings')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return GET(new NextRequest(url))
}

describe('GET /api/collection/printings — B1 price-freshness read', () => {
  beforeEach(() => {
    queues = {}
    orCalls = []
    clearFactlessCopyCache()
    mockAuthResult = { id: 'user-123' }
    mockGetLastRefreshTimestamp.mockReset()
    mockIsPriceDataStale.mockReset()
    mockGetLastRefreshTimestamp.mockResolvedValue('2026-09-01T00:00:00.000Z')
    mockIsPriceDataStale.mockResolvedValue(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('no-copies branch (optimized path, totalCopies 0): one timestamp read', async () => {
    queue('connector_collection_copies', { data: [], count: 0, error: null }) // page query in the fast path

    const res = await callGET() // default sort=cardName, no colors -> optimized path
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(mockGetLastRefreshTimestamp).toHaveBeenCalledTimes(1)
    expect(mockIsPriceDataStale).toHaveBeenCalledTimes(1)
    expect(mockIsPriceDataStale).toHaveBeenCalledWith('2026-09-01T00:00:00.000Z')
    expect(body).toMatchObject({
      rows: [],
      totalCount: 0,
      lastPriceRefresh: '2026-09-01T00:00:00.000Z',
      isPriceStale: false,
    })
  })

  it('searched-empty branch (optimized path, filtered to zero rows): one timestamp read', async () => {
    queue('connector_collection_copies', { data: [], count: 0, error: null }) // the database finds no match for the search

    const res = await callGET({ search: 'Nonexistent Card' })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(mockGetLastRefreshTimestamp).toHaveBeenCalledTimes(1)
    expect(mockIsPriceDataStale).toHaveBeenCalledTimes(1)
    expect(body).toMatchObject({
      rows: [],
      totalCount: 0,
      lastPriceRefresh: '2026-09-01T00:00:00.000Z',
      isPriceStale: false,
    })
  })

  it('normal fast branch (optimized path with matching data): one timestamp read', async () => {
    queue('connector_collection_copies', {
      data: [
        { copy_id: 1, card_id: 10, printing_id: 'p-1', finish: 'nonfoil', is_proxy: false, card_name: 'Sol Ring' },
      ],
      count: 1,
      error: null,
    }) // the page of copies
    queue('ref_printings', { data: [], error: null })
    queue('deck_cards', { data: [], error: null })

    queue('user_copies', { data: [{ id: 1, created_at: '2026-01-01T00:00:00.000Z' }], error: null })
    const res = await callGET()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(mockGetLastRefreshTimestamp).toHaveBeenCalledTimes(1)
    expect(mockIsPriceDataStale).toHaveBeenCalledTimes(1)
    expect(mockIsPriceDataStale).toHaveBeenCalledWith('2026-09-01T00:00:00.000Z')
    expect(body.rows.length).toBeGreaterThan(0)
    expect(body.lastPriceRefresh).toBe('2026-09-01T00:00:00.000Z')
    expect(body.isPriceStale).toBe(false)
  })

  it('fallback branch (non-cardName sort or color filter): one timestamp read, still from the shared top-level site', async () => {
    queue('user_copies', {
      data: [
        {
          id: 1,
          card_id: 10,
          printing_id: 'p-1',
          finish: 'nonfoil',
          is_proxy: false,
          created_at: '2026-01-01T00:00:00.000Z',
          user_cards: { card_name: 'Sol Ring' },
        },
      ],
      error: null,
      count: 1,
    }) // fallback batch fetch (with count on first batch)
    queue('ref_printings', { data: [], error: null })
    queue('deck_cards', { data: [], error: null })

    const res = await callGET({ sort: 'price' }) // triggers FALLBACK PATH
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(mockGetLastRefreshTimestamp).toHaveBeenCalledTimes(1)
    expect(mockIsPriceDataStale).toHaveBeenCalledTimes(1)
    expect(mockIsPriceDataStale).toHaveBeenCalledWith('2026-09-01T00:00:00.000Z')
    expect(body.rows.length).toBeGreaterThan(0)
    expect(body.lastPriceRefresh).toBe('2026-09-01T00:00:00.000Z')
    expect(body.isPriceStale).toBe(false)
  })

  it('null metadata and stale=true propagate unchanged through the envelope', async () => {
    mockGetLastRefreshTimestamp.mockResolvedValue(null)
    mockIsPriceDataStale.mockResolvedValue(true)
    queue('connector_collection_copies', { data: [], count: 0, error: null })

    const res = await callGET()
    const body = await res.json()

    expect(mockIsPriceDataStale).toHaveBeenCalledWith(null)
    expect(body.lastPriceRefresh).toBeNull()
    expect(body.isPriceStale).toBe(true)
  })

  it('an auth failure returns before any metadata work', async () => {
    mockAuthResult = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    const res = await callGET()
    expect(res.status).toBe(401)
    expect(mockGetLastRefreshTimestamp).not.toHaveBeenCalled()
    expect(mockIsPriceDataStale).not.toHaveBeenCalled()
  })

  it('card-data errors after the shared freshness site remain route errors, not metadata fallback', async () => {
    // Fallback path's batch loop throws on a query error (unlike the optimized
    // path's best-effort batches), giving a deterministic post-freshness failure.
    queue('user_copies', { data: null, error: { message: 'read failed' }, count: null })

    const res = await callGET({ sort: 'price' })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to load collection data')

    // The single shared freshness read still ran before this later failure.
    expect(mockGetLastRefreshTimestamp).toHaveBeenCalledTimes(1)
  })

  describe('colour filter (colourless is stored as an empty colour list, not as the letter C)', () => {
    const solRing = { copy_id: 1, card_id: 10, printing_id: 'p-1', finish: 'nonfoil', is_proxy: false, card_name: 'Sol Ring' }

    async function runColours(colorMode: string, colors: string) {
      queue('connector_collection_copies', { data: [], error: null }) // copies the view cannot judge: none
      queue('connector_collection_copies', { data: [solRing], count: 1, error: null })
      queue('ref_printings', { data: [], error: null })
      queue('deck_cards', { data: [], error: null })
      queue('user_copies', { data: [{ id: 1, created_at: '2026-01-01T00:00:00.000Z' }], error: null })
      const res = await callGET({ colors, colorMode })
      return { res, body: await res.json() }
    }

    it.each(['exact', 'includes'])('%s + colourless: asks the database for colourless copies and returns them', async (mode) => {
      const { res, body } = await runColours(mode, 'C')
      expect(res.status).toBe(200)
      expect(body.totalCount).toBe(1)
      expect(body.rows[0].cardName).toBe('Sol Ring')
      const main = orCalls.find((c) => c.table === 'connector_collection_copies')
      expect(main?.expr).toContain('is_colourless.eq.true')
      expect(main?.expr).not.toContain('has_')
    })

    it('Exact + green + colourless: mono-green OR colourless', async () => {
      await runColours('exact', 'G,C')
      const expr = orCalls.find((c) => c.table === 'connector_collection_copies')?.expr ?? ''
      expect(expr).toContain('and(facts_available.eq.true,has_w.eq.false,has_u.eq.false,has_b.eq.false,has_r.eq.false,has_g.eq.true)')
      expect(expr).toContain('is_colourless.eq.true')
    })
  })
})
