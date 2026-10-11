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
    in: () => chain,
    order: () => chain,
    single: () => Promise.resolve(nextResponse(table)),
    maybeSingle: () => Promise.resolve(nextResponse(table)),
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

vi.mock('@/lib/deck-versions', () => ({
  createVersionSnapshot: vi.fn(),
  BULK_CHANGE_THRESHOLD: 5,
}))

let mockAuthResult: unknown = { id: 'user-1' }

vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve(mockAuthResult),
}))

import { POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/decks/5/cards/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function callPost(body: unknown, id = '5') {
  return POST(makeRequest(body), { params: Promise.resolve({ id }) })
}

function queueDeckOk() {
  queue('decks', { data: { id: 5, user_id: 'user-1' }, error: null })
}

describe('POST /api/decks/[id]/cards/bulk — add-proxy', () => {
  beforeEach(() => {
    queues = {}
    vi.clearAllMocks()
    mockAuthResult = { id: 'user-1' }
    mockRpc.mockResolvedValue({
      data: { success: true, created_count: 1 },
      error: null,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuthResult = Response.json({ error: 'Unauthorized' }, { status: 401 })

    const res = await callPost({ operation: 'add-proxy', cardIds: [101] })

    expect(res.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid deck id', async () => {
    const res = await callPost({ operation: 'add-proxy', cardIds: [101] }, 'not-a-number')

    expect(res.status).toBe(400)
  })

  it('returns 400 when operation or cardIds is missing', async () => {
    const res = await callPost({ operation: 'add-proxy', cardIds: [] })

    expect(res.status).toBe(400)
  })

  it('returns 400 for an unknown operation', async () => {
    const res = await callPost({ operation: 'explode', cardIds: [101] })

    expect(res.status).toBe(400)
  })

  it('returns 404 when the deck is not found', async () => {
    queue('decks', { data: null, error: { message: 'not found' } })

    const res = await callPost({ operation: 'add-proxy', cardIds: [101] })

    expect(res.status).toBe(404)
  })

  it('returns 404 when a selected card is not in the deck', async () => {
    queueDeckOk()
    queue('deck_cards', { data: [{ id: 101 }], error: null })

    const res = await callPost({ operation: 'add-proxy', cardIds: [101, 102] })

    expect(res.status).toBe(404)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('does nothing when every selected slot already has a copy', async () => {
    queueDeckOk()
    queue('deck_cards', { data: [{ id: 101 }], error: null })
    queue('deck_cards', {
      data: [{ id: 101, card_name: 'Sol Ring', copy_id: 44, scryfall_id: null, requested_finish: null }],
      error: null,
    })

    const res = await callPost({ operation: 'add-proxy', cardIds: [101] })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      operation: 'add-proxy',
      affected: 0,
      message: 'All selected cards already have copies assigned',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('records the slot\u2019s requested borderless printing and finish (D-038 / D-041)', async () => {
    queueDeckOk()
    queue('deck_cards', { data: [{ id: 101 }], error: null })
    queue('deck_cards', {
      data: [
        {
          id: 101,
          card_name: 'Sol Ring',
          copy_id: null,
          scryfall_id: 'borderless-sol-ring-scryfall-id',
          requested_finish: 'etched',
        },
      ],
      error: null,
    })

    const res = await callPost({ operation: 'add-proxy', cardIds: [101] })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      operation: 'add-proxy',
      affected: 1,
    })
    expect(mockRpc).toHaveBeenCalledWith('add_proxies_to_slots', {
      p_user_id: 'user-1',
      p_assignments: [
        {
          deck_card_id: 101,
          card_name: 'Sol Ring',
          printing_id: 'borderless-sol-ring-scryfall-id',
          finish: 'etched',
        },
      ],
      p_source: 'manual',
    })
  })

  it('passes null printing/finish when the slot names neither, so the RPC defaults', async () => {
    queueDeckOk()
    queue('deck_cards', { data: [{ id: 101 }], error: null })
    queue('deck_cards', {
      data: [{ id: 101, card_name: 'Sol Ring', copy_id: null, scryfall_id: null, requested_finish: null }],
      error: null,
    })

    await callPost({ operation: 'add-proxy', cardIds: [101] })

    expect(mockRpc).toHaveBeenCalledWith(
      'add_proxies_to_slots',
      expect.objectContaining({
        p_assignments: [
          {
            deck_card_id: 101,
            card_name: 'Sol Ring',
            printing_id: null,
            finish: null,
          },
        ],
      })
    )
  })

  it('maps target_filled to 409', async () => {
    queueDeckOk()
    queue('deck_cards', { data: [{ id: 101 }], error: null })
    queue('deck_cards', {
      data: [{ id: 101, card_name: 'Sol Ring', copy_id: null, scryfall_id: null, requested_finish: null }],
      error: null,
    })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'target_filled' } })

    const res = await callPost({ operation: 'add-proxy', cardIds: [101] })

    expect(res.status).toBe(409)
  })

  it('maps card_printing_not_found to 404', async () => {
    queueDeckOk()
    queue('deck_cards', { data: [{ id: 101 }], error: null })
    queue('deck_cards', {
      data: [{ id: 101, card_name: 'Unknown Card', copy_id: null, scryfall_id: null, requested_finish: null }],
      error: null,
    })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'card_printing_not_found' } })

    const res = await callPost({ operation: 'add-proxy', cardIds: [101] })

    expect(res.status).toBe(404)
  })
})
