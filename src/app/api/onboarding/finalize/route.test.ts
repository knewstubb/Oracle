import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUserId = 'user-123'

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(() => Promise.resolve({ id: mockUserId })),
}))

const mockFinalize = vi.fn()

vi.mock('@/lib/import-sleeve-claims', () => ({
  finalizeImportClaims: (...args: unknown[]) => mockFinalize(...args),
}))

import { POST } from './route'
import { requireAuth } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('/api/onboarding/finalize', 'http://localhost:3000'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/onboarding/finalize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFinalize.mockResolvedValue({
      finalizedCount: 2,
      proxiedCount: 1,
      releasedCount: 3,
      leftOpenCount: 0,
      settledCount: 4,
    })
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce(
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await POST(makeRequest())
    expect(response.status).toBe(401)
  })

  it('passes through all counts including settledCount', async () => {
    const response = await POST(makeRequest({ batchId: 'batch-1' }))
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toEqual({
      success: true,
      finalizedCount: 2,
      proxiedCount: 1,
      releasedCount: 3,
      leftOpenCount: 0,
      settledCount: 4,
    })
    expect(mockFinalize).toHaveBeenCalledWith(mockUserId, 'batch-1')
  })

  it('falls back to null batchId when body is empty', async () => {
    const response = await POST(makeRequest())
    expect(response.status).toBe(200)
    expect(mockFinalize).toHaveBeenCalledWith(mockUserId, null)
  })

  it('falls back to null batchId for invalid JSON', async () => {
    const request = new NextRequest(
      new URL('/api/onboarding/finalize', 'http://localhost:3000'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }
    )
    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(mockFinalize).toHaveBeenCalledWith(mockUserId, null)
  })

  it('returns 500 when finalize throws', async () => {
    mockFinalize.mockRejectedValue(new Error('RPC failed'))
    const response = await POST(makeRequest())
    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toContain('RPC failed')
  })
})
