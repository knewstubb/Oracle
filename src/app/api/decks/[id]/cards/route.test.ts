import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  owned: new Map<string, string>(),
  deck: { id: 1, user_id: 'test-user-id' } as unknown,
  cardMeta: null as unknown,
  inserted: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve({ id: 'test-user-id', email: 'test@example.com' }),
}))

vi.mock('@/lib/card-data', () => ({
  getOwnedPrintingsByNames: vi.fn(async () => h.owned),
}))

vi.mock('@/lib/deck-versions', () => ({
  getDeckCardCount: vi.fn(async () => 1),
  checkMilestoneCrossed: vi.fn(() => null),
  createVersionSnapshot: vi.fn(async () => ({})),
}))

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'decks') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: h.deck, error: null }) }),
          }),
        }
      }
      if (table === 'ref_cards') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: h.cardMeta, error: null }) }),
          }),
        }
      }
      if (table === 'deck_cards') {
        return {
          insert: (row: Record<string, unknown>) => {
            h.inserted = row
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 42, card_name: row.card_name },
                  error: null,
                }),
              }),
            }
          },
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  }),
}))

import { POST } from './route'

function callPost(body: Record<string, unknown>) {
  const request = new NextRequest('http://localhost/api/decks/1/cards', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
  return POST(request, { params: Promise.resolve({ id: '1' }) })
}

describe('POST /api/decks/[id]/cards', () => {
  beforeEach(() => {
    h.owned = new Map<string, string>()
    h.deck = { id: 1, user_id: 'test-user-id' }
    h.cardMeta = null
    h.inserted = null
    vi.restoreAllMocks()
  })

  it('requires a card name', async () => {
    const response = await callPost({})
    expect(response.status).toBe(400)
  })

  it('stores the printing the owner already owns', async () => {
    h.owned.set('Sol Ring', 'owned-printing-id')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const response = await callPost({ cardName: 'Sol Ring' })
    expect(response.status).toBe(200)
    expect(h.inserted?.scryfall_id).toBe('owned-printing-id')
    // Owned printing path must not fall back to the Scryfall name lookup.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to the default printing by name when nothing is owned', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'default-printing-id', type_line: 'Artifact' }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const response = await callPost({ cardName: 'Sol Ring' })
    expect(response.status).toBe(200)
    expect(h.inserted?.scryfall_id).toBe('default-printing-id')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/cards/named?exact=Sol%20Ring')
  })

  it('still stores the card when the default lookup fails', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchSpy)

    const response = await callPost({ cardName: 'Sol Ring' })
    expect(response.status).toBe(200)
    expect(h.inserted?.card_name).toBe('Sol Ring')
    expect(h.inserted?.scryfall_id).toBeNull()
  })
})
