import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

const mockRpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
  }),
}))

import { finalizeImportClaims } from '@/lib/import-sleeve-claims'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('finalizeImportClaims', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes through settledCount from the RPC', async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        finalized_count: 1,
        proxied_count: 2,
        released_count: 3,
        left_open_count: 4,
        settled_count: 5,
      },
      error: null,
    })

    const result = await finalizeImportClaims('user-1', 'batch-1')

    expect(result).toEqual({
      finalizedCount: 1,
      proxiedCount: 2,
      releasedCount: 3,
      leftOpenCount: 4,
      settledCount: 5,
    })
    expect(mockRpc).toHaveBeenCalledWith('finalize_import_claims', {
      p_user_id: 'user-1',
      p_batch_id: 'batch-1',
    })
  })

  it('defaults settledCount to 0 when the RPC omits it', async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        finalized_count: 1,
        proxied_count: 0,
        released_count: 0,
        left_open_count: 0,
      },
      error: null,
    })

    const result = await finalizeImportClaims('user-1')

    expect(result.settledCount).toBe(0)
  })

  it('throws when finalized_count is missing', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true },
      error: null,
    })

    await expect(finalizeImportClaims('user-1')).rejects.toThrow(
      'finalize_import_claims returned an invalid finalized_count'
    )
  })
})
