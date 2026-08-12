import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markCopyMissing, unmarkCopyMissing } from './missing'

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  createAdminClient: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase'

describe('markCopyMissing', () => {
  let mockRpc: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockRpc = vi.fn().mockResolvedValue({
      data: { success: true, affected_deck_ids: [5] },
      error: null,
    })

    ;(createAdminClient as any).mockReturnValue({ rpc: mockRpc })
  })

  it('sets missing=true and returns affected deck IDs', async () => {
    const result = await markCopyMissing(42, 'user-1')
    expect(result.affectedDeckIds).toContain(5)
    expect(mockRpc).toHaveBeenCalledWith('mark_copy_missing', {
      p_copy_id: 42,
      p_user_id: 'user-1',
    })
  })

  it('returns empty affectedDeckIds when no deck_cards link exists', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, affected_deck_ids: [] },
      error: null,
    })

    const result = await markCopyMissing(42, 'user-1')
    expect(result.affectedDeckIds).toEqual([])
  })

  it('throws on RPC failure', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'DB error' },
    })

    await expect(markCopyMissing(42, 'user-1')).rejects.toThrow('Failed to mark copy 42 as missing: DB error')
  })

  it('throws on not_found error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'not_found' },
    })

    await expect(markCopyMissing(42, 'user-1')).rejects.toThrow('Copy 42 not found for user')
  })
})

describe('unmarkCopyMissing', () => {
  let mockFrom: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'collection') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { card_id: 1, cards: { card_name: 'Sol Ring' } },
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
    expect(mockFrom).toHaveBeenCalledWith('collection')
  })

  it('returns null cardName when copy not found', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'collection') {
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

  it('throws on fetch error', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'collection') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Connection error' },
                }),
              }),
            }),
          }),
        }
      }
      return {}
    })

    await expect(unmarkCopyMissing(42, 'user-1')).rejects.toThrow('Failed to fetch copy 42: Connection error')
  })

  it('throws on update error', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'collection') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { card_id: 1, cards: { card_name: 'Sol Ring' } },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
            }),
          }),
        }
      }
      return {}
    })

    await expect(unmarkCopyMissing(42, 'user-1')).rejects.toThrow('Failed to un-mark copy 42: Update failed')
  })
})
