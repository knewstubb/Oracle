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
  suggestManaBase: vi.fn(),
}))

import { POST } from './route'
import { buildAround, suggestManaBase } from '@/lib/mcp-client'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/ai/build-deck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

function setupCollectionMock(rows: { card_name: string; quantity: number }[]) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'collection') {
      return {
        select: () => Promise.resolve({ data: rows, error: null }),
      }
    }
    return { select: () => Promise.resolve({ data: [], error: null }) }
  })
}

describe('POST /api/ai/build-deck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for missing commanderName', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Invalid commander name')
  })

  it('returns 400 for non-string commanderName', async () => {
    const res = await POST(makeRequest({ commanderName: 123 }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Invalid commander name')
  })

  it('returns a deck suggestion with commander, non-lands, and lands', async () => {
    setupCollectionMock([
      { card_name: 'Spore Frog', quantity: 1 },
      { card_name: 'Command Tower', quantity: 2 },
    ])

    const nonLandCards = Array.from({ length: 62 }, (_, i) => ({
      name: `Card ${i + 1}`,
      manaCost: `{${i % 5}}`,
      typeLine: 'Creature',
      role: `Role ${i + 1}`,
    }))

    ;(buildAround as ReturnType<typeof vi.fn>).mockResolvedValue({
      cards: nonLandCards,
      raw: '',
    })

    const landCards = Array.from({ length: 37 }, (_, i) => ({
      name: `Land ${i + 1}`,
      reason: `Mana fixing ${i + 1}`,
    }))

    ;(suggestManaBase as ReturnType<typeof vi.fn>).mockResolvedValue({
      lands: landCards,
      raw: '',
    })

    const res = await POST(
      makeRequest({ commanderName: 'Muldrotha, the Gravetide' }),
    )
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.commander).toBe('Muldrotha, the Gravetide')
    expect(data.totalCards).toBe(99)
    expect(data.cards).toHaveLength(99)
  })

  it('returns 500 when buildAround throws', async () => {
    setupCollectionMock([])

    ;(buildAround as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('MCP server down'),
    )

    const res = await POST(
      makeRequest({ commanderName: 'Muldrotha, the Gravetide' }),
    )
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('MCP server down')
  })
})
