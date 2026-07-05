import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase client
const mockFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: mockFrom,
  }),
}))

vi.mock('@/lib/mcp-client', () => ({
  buildAround: vi.fn(),
  suggestCuts: vi.fn(),
  commanderOverview: vi.fn(),
}))

import { POST } from './route'
import { buildAround, suggestCuts } from '@/lib/mcp-client'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/ai/recommend', {
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

describe('POST /api/ai/recommend', () => {
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

  it('returns add and cut suggestions on success', async () => {
    setupSupabaseMock({
      deck: { id: 1, name: 'Test Deck', commander_name: 'Muldrotha, the Gravetide' },
      cards: [
        { card_name: 'Sol Ring', scryfall_id: 'abc', set_code: 'c21', is_commander: false },
        { card_name: 'Muldrotha, the Gravetide', scryfall_id: 'def', set_code: 'dom', is_commander: true },
      ],
      collection: [
        { card_name: 'Spore Frog', quantity: 1 },
        { card_name: 'Sol Ring', quantity: 2 },
      ],
    })

    ;(buildAround as ReturnType<typeof vi.fn>).mockResolvedValue({
      cards: [
        { name: 'Spore Frog', manaCost: '{G}', typeLine: 'Creature', role: 'Recursion target' },
        { name: 'Sakura-Tribe Elder', manaCost: '{1}{G}', typeLine: 'Creature', role: 'Ramp' },
      ],
      raw: '',
    })

    ;(suggestCuts as ReturnType<typeof vi.fn>).mockResolvedValue({
      cuts: [{ name: 'Sol Ring', reason: 'Weakest ramp option' }],
      raw: '',
    })

    const res = await POST(makeRequest({ deckId: 1 }))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.adds).toHaveLength(2)
    expect(data.adds[0].name).toBe('Spore Frog')
    expect(data.adds[0].owned).toBe(true)
    expect(data.adds[1].name).toBe('Sakura-Tribe Elder')
    expect(data.adds[1].owned).toBe(false)

    expect(data.cuts).toHaveLength(1)
    expect(data.cuts[0].name).toBe('Sol Ring')
  })

  it('returns 500 when both MCP calls fail', async () => {
    setupSupabaseMock({
      deck: { id: 1, name: 'Test Deck', commander_name: 'Muldrotha' },
      cards: [{ card_name: 'Sol Ring', scryfall_id: 'abc', set_code: 'c21', is_commander: false }],
      collection: [],
    })

    ;(buildAround as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('MCP timeout'))
    ;(suggestCuts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('MCP timeout'))

    const res = await POST(makeRequest({ deckId: 1 }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('MCP timeout')
  })
})
