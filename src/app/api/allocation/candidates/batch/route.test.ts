import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/allocation-candidates', () => ({
  getBatchRankedCandidates: vi.fn(),
}))

import { POST } from './route'
import { requireAuth } from '@/lib/auth'
import { getBatchRankedCandidates } from '@/lib/allocation-candidates'

const mockedRequireAuth = vi.mocked(requireAuth)
const mockedGetBatch = vi.mocked(getBatchRankedCandidates)

function makeRequest(body: string) {
  return new NextRequest('http://localhost/api/allocation/candidates/batch', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  })
}

const tierOneCandidate = {
  entry: {
    physicalCopyId: 42,
    cardId: 7,
    printingId: 'abc-123',
    finish: 'nonfoil',
    isProxy: false,
    condition: 'near_mint',
    locationId: 3,
    locationName: 'Trade binder',
    assignedTo: null,
  },
  tier: 1 as const,
  tierLabel: 'Free original in storage',
  withinTierScore: 2,
  autoSelectable: true,
}

describe('POST /api/allocation/candidates/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRequireAuth.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockedRequireAuth.mockResolvedValue(
      Response.json({ error: 'Unauthorized' }, { status: 401 }) as never
    )

    const res = await POST(makeRequest(JSON.stringify({ cardNames: ['Sol Ring'] })))

    expect(res.status).toBe(401)
    expect(mockedGetBatch).not.toHaveBeenCalled()
  })

  it('returns 400 on invalid JSON body', async () => {
    const res = await POST(makeRequest('{ not json'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Invalid JSON body',
      code: 'INVALID_BODY',
    })
  })

  it('returns 400 when cardNames is not an array', async () => {
    const res = await POST(makeRequest(JSON.stringify({ cardNames: 'Sol Ring' })))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'cardNames array is required',
      code: 'MISSING_PARAMETER',
    })
  })

  it('returns 400 when cardNames is empty', async () => {
    const res = await POST(makeRequest(JSON.stringify({ cardNames: [] })))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'cardNames cannot be empty',
      code: 'EMPTY_BATCH',
    })
  })

  it('returns ranked candidates keyed by card name', async () => {
    mockedGetBatch.mockResolvedValue(
      new Map([
        ['Sol Ring', [tierOneCandidate]],
        ['Command Tower', []],
      ])
    )

    const res = await POST(
      makeRequest(JSON.stringify({ cardNames: ['Sol Ring', 'Command Tower'] }))
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body.results)).toEqual(['Sol Ring', 'Command Tower'])
    expect(body.results['Sol Ring']).toEqual([tierOneCandidate])
    expect(mockedGetBatch).toHaveBeenCalledWith(
      ['Sol Ring', 'Command Tower'],
      'user-1',
      undefined
    )
  })

  it('passes preferred printing ids through to the compute layer', async () => {
    mockedGetBatch.mockResolvedValue(new Map([['Sol Ring', [tierOneCandidate]]]))

    await POST(
      makeRequest(
        JSON.stringify({
          cardNames: ['Sol Ring'],
          preferredScryfallByName: { 'Sol Ring': 'abc-123' },
        })
      )
    )

    expect(mockedGetBatch).toHaveBeenCalledWith(['Sol Ring'], 'user-1', {
      'Sol Ring': 'abc-123',
    })
  })

  it('returns 500 when the compute layer throws', async () => {
    mockedGetBatch.mockRejectedValue(new Error('db down'))

    const res = await POST(makeRequest(JSON.stringify({ cardNames: ['Sol Ring'] })))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to fetch batch candidates: db down',
      code: 'INTERNAL_ERROR',
    })
  })
})
