import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markCopyMissing, unmarkCopyMissing } from './missing'

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  createAdminClient: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase'

describe('markCopyMissing', () => {
  let mockFrom: any
  let mockUpdate: any
  let mockSelect: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        data: [{ id: 101, deck_id: 5 }],
        error: null,
      }),
    })

    mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'physical_copies') {
        return {
          update: mockUpdate,
        }
      }
      if (table === 'deck_cards') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 101, deck_id: 5 }],
              error: null,
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      return {}
    })

    ;(createAdminClient as any).mockReturnValue({ from: mockFrom })
  })

  it('sets missing=true and returns affected deck IDs', async () => {
    const result = await markCopyMissing(42, 'user-1')
    expect(result.affectedDeckIds).toContain(5)
    expect(mockFrom).toHaveBeenCalledWith('physical_copies')
  })

  it('returns empty affectedDeckIds when no deck_cards link exists', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'physical_copies') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }
      }
      if (table === 'deck_cards') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      return {}
    })

    const result = await markCopyMissing(42, 'user-1')
    expect(result.affectedDeckIds).toEqual([])
  })

  it('throws on physical_copies update failure', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'physical_copies') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
            }),
          }),
        }
      }
      return {}
    })

    await expect(markCopyMissing(42, 'user-1')).rejects.toThrow('Failed to mark physical copy')
  })
})

describe('unmarkCopyMissing', () => {
  let mockFrom: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'physical_copies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { card_definition_id: 1, card_definitions: { card_name: 'Sol Ring' } },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }
      }
      return {}
    })

    ;(createAdminClient as any).mockReturnValue({ from: mockFrom })
  })

  it('sets missing=false and returns card name', async () => {
    const result = await unmarkCopyMissing(42, 'user-1')
    expect(result.cardName).toBe('Sol Ring')
  })

  it('returns null cardName when copy not found', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'physical_copies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }
      }
      return {}
    })

    const result = await unmarkCopyMissing(999, 'user-1')
    expect(result.cardName).toBeNull()
  })
})
