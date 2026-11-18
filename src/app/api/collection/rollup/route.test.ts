import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Supabase Client — per-table response queues, consumed in call order.
// ---------------------------------------------------------------------------

type MockResponse = { data?: unknown; error?: unknown; count?: number | null }

let queues: Record<string, MockResponse[]>
let orCalls: Array<{ table: string; expr: string }>
let deferredTables: Record<string, { promise: Promise<MockResponse>; onStart: () => void }>

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
      const deferred = deferredTables[table]
      if (deferred) {
        deferred.onStart()
        return deferred.promise.then(onFulfilled, onRejected)
      }
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
  const url = new URL('http://localhost:3000/api/collection/rollup')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return GET(new NextRequest(url))
}

describe('GET /api/collection/rollup — B1 price-freshness read', () => {
  beforeEach(() => {
    queues = {}
    orCalls = []
    clearFactlessCopyCache()
    deferredTables = {}
    mockAuthResult = { id: 'user-123' }
    mockGetLastRefreshTimestamp.mockReset()
    mockIsPriceDataStale.mockReset()
    mockGetLastRefreshTimestamp.mockResolvedValue('2026-09-01T00:00:00.000Z')
    mockIsPriceDataStale.mockResolvedValue(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('empty-count branch: one timestamp read, isPriceStale derived from that same value', async () => {
    queue('user_cards', { count: 0, error: null })

    const res = await callGET()
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

  it('empty-page branch: totalCount > 0 but no cards on this page — one timestamp read', async () => {
    queue('user_cards', { count: 5, error: null }) // count query
    queue('user_cards', { data: [], error: null }) // page query returns none

    const res = await callGET({ page: '99' })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(mockGetLastRefreshTimestamp).toHaveBeenCalledTimes(1)
    expect(mockIsPriceDataStale).toHaveBeenCalledTimes(1)
    expect(mockIsPriceDataStale).toHaveBeenCalledWith('2026-09-01T00:00:00.000Z')
    expect(body).toMatchObject({
      rows: [],
      totalCount: 5,
      lastPriceRefresh: '2026-09-01T00:00:00.000Z',
      isPriceStale: false,
    })
  })

  it('normal-page branch: exactly one timestamp read for the single reached freshness site', async () => {
    queue('user_cards', { count: 1, error: null }) // count query
    queue('user_cards', {
      data: [{ id: 1, card_name: 'Sol Ring', oracle_id: 'oracle-1', color_identity: null, type_line: 'Artifact' }],
      error: null,
    }) // page query
    queue('user_copies', { data: [], error: null }) // no owned copies — skip deck/set lookups

    const res = await callGET()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(mockGetLastRefreshTimestamp).toHaveBeenCalledTimes(1)
    expect(mockIsPriceDataStale).toHaveBeenCalledTimes(1)
    expect(mockIsPriceDataStale).toHaveBeenCalledWith('2026-09-01T00:00:00.000Z')
    expect(body.rows).toHaveLength(1)
    expect(body.lastPriceRefresh).toBe('2026-09-01T00:00:00.000Z')
    expect(body.isPriceStale).toBe(false)
  })

  it('normal-page branch: card-data copies fetch and single timestamp lookup are started concurrently', async () => {
    const events: string[] = []

    let resolveCopies!: (v: MockResponse) => void
    const copiesPromise = new Promise<MockResponse>((resolve) => {
      resolveCopies = resolve
    })
    deferredTables['user_copies'] = {
      promise: copiesPromise,
      onStart: () => events.push('start:copies'),
    }

    let resolveTimestamp!: (v: string | null) => void
    const timestampPromise = new Promise<string | null>((resolve) => {
      resolveTimestamp = resolve
    })
    mockGetLastRefreshTimestamp.mockImplementation(() => {
      events.push('start:timestamp')
      return timestampPromise
    })

    queue('user_cards', { count: 1, error: null }) // count query
    queue('user_cards', {
      data: [{ id: 1, card_name: 'Sol Ring', oracle_id: 'oracle-1', color_identity: null, type_line: 'Artifact' }],
      error: null,
    }) // page query

    const resPromise = callGET()

    // Flush microtasks so both Promise.all branches have had a chance to
    // start, without resolving either — proving they were kicked off
    // together rather than one awaited before the other begins. Several
    // prior awaits (auth, count query, page query) each consume a tick.
    for (let i = 0; i < 20 && events.length < 2; i++) {
      await Promise.resolve()
    }

    expect(events).toEqual(['start:copies', 'start:timestamp'])

    resolveTimestamp('2026-09-01T00:00:00.000Z')
    await Promise.resolve()
    resolveCopies({ data: [], error: null })

    const res = await resPromise
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(mockIsPriceDataStale).toHaveBeenCalledWith('2026-09-01T00:00:00.000Z')
    expect(body.rows).toHaveLength(1)
    expect(body.lastPriceRefresh).toBe('2026-09-01T00:00:00.000Z')
    expect(body.isPriceStale).toBe(false)
  })

  it('null metadata and stale=true propagate unchanged through the envelope', async () => {
    mockGetLastRefreshTimestamp.mockResolvedValue(null)
    mockIsPriceDataStale.mockResolvedValue(true)
    queue('user_cards', { count: 0, error: null })

    const res = await callGET()
    const body = await res.json()

    expect(mockIsPriceDataStale).toHaveBeenCalledWith(null)
    expect(body.lastPriceRefresh).toBeNull()
    expect(body.isPriceStale).toBe(true)
  })

  it('failures before the freshness site (count query error) start no metadata work', async () => {
    queue('user_cards', { count: null, error: { message: 'db down' } })

    const res = await callGET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to load collection data')

    expect(mockGetLastRefreshTimestamp).not.toHaveBeenCalled()
    expect(mockIsPriceDataStale).not.toHaveBeenCalled()
  })

  it('an auth failure returns before any metadata work', async () => {
    mockAuthResult = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    const res = await callGET()
    expect(res.status).toBe(401)
    expect(mockGetLastRefreshTimestamp).not.toHaveBeenCalled()
    expect(mockIsPriceDataStale).not.toHaveBeenCalled()
  })

  it('page-query error (still before any freshness site is reached) starts no metadata work', async () => {
    queue('user_cards', { count: 1, error: null })
    queue('user_cards', { data: null, error: { message: 'read failed' } })

    const res = await callGET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to load collection data')

    // The Step 1b page query throws before Step 2's freshness site runs.
    expect(mockGetLastRefreshTimestamp).not.toHaveBeenCalled()
    expect(mockIsPriceDataStale).not.toHaveBeenCalled()
  })

  it('a genuine post-freshness-site card-data error (copies query fails) still remains a route error', async () => {
    queue('user_cards', { count: 1, error: null })
    queue('user_cards', {
      data: [{ id: 1, card_name: 'Sol Ring', oracle_id: 'oracle-1', color_identity: null, type_line: 'Artifact' }],
      error: null,
    })
    queue('user_copies', { data: null, error: { message: 'copies read failed' } })

    const res = await callGET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to load collection data')

    // getLastRefreshTimestamp was already started in the same Promise.all as
    // the failing copies query, so the single freshness read still ran;
    // isPriceDataStale is never reached because Promise.all rejects first.
    expect(mockGetLastRefreshTimestamp).toHaveBeenCalledTimes(1)
    expect(mockIsPriceDataStale).not.toHaveBeenCalled()
  })

  it.each(['exact', 'includes'])('%s + colourless (grid view): lists the colourless cards from the card library view', async (mode) => {
    queue('connector_collection_copies', { data: [], error: null }) // copies the view cannot judge: none
    queue('connector_collection_copies', {
      data: [{ card_id: 7, card_name: 'Sol Ring' }, { card_id: 7, card_name: 'Sol Ring' }],
      count: 2,
      error: null,
    })
    queue('user_cards', {
      data: [{ id: 7, card_name: 'Sol Ring', oracle_id: 'o-7', color_identity: '', type_line: null }],
      error: null,
    })
    queue('user_copies', { data: [{ id: 1, card_id: 7, printing_id: null, finish: 'nonfoil' }], error: null })
    const res = await callGET({ colors: 'C', colorMode: mode })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalCount).toBe(1) // two copies, one card
    expect(body.rows.map((r: { cardName: string }) => r.cardName)).toEqual(['Sol Ring'])
    expect(orCalls.find((c) => c.table === 'connector_collection_copies')?.expr).toBe(
      'and(facts_available.eq.true,is_colourless.eq.true)'
    )
  })
  it('basic=true: lists only cards whose Basic supertype the parser finds (Basic, Snow Land included), with no colour filter', async () => {
    queue('connector_collection_copies', {
      data: [
        { card_id: 1, card_name: 'Forest', type_line: 'Basic Land — Forest' },
        { card_id: 2, card_name: 'Snow-Covered Swamp', type_line: 'Basic, Snow Land — Swamp' },
        { card_id: 3, card_name: 'Basic Rock', type_line: 'Artifact — Basic' }, // text matches, supertype does not
      ],
      count: 3,
      error: null,
    })
    queue('user_cards', {
      data: [
        { id: 1, card_name: 'Forest', oracle_id: 'o-1', color_identity: 'G', type_line: null },
        { id: 2, card_name: 'Snow-Covered Swamp', oracle_id: 'o-2', color_identity: 'B', type_line: null },
      ],
      error: null,
    })
    queue('user_copies', { data: [], error: null })
    const res = await callGET({ basic: 'true' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalCount).toBe(2)
    expect(body.rows.map((r: { cardName: string }) => r.cardName)).toEqual(['Forest', 'Snow-Covered Swamp'])
    expect(orCalls).toEqual([])
  })
})
