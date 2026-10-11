import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Supabase — per-table response queues, consumed in call order.
// ---------------------------------------------------------------------------

type MockResponse = { data?: unknown; error?: unknown; count?: number | null }

let queues: Record<string, MockResponse[]> = {}

function queue(table: string, resp: MockResponse) {
  if (!queues[table]) queues[table] = []
  queues[table].push(resp)
}

function nextResponse(table: string): MockResponse {
  const q = queues[table]
  if (!q || q.length === 0) return { data: null, error: null, count: null }
  return q.shift() as MockResponse
}

function createQueryMock(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(nextResponse(table)),
    single: () => Promise.resolve(nextResponse(table)),
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

const mockRpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => createQueryMock(table),
    rpc: mockRpc,
  }),
}))

let mockAuthResult: unknown = { id: 'user-1' }

vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve(mockAuthResult),
}))

import { POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/collection/instances/add-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/collection/instances/add-proxy', () => {
  beforeEach(() => {
    queues = {}
    vi.clearAllMocks()
    mockAuthResult = { id: 'user-1' }
    mockRpc.mockResolvedValue({
      data: { success: true, inserted_ids: [55] },
      error: null,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuthResult = Response.json({ error: 'Unauthorized' }, { status: 401 })

    const res = await POST(makeRequest({ oracleId: 'oracle-sol' }))

    expect(res.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 400 when oracleId is missing', async () => {
    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 400 for an unsupported finish', async () => {
    const res = await POST(makeRequest({ oracleId: 'oracle-sol', finish: 'glossy' }))

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 404 when the card is not in the collection', async () => {
    queue('user_cards', { data: null, error: null })

    const res = await POST(makeRequest({ oracleId: 'oracle-sol' }))

    expect(res.status).toBe(404)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('records the caller-supplied printing and finish', async () => {
    queue('user_cards', { data: { id: 9 }, error: null })

    const res = await POST(
      makeRequest({
        oracleId: 'oracle-sol',
        printingId: 'borderless-sol-ring-scryfall-id',
        finish: 'etched',
      })
    )

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toEqual({ created: true, physicalCopyId: 55 })
    expect(mockRpc).toHaveBeenCalledWith('insert_user_copies', {
      p_user_id: 'user-1',
      p_rows: [
        {
          card_id: 9,
          printing_id: 'borderless-sol-ring-scryfall-id',
          finish: 'etched',
          is_proxy: true,
          source_tag: 'manual',
          location_id: null,
        },
      ],
    })
    // The caller named a printing, so no fallback lookup is needed.
    expect(queues.ref_printings ?? []).toHaveLength(0)
  })

  it('records the newest printing when the caller names none (never none)', async () => {
    queue('user_cards', { data: { id: 9 }, error: null })
    queue('ref_printings', { data: { scryfall_id: 'newest-sol-ring' }, error: null })

    const res = await POST(makeRequest({ oracleId: 'oracle-sol' }))

    expect(res.status).toBe(201)
    expect(mockRpc).toHaveBeenCalledWith(
      'insert_user_copies',
      expect.objectContaining({
        p_rows: [
          expect.objectContaining({
            printing_id: 'newest-sol-ring',
            finish: 'nonfoil',
          }),
        ],
      })
    )
  })

  it('returns 404 when no printing can be resolved', async () => {
    queue('user_cards', { data: { id: 9 }, error: null })
    queue('ref_printings', { data: null, error: null })

    const res = await POST(makeRequest({ oracleId: 'oracle-sol' }))

    expect(res.status).toBe(404)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('maps card_not_found to 404', async () => {
    queue('user_cards', { data: { id: 9 }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'card_not_found' } })

    const res = await POST(makeRequest({ oracleId: 'oracle-sol', printingId: 'p-1' }))

    expect(res.status).toBe(404)
  })

  it('returns 500 when the insert RPC fails unexpectedly', async () => {
    queue('user_cards', { data: { id: 9 }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const res = await POST(makeRequest({ oracleId: 'oracle-sol', printingId: 'p-1' }))

    expect(res.status).toBe(500)
  })
})
