import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockUser = { id: 'user-123', email: 'test@test.com' }
let mockAuthResult: unknown = mockUser

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(() => Promise.resolve(mockAuthResult)),
}))

const mockFetchPhysicalCopyIds = vi.fn()
vi.mock('@/lib/collection-instance-ids', () => ({
  fetchPhysicalCopyIdsForOracleId: (...args: unknown[]) => mockFetchPhysicalCopyIds(...args),
}))

import { GET } from './route'

function callGET(oracleId: string) {
  const request = new NextRequest(
    `http://localhost:3000/api/collection/instances/${oracleId}/ids`
  )
  return GET(request, { params: Promise.resolve({ oracleId }) })
}

describe('GET /api/collection/instances/[oracleId]/ids', () => {
  beforeEach(() => {
    mockAuthResult = mockUser
    mockFetchPhysicalCopyIds.mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthResult = Response.json({ error: 'Unauthorized' }, { status: 401 })

    const res = await callGET('oracle-1')

    expect(res.status).toBe(401)
    expect(mockFetchPhysicalCopyIds).not.toHaveBeenCalled()
  })

  it('returns the real physical copy ids resolved for the oracle_id', async () => {
    mockFetchPhysicalCopyIds.mockResolvedValue([101, 205])

    const res = await callGET('oracle-1')

    expect(res.status).toBe(200)
    expect(mockFetchPhysicalCopyIds).toHaveBeenCalledWith('oracle-1', 'user-123')
    await expect(res.json()).resolves.toEqual({
      oracleId: 'oracle-1',
      physicalCopyIds: [101, 205],
    })
  })

  it('returns an empty list when the card has no copies', async () => {
    mockFetchPhysicalCopyIds.mockResolvedValue([])

    const res = await callGET('oracle-1')

    await expect(res.json()).resolves.toEqual({ oracleId: 'oracle-1', physicalCopyIds: [] })
  })

  it('returns 500 when resolution fails', async () => {
    mockFetchPhysicalCopyIds.mockRejectedValue(new Error('db exploded'))

    const res = await callGET('oracle-1')

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'db exploded' })
  })
})
