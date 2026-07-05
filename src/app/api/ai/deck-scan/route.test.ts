import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase client with chainable interface
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}))

vi.mock('@/lib/mcp-client', () => ({
  deckAnalysis: vi.fn(),
  commanderOverview: vi.fn(),
}))

import { POST } from './route'
import { deckAnalysis, commanderOverview } from '@/lib/mcp-client'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/ai/deck-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

function setupSupabaseMock(options: {
  deck?: Record<string, unknown> | null
  cards?: Record<string, unknown>[]
  strategy?: Record<string, unknown> | null
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'decks') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: options.deck ?? null, error: options.deck ? null : { message: 'Not found' } }),
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
    if (table === 'deck_strategy') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: options.strategy ?? null, error: null }),
          }),
        }),
      }
    }
    return {
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }
  })
}

describe('POST /api/ai/deck-scan', () => {
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

  it('returns analysis result on success', async () => {
    setupSupabaseMock({
      deck: { id: 1, name: 'Test Deck', commander_name: 'Muldrotha, the Gravetide' },
      cards: [
        { card_name: 'Sol Ring', is_commander: false },
        { card_name: 'Muldrotha, the Gravetide', is_commander: true },
      ],
      strategy: null,
    })

    const mockAnalysis = {
      combos: [{ cards: ['Sol Ring'], result: 'Fast mana' }],
      strengths: ['Good ramp'],
      weaknesses: ['Slow'],
      bracket: 'Mid',
      manaCurve: { '0': 5 },
      averageCmc: 3.2,
      raw: '## Strategy\nGraveyard recursion deck.',
    }

    const mockOverview = {
      combos: [{ cards: ['Sol Ring'], result: 'Fast mana' }],
      oracleText: 'Cast permanents from graveyard',
    }

    ;(deckAnalysis as ReturnType<typeof vi.fn>).mockResolvedValue(mockAnalysis)
    ;(commanderOverview as ReturnType<typeof vi.fn>).mockResolvedValue(mockOverview)

    const res = await POST(makeRequest({ deckId: 1 }))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.strategy).toBeTruthy()
    expect(data.commanderName).toBe('Muldrotha, the Gravetide')
  })

  it('returns 500 when deck analysis fails', async () => {
    setupSupabaseMock({
      deck: { id: 1, name: 'Test Deck', commander_name: 'Muldrotha' },
      cards: [{ card_name: 'Sol Ring', is_commander: false }],
      strategy: null,
    })

    ;(deckAnalysis as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('MCP timeout'))
    ;(commanderOverview as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('MCP timeout'))

    const res = await POST(makeRequest({ deckId: 1 }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('MCP timeout')
  })
})
