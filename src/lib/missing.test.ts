import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markCopyMissing, unmarkCopyMissing } from './missing'

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

  it('returns affected deck IDs from the atomic RPC', async () => {
    const result = await markCopyMissing(42, 'user-1')
    expect(result.affectedDeckIds).toEqual([5])
    expect(mockRpc).toHaveBeenCalledWith('mark_copy_missing', {
      p_copy_id: 42,
      p_user_id: 'user-1',
    })
  })

  it('returns an empty affected-deck list when the RPC reports no links', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, affected_deck_ids: [] },
      error: null,
    })

    await expect(markCopyMissing(42, 'user-1')).resolves.toEqual({ affectedDeckIds: [] })
  })

  it('rejects malformed RPC results', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, affected_deck_ids: ['not-an-id'] },
      error: null,
    })

    await expect(markCopyMissing(42, 'user-1')).rejects.toThrow(
      'mark_copy_missing returned an invalid affected_deck_ids'
    )
  })

  it('throws on RPC failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    await expect(markCopyMissing(42, 'user-1')).rejects.toThrow(
      'Failed to mark copy 42 as missing: DB error'
    )
  })
})

describe('unmarkCopyMissing', () => {
  let mockRpc: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc = vi.fn().mockResolvedValue({
      data: {
        success: true,
        already_found: false,
        card_name: 'Sol Ring',
        location_id: 7,
      },
      error: null,
    })
    ;(createAdminClient as any).mockReturnValue({ rpc: mockRpc })
  })

  it('calls the atomic found RPC and returns the card name', async () => {
    const result = await unmarkCopyMissing(42, 'user-1')
    expect(result).toEqual({ cardName: 'Sol Ring' })
    expect(mockRpc).toHaveBeenCalledWith('unmark_copy_missing', {
      p_copy_id: 42,
      p_user_id: 'user-1',
    })
  })

  it('accepts the idempotent already-found result', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, already_found: true, card_name: 'Sol Ring', location_id: 7 },
      error: null,
    })

    await expect(unmarkCopyMissing(42, 'user-1')).resolves.toEqual({ cardName: 'Sol Ring' })
  })

  it('rejects a malformed found result', async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null })
    await expect(unmarkCopyMissing(42, 'user-1')).rejects.toThrow(
      'Failed to un-mark copy 42: invalid card_name'
    )
  })

  it('maps not-found RPC errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'copy_not_found' } })
    await expect(unmarkCopyMissing(999, 'user-1')).rejects.toThrow('Copy 999 not found for user')
  })
})
