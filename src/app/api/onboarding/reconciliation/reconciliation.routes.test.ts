import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUserId = 'user-123'

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(() => Promise.resolve({ id: mockUserId })),
}))

vi.mock('@/lib/import-reconciliation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/import-reconciliation')>(
    '@/lib/import-reconciliation'
  )
  return {
    ...actual,
    getImportReconciliation: vi.fn(),
    setClaimState: vi.fn(),
    setClaimPrinting: vi.fn(),
    setClaimWishlist: vi.fn(),
  }
})

import { GET } from './route'
import { PATCH as patchInstance } from './instance/route'
import { PATCH as patchPrinting } from './instance/printing/route'
import { PATCH as patchWishlist } from './instance/wishlist/route'
import { requireAuth } from '@/lib/auth'
import * as reconciliationLib from '@/lib/import-reconciliation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockView = {
  batchId: null,
  counts: {
    unresolvedTotal: 1,
    unresolvedOwned: 1,
    unresolvedUnowned: 0,
    rowsTotal: 2,
  },
  decks: [],
  rows: [],
}

function makeRequest(method: string, path: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/api/onboarding/reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(reconciliationLib.getImportReconciliation).mockResolvedValue(mockView as any)
    vi.mocked(reconciliationLib.setClaimState).mockResolvedValue(undefined)
    vi.mocked(reconciliationLib.setClaimPrinting).mockResolvedValue({ demoted: false })
    vi.mocked(reconciliationLib.setClaimWishlist).mockResolvedValue(undefined)
  })

  // --- Auth ---

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce(
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await GET(makeRequest('GET', '/api/onboarding/reconciliation'))
    expect(response.status).toBe(401)
  })

  // --- GET ---

  describe('GET', () => {
    it('returns the reconciliation view with defaults', async () => {
      const response = await GET(
        makeRequest('GET', '/api/onboarding/reconciliation?batchId=batch-1')
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual(mockView)
      expect(reconciliationLib.getImportReconciliation).toHaveBeenCalledWith(mockUserId, {
        batchId: 'batch-1',
        includeResolved: false,
      })
    })

    it('honours includeResolved=true', async () => {
      const response = await GET(
        makeRequest('GET', '/api/onboarding/reconciliation?includeResolved=true')
      )
      expect(response.status).toBe(200)
      expect(reconciliationLib.getImportReconciliation).toHaveBeenCalledWith(mockUserId, {
        batchId: null,
        includeResolved: true,
      })
    })

    it('maps unknown RPC errors to 500', async () => {
      vi.mocked(reconciliationLib.getImportReconciliation).mockRejectedValue(
        new Error('database exploded')
      )
      const response = await GET(makeRequest('GET', '/api/onboarding/reconciliation'))
      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toContain('database exploded')
    })
  })

  // --- PATCH instance ---

  describe('PATCH /instance', () => {
    it('sets state and returns the refreshed view', async () => {
      const response = await patchInstance(
        makeRequest('PATCH', '/api/onboarding/reconciliation/instance', {
          claimId: 42,
          state: 'sleeved',
          batchId: 'batch-2',
        })
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.view).toEqual(mockView)
      expect(reconciliationLib.setClaimState).toHaveBeenCalledWith(
        mockUserId,
        42,
        'sleeved'
      )
      expect(reconciliationLib.getImportReconciliation).toHaveBeenCalledWith(mockUserId, {
        batchId: 'batch-2',
        includeResolved: true,
      })
    })

    it('maps legacy "sleeve" to "sleeved"', async () => {
      await patchInstance(
        makeRequest('PATCH', '/api/onboarding/reconciliation/instance', {
          claimId: 7,
          state: 'sleeve',
        })
      )
      expect(reconciliationLib.setClaimState).toHaveBeenCalledWith(mockUserId, 7, 'sleeved')
    })

    it('returns 400 for an invalid state', async () => {
      const response = await patchInstance(
        makeRequest('PATCH', '/api/onboarding/reconciliation/instance', {
          claimId: 1,
          state: 'banana',
        })
      )
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("state must be 'planned', 'sleeved' or 'proxy'")
    })

    it('returns 400 for a missing claimId', async () => {
      const response = await patchInstance(
        makeRequest('PATCH', '/api/onboarding/reconciliation/instance', { state: 'proxy' })
      )
      expect(response.status).toBe(400)
    })

    it('maps sleeve_supply_exhausted to 409', async () => {
      vi.mocked(reconciliationLib.setClaimState).mockRejectedValue(
        new Error('sleeve_supply_exhausted')
      )
      const response = await patchInstance(
        makeRequest('PATCH', '/api/onboarding/reconciliation/instance', {
          claimId: 1,
          state: 'sleeved',
        })
      )
      expect(response.status).toBe(409)
      const data = await response.json()
      expect(data.token).toBe('sleeve_supply_exhausted')
    })

    it('returns 400 for invalid JSON', async () => {
      const request = new NextRequest(
        new URL('/api/onboarding/reconciliation/instance', 'http://localhost:3000'),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: 'not-json',
        }
      )
      const response = await patchInstance(request)
      expect(response.status).toBe(400)
    })
  })

  // --- PATCH printing ---

  describe('PATCH /instance/printing', () => {
    it('sets printing and returns demoted flag', async () => {
      vi.mocked(reconciliationLib.setClaimPrinting).mockResolvedValue({ demoted: true })
      const response = await patchPrinting(
        makeRequest('PATCH', '/api/onboarding/reconciliation/instance/printing', {
          claimId: 10,
          printingId: 'printing-b',
        })
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.demoted).toBe(true)
      expect(reconciliationLib.setClaimPrinting).toHaveBeenCalledWith(
        mockUserId,
        10,
        'printing-b'
      )
    })

    it('accepts null printingId to clear the override', async () => {
      await patchPrinting(
        makeRequest('PATCH', '/api/onboarding/reconciliation/instance/printing', {
          claimId: 11,
          printingId: null,
        })
      )
      expect(reconciliationLib.setClaimPrinting).toHaveBeenCalledWith(mockUserId, 11, null)
    })

    it('maps printing_not_same_card to 422', async () => {
      vi.mocked(reconciliationLib.setClaimPrinting).mockRejectedValue(
        new Error('printing_not_same_card')
      )
      const response = await patchPrinting(
        makeRequest('PATCH', '/api/onboarding/reconciliation/instance/printing', {
          claimId: 1,
          printingId: 'other-card',
        })
      )
      expect(response.status).toBe(422)
      const data = await response.json()
      expect(data.token).toBe('printing_not_same_card')
    })

    it('returns 400 when printingId is neither string nor null', async () => {
      const response = await patchPrinting(
        makeRequest('PATCH', '/api/onboarding/reconciliation/instance/printing', {
          claimId: 1,
          printingId: 123,
        })
      )
      expect(response.status).toBe(400)
    })
  })

  // --- PATCH wishlist ---

  describe('PATCH /instance/wishlist', () => {
    it('sets wishlist and returns the refreshed view', async () => {
      const response = await patchWishlist(
        makeRequest('PATCH', '/api/onboarding/reconciliation/instance/wishlist', {
          claimId: 20,
          wishlisted: false,
        })
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.view).toEqual(mockView)
      expect(reconciliationLib.setClaimWishlist).toHaveBeenCalledWith(mockUserId, 20, false)
    })

    it('returns 400 when wishlisted is not boolean', async () => {
      const response = await patchWishlist(
        makeRequest('PATCH', '/api/onboarding/reconciliation/instance/wishlist', {
          claimId: 1,
          wishlisted: 'maybe',
        })
      )
      expect(response.status).toBe(400)
    })

    it('maps claim_not_found to 404', async () => {
      vi.mocked(reconciliationLib.setClaimWishlist).mockRejectedValue(new Error('claim_not_found'))
      const response = await patchWishlist(
        makeRequest('PATCH', '/api/onboarding/reconciliation/instance/wishlist', {
          claimId: 99,
          wishlisted: true,
        })
      )
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.token).toBe('claim_not_found')
    })
  })
})
