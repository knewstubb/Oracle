import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockFetchEnrichedSupply = vi.fn()

vi.mock('@/lib/allocation-candidates', () => ({
  fetchEnrichedSupply: (...args: unknown[]) => mockFetchEnrichedSupply(...args),
}))

const mockFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))

let mockAuthResult: unknown = { id: 'user-1' }

vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve(mockAuthResult),
}))

import { GET, type CardActionContext } from './route'

function makeRequest(deckId: string, cardName: string): NextRequest {
  return new NextRequest(`http://localhost/api/decks/${deckId}/card-actions/${encodeURIComponent(cardName)}`)
}

function mockUserCardsRow(row: { id: number; oracle_id: string; color_identity: string | null } | null) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'user_cards') {
      return {
        select: () => ({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }
    }
    if (table === 'decks') {
      return {
        select: () => ({
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          then: async (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data: [], error: null }),
        }),
      }
    }
    if (table === 'ref_printings') {
      return {
        select: () => ({
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }
    }
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
  })
}

function mockRefPrintingsForCardName(cardName: string, result: { oracle_id: string; color_identity: string[] | null } | null) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'user_cards') {
      return {
        select: () => ({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }
    }
    if (table === 'decks') {
      return {
        select: () => ({
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          then: async (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data: [], error: null }),
        }),
      }
    }
    if (table === 'ref_printings') {
      return {
        select: () => ({
          eq: vi.fn().mockImplementation((column: string, value: unknown) => {
            // We only want to return the result when the name matches; otherwise null.
            if (column === 'name' && value === cardName) {
              return {
                limit: vi.fn().mockReturnThis(),
                maybeSingle: async () => ({ data: result, error: null }),
              }
            }
            return {
              limit: vi.fn().mockReturnThis(),
              maybeSingle: async () => ({ data: null, error: null }),
            }
          }),
        }),
      }
    }
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
  })
}

describe('GET /api/decks/[id]/card-actions/[cardName]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthResult = { id: 'user-1' }
    mockFetchEnrichedSupply.mockResolvedValue([])
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuthResult = Response.json({ error: 'Unauthorized' }, { status: 401 })

    const res = await GET(makeRequest('1', 'Sol Ring'), { params: Promise.resolve({ id: '1', cardName: 'Sol Ring' }) })

    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid deck id', async () => {
    const res = await GET(makeRequest('abc', 'Sol Ring'), { params: Promise.resolve({ id: 'abc', cardName: 'Sol Ring' }) })

    expect(res.status).toBe(400)
  })

  it('returns cardDefinitionId and oracleId for an owned card', async () => {
    mockUserCardsRow({ id: 5, oracle_id: 'oracle-owned', color_identity: 'W,U' })

    const res = await GET(makeRequest('1', 'Sol Ring'), { params: Promise.resolve({ id: '1', cardName: 'Sol Ring' }) })

    expect(res.status).toBe(200)
    const json = (await res.json()) as CardActionContext
    expect(json.cardDefinitionId).toBe(5)
    expect(json.oracleId).toBe('oracle-owned')
    expect(json.cardName).toBe('Sol Ring')
  })

  it('returns oracleId for an unowned card so the Add proxy button can enable', async () => {
    mockRefPrintingsForCardName('Sol Ring', { oracle_id: 'oracle-sol-ring', color_identity: [] })

    const res = await GET(makeRequest('1', 'Sol Ring'), { params: Promise.resolve({ id: '1', cardName: 'Sol Ring' }) })

    expect(res.status).toBe(200)
    const json = (await res.json()) as CardActionContext
    expect(json.cardDefinitionId).toBeNull()
    expect(json.oracleId).toBe('oracle-sol-ring')
    expect(json.cardName).toBe('Sol Ring')
  })

  it('falls back to the front face for double-faced cards not found by full name', async () => {
    mockRefPrintingsForCardName('Delver of Secrets // Insectile Aberration', {
      oracle_id: 'oracle-delver',
      color_identity: ['U'],
    })

    const res = await GET(makeRequest('1', 'Delver of Secrets // Insectile Aberration'), {
      params: Promise.resolve({ id: '1', cardName: 'Delver of Secrets // Insectile Aberration' }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as CardActionContext
    expect(json.cardDefinitionId).toBeNull()
    expect(json.oracleId).toBe('oracle-delver')
  })
})
