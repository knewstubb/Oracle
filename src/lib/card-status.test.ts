import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classifySlotStatus, computeUnresolvedStatuses, computeDeckCardStatuses } from './card-status'

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  createAdminClient: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase'

// Helper to build a mock Supabase query chain
function mockSupabaseChain(data: any[] | null, error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: data?.[0] ?? null, error }),
  }
  // Final resolution
  chain.then = (resolve: any) => resolve({ data, error })
  // Make it thenable for await
  Object.defineProperty(chain, Symbol.toStringTag, { value: 'Promise' })
  return chain
}

describe('classifySlotStatus', () => {
  it('returns "original" for resolved non-proxy copy', () => {
    expect(classifySlotStatus(42, false)).toBe('original')
  })

  it('returns "proxy" for resolved proxy copy', () => {
    expect(classifySlotStatus(42, true)).toBe('proxy')
  })

  it('returns "unallocated" as default for unresolved slot', () => {
    expect(classifySlotStatus(null, null)).toBe('unallocated')
  })
})

describe('computeUnresolvedStatuses', () => {
  let mockFrom: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom = vi.fn()
    ;(createAdminClient as any).mockReturnValue({ from: mockFrom })
  })

  it('returns empty map for empty input', async () => {
    const result = await computeUnresolvedStatuses([], 'user-1')
    expect(result.size).toBe(0)
  })

  it('returns "unowned" when card has no card_definition', async () => {
    // Step 1: card_definitions query returns nothing
    mockFrom.mockImplementation((table: string) => {
      if (table === 'card_definitions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
      return mockSupabaseChain([])
    })

    const result = await computeUnresolvedStatuses(['Nonexistent Card'], 'user-1')
    expect(result.get('Nonexistent Card')).toBe('unowned')
  })

  it('returns "unallocated" when a free non-missing copy exists', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'card_definitions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 1, card_name: 'Sol Ring' }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'physical_copies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [
                    { card_definition_id: 1, deck_cards: [] }, // free copy (no deck link)
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return mockSupabaseChain([])
    })

    const result = await computeUnresolvedStatuses(['Sol Ring'], 'user-1')
    expect(result.get('Sol Ring')).toBe('unallocated')
  })

  it('returns "claimed" when all copies are held by other decks', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'card_definitions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 1, card_name: 'Rhystic Study' }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'physical_copies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [
                    { card_definition_id: 1, deck_cards: [{ id: 99 }] }, // held by another deck
                    { card_definition_id: 1, deck_cards: [{ id: 100 }] }, // also held
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return mockSupabaseChain([])
    })

    const result = await computeUnresolvedStatuses(['Rhystic Study'], 'user-1')
    expect(result.get('Rhystic Study')).toBe('claimed')
  })

  it('returns "unallocated" when one of multiple copies is free', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'card_definitions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 1, card_name: 'Sol Ring' }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'physical_copies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [
                    { card_definition_id: 1, deck_cards: [{ id: 99 }] }, // held
                    { card_definition_id: 1, deck_cards: [{ id: 100 }] }, // held
                    { card_definition_id: 1, deck_cards: [] }, // FREE — this one makes it unallocated
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return mockSupabaseChain([])
    })

    const result = await computeUnresolvedStatuses(['Sol Ring'], 'user-1')
    expect(result.get('Sol Ring')).toBe('unallocated')
  })

  it('returns "unowned" when only missing copies exist (excluded by query)', async () => {
    // The query filters missing=false, so missing copies don't appear in results
    mockFrom.mockImplementation((table: string) => {
      if (table === 'card_definitions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 1, card_name: 'Lost Card' }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'physical_copies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [], // empty — all copies are missing=true, filtered out
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return mockSupabaseChain([])
    })

    const result = await computeUnresolvedStatuses(['Lost Card'], 'user-1')
    expect(result.get('Lost Card')).toBe('unowned')
  })

  it('returns "claimed" when 1 copy held and 1 copy is missing', async () => {
    // Missing copy excluded by query, held copy returned
    mockFrom.mockImplementation((table: string) => {
      if (table === 'card_definitions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 1, card_name: 'Gitrog Monster' }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'physical_copies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [
                    // Only the held copy appears (missing copy filtered out by query)
                    { card_definition_id: 1, deck_cards: [{ id: 50 }] },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return mockSupabaseChain([])
    })

    const result = await computeUnresolvedStatuses(['Gitrog Monster'], 'user-1')
    expect(result.get('Gitrog Monster')).toBe('claimed')
  })

  it('handles multiple cards with mixed statuses', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'card_definitions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: 1, card_name: 'Free Card' },
                  { id: 2, card_name: 'Claimed Card' },
                  // 'Missing Card' has no def → unowned
                ],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'physical_copies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [
                    { card_definition_id: 1, deck_cards: [] }, // free
                    { card_definition_id: 2, deck_cards: [{ id: 77 }] }, // held
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return mockSupabaseChain([])
    })

    const result = await computeUnresolvedStatuses(
      ['Free Card', 'Claimed Card', 'Missing Card'],
      'user-1'
    )
    expect(result.get('Free Card')).toBe('unallocated')
    expect(result.get('Claimed Card')).toBe('claimed')
    expect(result.get('Missing Card')).toBe('unowned')
  })
})

describe('computeDeckCardStatuses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockFrom = vi.fn()
    ;(createAdminClient as any).mockReturnValue({ from: mockFrom })

    // Default: no physical copies found (all unresolved → unowned)
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }))
  })

  it('classifies resolved cards as "original" or "proxy"', async () => {
    const cards = [
      { id: 1, card_name: 'Sol Ring', physical_copy_id: 10, is_proxy: false },
      { id: 2, card_name: 'Mana Crypt', physical_copy_id: 11, is_proxy: true },
    ]

    const result = await computeDeckCardStatuses(cards, 'user-1')
    expect(result[0].status).toBe('original')
    expect(result[1].status).toBe('proxy')
  })

  it('classifies basic lands as "generic_land"', async () => {
    const cards = [
      { id: 1, card_name: 'Forest', physical_copy_id: null, is_proxy: null },
      { id: 2, card_name: 'Island', physical_copy_id: null, is_proxy: null },
    ]

    const result = await computeDeckCardStatuses(cards, 'user-1')
    expect(result[0].status).toBe('generic_land')
    expect(result[1].status).toBe('generic_land')
  })

  it('classifies basic land with assigned copy through normal taxonomy', async () => {
    const cards = [
      { id: 1, card_name: 'Forest', physical_copy_id: 99, is_proxy: false },
    ]

    const result = await computeDeckCardStatuses(cards, 'user-1')
    expect(result[0].status).toBe('original')
  })
})
