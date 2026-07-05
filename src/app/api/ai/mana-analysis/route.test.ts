import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase client
const mockFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: mockFrom,
  }),
}))

vi.mock('@/lib/mcp-client', () => ({
  suggestManaBase: vi.fn(),
}))

import { POST } from './route'
import { suggestManaBase } from '@/lib/mcp-client'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/ai/mana-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

function setupSupabaseMock(options: {
  deck?: Record<string, unknown> | null
  cards?: Record<string, unknown>[]
  collection?: { card_name: string; quantity: number }[]
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'decks') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: options.deck ?? null,
              error: options.deck ? null : { message: 'Not found' },
            }),
          }),
        }),
      }
    }
    if (table === 'deck_cards') {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: options.cards ?? [], error: null }),
        }),
      }
    }
    if (table === 'collection') {
      return {
        select: () => Promise.resolve({ data: options.collection ?? [], error: null }),
      }
    }
    return { select: () => Promise.resolve({ data: [], error: null }) }
  })
}

describe('POST /api/ai/mana-analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for missing deckId', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Invalid deck ID')
  })

  it('returns 404 when deck not found', async () => {
    setupSupabaseMock({ deck: null })

    const res = await POST(makeRequest({ deckId: 999 }))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Deck not found')
  })

  it('returns mana analysis with land count and suggestions on success', async () => {
    setupSupabaseMock({
      deck: { id: 1, name: 'Test Deck', commander_name: 'Muldrotha, the Gravetide', colour_identity: 'B,U,G' },
      cards: [
        { card_name: 'Forest', scryfall_id: 'a1', set_code: 'c21', categories: 'Lands', is_commander: false },
        { card_name: 'Island', scryfall_id: 'a2', set_code: 'c21', categories: 'Lands', is_commander: false },
        { card_name: 'Swamp', scryfall_id: 'a3', set_code: 'c21', categories: 'Lands', is_commander: false },
        { card_name: 'Sol Ring', scryfall_id: 'a4', set_code: 'c21', categories: 'Artifacts', is_commander: false },
      ],
      collection: [{ card_name: 'Breeding Pool', quantity: 1 }],
    })

    ;(suggestManaBase as ReturnType<typeof vi.fn>).mockResolvedValue({
      lands: [
        { name: 'Breeding Pool', reason: 'Dual land for U/G coverage' },
        { name: 'Watery Grave', reason: 'Dual land for U/B coverage' },
      ],
      raw: '',
    })

    const res = await POST(makeRequest({ deckId: 1 }))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.landCount).toBe(3)
    expect(data.suggestions).toHaveLength(2)
    expect(data.suggestions[0].suggested).toBe('Breeding Pool')
    expect(data.suggestions[0].owned).toBe(true)
    expect(data.suggestions[1].suggested).toBe('Watery Grave')
    expect(data.suggestions[1].owned).toBe(false)
  })

  it('returns 500 when MCP call fails', async () => {
    setupSupabaseMock({
      deck: { id: 1, name: 'Test Deck', commander_name: 'Muldrotha', colour_identity: 'B,U,G' },
      cards: [{ card_name: 'Forest', scryfall_id: 'a1', set_code: 'c21', categories: 'Lands', is_commander: false }],
      collection: [],
    })

    ;(suggestManaBase as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('MCP timeout'))

    const res = await POST(makeRequest({ deckId: 1 }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('MCP timeout')
  })
})
