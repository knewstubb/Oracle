import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockRpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({ rpc: mockRpc }),
}))

let mockAuthResult: unknown = { id: 'user-1' }

vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve(mockAuthResult),
}))

import { POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/allocation/add-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/allocation/add-proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthResult = { id: 'user-1' }
    mockRpc.mockResolvedValue({
      data: { success: true, copy_id: 77, deck_card_id: 10 },
      error: null,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuthResult = Response.json({ error: 'Unauthorized' }, { status: 401 })

    const res = await POST(makeRequest({ deckCardsId: 10, cardId: 3 }))

    expect(res.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 400 on invalid JSON', async () => {
    const res = await POST(makeRequest('{ not json'))

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 400 when deckCardsId or cardId is missing', async () => {
    const res = await POST(makeRequest({ deckCardsId: 10 }))

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('creates the proxy through add_proxy_to_slot and returns the copy id', async () => {
    const res = await POST(makeRequest({ deckCardsId: 10, cardId: 3 }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      copyId: 77,
      physicalCopyId: 77,
    })
    expect(mockRpc).toHaveBeenCalledWith('add_proxy_to_slot', {
      p_target_deck_card_id: 10,
      p_card_id: 3,
      p_user_id: 'user-1',
      p_source: 'manual',
    })
  })

  it('still accepts the deprecated cardDefinitionId alias', async () => {
    const res = await POST(makeRequest({ deckCardsId: 10, cardDefinitionId: 3 }))

    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith(
      'add_proxy_to_slot',
      expect.objectContaining({ p_card_id: 3 })
    )
  })

  it('maps target_not_found to 404', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'target_not_found' } })

    const res = await POST(makeRequest({ deckCardsId: 10, cardId: 3 }))

    expect(res.status).toBe(404)
  })

  it('maps target_filled to 409', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'target_filled' } })

    const res = await POST(makeRequest({ deckCardsId: 10, cardId: 3 }))

    expect(res.status).toBe(409)
  })

  it('maps card_not_found to 404', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'card_not_found' } })

    const res = await POST(makeRequest({ deckCardsId: 10, cardId: 3 }))

    expect(res.status).toBe(404)
  })

  it('returns 500 when the RPC returns an invalid result', async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null })

    const res = await POST(makeRequest({ deckCardsId: 10, cardId: 3 }))

    expect(res.status).toBe(500)
  })
})
