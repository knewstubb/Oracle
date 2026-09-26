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

import {
  getImportReconciliation,
  setClaimState,
  setClaimPrinting,
  setClaimWishlist,
  mapReconciliationError,
} from '@/lib/import-reconciliation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockView = {
  batchId: 'batch-1',
  counts: {
    unresolvedTotal: 1,
    unresolvedOwned: 1,
    unresolvedUnowned: 0,
    rowsTotal: 2,
  },
  decks: [],
  rows: [],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('import-reconciliation RPC wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getImportReconciliation', () => {
    it('returns the view payload', async () => {
      mockRpc.mockResolvedValue({ data: { success: true, ...mockView }, error: null })

      const result = await getImportReconciliation('user-1', {
        batchId: 'batch-1',
        includeResolved: true,
      })

      expect(result).toEqual(mockView)
      expect(mockRpc).toHaveBeenCalledWith('get_import_reconciliation', {
        p_user_id: 'user-1',
        p_batch_id: 'batch-1',
        p_include_resolved: true,
      })
    })

    it('defaults includeResolved to false', async () => {
      mockRpc.mockResolvedValue({ data: { success: true, ...mockView }, error: null })
      await getImportReconciliation('user-1')
      expect(mockRpc).toHaveBeenCalledWith('get_import_reconciliation', {
        p_user_id: 'user-1',
        p_batch_id: undefined,
        p_include_resolved: false,
      })
    })

    it('throws when the RPC reports an error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'database exploded' } })
      await expect(getImportReconciliation('user-1')).rejects.toThrow('database exploded')
    })

    it('throws when the payload is not successful', async () => {
      mockRpc.mockResolvedValue({ data: { success: false }, error: null })
      await expect(getImportReconciliation('user-1')).rejects.toThrow(
        'get_import_reconciliation returned an unsuccessful payload'
      )
    })
  })

  describe('setClaimState', () => {
    it('calls the state RPC and returns nothing on success', async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null })
      await setClaimState('user-1', 42, 'sleeved')
      expect(mockRpc).toHaveBeenCalledWith('set_import_claim_state', {
        p_user_id: 'user-1',
        p_claim_id: 42,
        p_state: 'sleeved',
      })
    })

    it('throws with the RPC error message on failure', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'sleeve_supply_exhausted' },
      })
      await expect(setClaimState('user-1', 1, 'sleeved')).rejects.toThrow(
        'sleeve_supply_exhausted'
      )
    })
  })

  describe('setClaimPrinting', () => {
    it('returns demoted=false by default', async () => {
      mockRpc.mockResolvedValue({ data: { success: true, demoted: false }, error: null })
      const result = await setClaimPrinting('user-1', 10, 'printing-b')
      expect(result.demoted).toBe(false)
      expect(mockRpc).toHaveBeenCalledWith('set_import_claim_printing', {
        p_user_id: 'user-1',
        p_claim_id: 10,
        p_printing_id: 'printing-b',
      })
    })

    it('returns demoted=true when the RPC reports a demotion', async () => {
      mockRpc.mockResolvedValue({ data: { success: true, demoted: true }, error: null })
      const result = await setClaimPrinting('user-1', 11, 'printing-b')
      expect(result.demoted).toBe(true)
    })

    it('passes undefined for a null printingId', async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null })
      await setClaimPrinting('user-1', 12, null)
      expect(mockRpc).toHaveBeenCalledWith('set_import_claim_printing', {
        p_user_id: 'user-1',
        p_claim_id: 12,
        p_printing_id: undefined,
      })
    })
  })

  describe('setClaimWishlist', () => {
    it('calls the wishlist RPC', async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null })
      await setClaimWishlist('user-1', 20, false)
      expect(mockRpc).toHaveBeenCalledWith('set_import_claim_wishlist', {
        p_user_id: 'user-1',
        p_claim_id: 20,
        p_wishlisted: false,
      })
    })
  })

  describe('mapReconciliationError', () => {
    it('maps known tokens to their contract status', () => {
      expect(mapReconciliationError(new Error('claim_not_found'))).toMatchObject({
        status: 404,
        token: 'claim_not_found',
      })
      expect(mapReconciliationError(new Error('sleeve_supply_exhausted'))).toMatchObject({
        status: 409,
        token: 'sleeve_supply_exhausted',
      })
      expect(mapReconciliationError(new Error('printing_not_same_card'))).toMatchObject({
        status: 422,
        token: 'printing_not_same_card',
      })
    })

    it('maps unknown errors to 500', () => {
      const mapped = mapReconciliationError(new Error('something else'))
      expect(mapped.status).toBe(500)
      expect(mapped.token).toBeUndefined()
    })
  })
})
