import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase client
const mockFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: mockFrom,
  }),
}))

vi.mock('@/lib/mcp-client', () => ({
  getMcpClient: vi.fn(),
}))

import { POST } from './route'
import { getMcpClient } from '@/lib/mcp-client'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/ai/search', {
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

function setupMcpMock(cards: Record<string, unknown>[]) {
  const mockClient = {
    callTool: vi.fn().mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ cards }) }],
    }),
  }
  ;(getMcpClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient)
  return mockClient
}

describe('POST /api/ai/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for missing query', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Query is required')
  })

  it('returns 400 for empty query', async () => {
    const res = await POST(makeRequest({ query: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns search results with owned flag', async () => {
    setupCollectionMock([{ card_name: 'Sol Ring', quantity: 2 }])
    setupMcpMock([
      { name: 'Sol Ring', mana_cost: '{1}', type_line: 'Legendary Creature - Artifact', oracle_text: 'Tap: Add {C}{C}.' },
      { name: 'Llanowar Elves', mana_cost: '{G}', type_line: 'Legendary Creature - Elf Druid', oracle_text: 'Tap: Add {G}.' },
    ])

    const res = await POST(makeRequest({ query: 'mana ramp artifacts' }))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.cards).toHaveLength(2)
    expect(data.cards[0].name).toBe('Sol Ring')
    expect(data.cards[0].owned).toBe(true)
    expect(data.cards[0].ownedCount).toBe(2)
    expect(data.cards[1].name).toBe('Llanowar Elves')
    expect(data.cards[1].owned).toBe(false)
  })

  it('returns 500 when MCP search fails', async () => {
    const mockClient = {
      callTool: vi.fn().mockRejectedValue(new Error('MCP timeout')),
    }
    ;(getMcpClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient)

    const res = await POST(makeRequest({ query: 'green ramp' }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('MCP timeout')
  })
})
