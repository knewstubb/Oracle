import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockRpc = vi.fn()

let slotQueryResult: { id: number; card_name: string; scryfall_id: string | null; requested_finish: string | null } | null = null
let copyIdQueryResult: number | null = null

const mockFrom = vi.fn((table: string) => {
  if (table !== 'deck_cards') {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }
  }
  return {
    select: (columns: string) => ({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: async () => {
        if (columns.includes('copy_id')) {
          return { data: copyIdQueryResult ? { copy_id: copyIdQueryResult } : null, error: null }
        }
        return { data: slotQueryResult, error: null }
      },
    }),
  }
})

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({ rpc: mockRpc, from: mockFrom }),
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
    slotQueryResult = null
    copyIdQueryResult = null
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

  it('returns 400 when deckCardsId is missing', async () => {
    const res = await POST(makeRequest({ cardId: 3 }))

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

  describe('unowned card path (no cardId)', () => {
    beforeEach(() => {
      mockRpc.mockResolvedValue({
        data: { success: true, created_count: 1 },
        error: null,
      })
    })

    it('resolves the slot and calls add_proxies_to_slots, then returns the new copy id', async () => {
      slotQueryResult = { id: 10, card_name: 'Sol Ring', scryfall_id: 'slot-printing', requested_finish: 'foil' }
      copyIdQueryResult = 99

      const res = await POST(makeRequest({ deckCardsId: 10 }))

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({
        success: true,
        copyId: 99,
        physicalCopyId: 99,
      })
      expect(mockRpc).toHaveBeenCalledWith('add_proxies_to_slots', {
        p_user_id: 'user-1',
        p_assignments: [
          {
            deck_card_id: 10,
            card_name: 'Sol Ring',
            printing_id: 'slot-printing',
            finish: 'foil',
          },
        ],
        p_source: 'manual',
      })
    })

    it('returns 404 when the deck card slot does not exist', async () => {
      slotQueryResult = null

      const res = await POST(makeRequest({ deckCardsId: 10 }))

      expect(res.status).toBe(404)
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('maps target_filled from add_proxies_to_slots to 409', async () => {
      slotQueryResult = { id: 10, card_name: 'Sol Ring', scryfall_id: null, requested_finish: null }
      mockRpc.mockResolvedValue({ data: null, error: { message: 'target_filled' } })

      const res = await POST(makeRequest({ deckCardsId: 10 }))

      expect(res.status).toBe(409)
    })

    it('maps card_printing_not_found from add_proxies_to_slots to 404', async () => {
      slotQueryResult = { id: 10, card_name: 'Unknown Card', scryfall_id: null, requested_finish: null }
      mockRpc.mockResolvedValue({ data: null, error: { message: 'card_printing_not_found' } })

      const res = await POST(makeRequest({ deckCardsId: 10 }))

      expect(res.status).toBe(404)
    })

    it('returns 500 if the copy id cannot be read back after creation', async () => {
      slotQueryResult = { id: 10, card_name: 'Sol Ring', scryfall_id: null, requested_finish: null }
      copyIdQueryResult = null

      const res = await POST(makeRequest({ deckCardsId: 10 }))

      expect(res.status).toBe(500)
    })
  })
})
