/**
 * Tests for PATCH /api/collection/assign-location
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.5
 * - Assigns storage_location_id to a physical copy
 * - Clears storage_location_id when null is provided
 * - Returns 400 for missing physicalCopyId
 * - Returns 404 if physical copy doesn't belong to user
 * - Returns 404 if storage location doesn't belong to user
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock setup — must be before imports
// ---------------------------------------------------------------------------

const mockUser = { id: 'user-123', email: 'test@test.com' }
let mockAuthResult: any = mockUser

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(() => Promise.resolve(mockAuthResult)),
}))

// Track supabase calls
let mockDbState: {
  physicalCopy: any | null
  storageLocation: any | null
  updateError: any | null
} = {
  physicalCopy: null,
  storageLocation: null,
  updateError: null,
}

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => createMockSupabase(),
}))

function createMockSupabase() {
  return {
    from: (table: string) => {
      if (table === 'physical_copies') {
        return {
          select: () => ({
            eq: (_col: string, _val: any) => ({
              eq: (_col2: string, _val2: any) => ({
                maybeSingle: () => Promise.resolve({ data: mockDbState.physicalCopy, error: null }),
              }),
            }),
          }),
          update: (_payload: any) => ({
            eq: (_col: string, _val: any) => ({
              eq: (_col2: string, _val2: any) =>
                Promise.resolve({ error: mockDbState.updateError }),
            }),
          }),
        }
      }
      if (table === 'storage_locations') {
        return {
          select: () => ({
            eq: (_col: string, _val: any) => ({
              eq: (_col2: string, _val2: any) => ({
                maybeSingle: () => Promise.resolve({ data: mockDbState.storageLocation, error: null }),
              }),
            }),
          }),
        }
      }
      return {}
    },
  }
}

// ---------------------------------------------------------------------------
// Import route AFTER mocks
// ---------------------------------------------------------------------------

import { PATCH } from './route'
import { NextRequest } from 'next/server'

function makePatchRequest(body: any): NextRequest {
  return new NextRequest('http://localhost/api/collection/assign-location', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /api/collection/assign-location', () => {
  beforeEach(() => {
    mockAuthResult = mockUser
    mockDbState = {
      physicalCopy: { id: 42, user_id: 'user-123' },
      storageLocation: { id: 1 },
      updateError: null,
    }
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthResult = Response.json({ error: 'Unauthorized' }, { status: 401 })
    const res = await PATCH(makePatchRequest({ physicalCopyId: 42, storageLocationId: 1 }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when physicalCopyId is missing', async () => {
    const res = await PATCH(makePatchRequest({ storageLocationId: 1 }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('physicalCopyId')
  })

  it('returns 400 when physicalCopyId is not a number', async () => {
    const res = await PATCH(makePatchRequest({ physicalCopyId: 'abc', storageLocationId: 1 }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when physical copy not found for user', async () => {
    mockDbState.physicalCopy = null
    const res = await PATCH(makePatchRequest({ physicalCopyId: 999, storageLocationId: 1 }))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toContain('Physical copy not found')
  })

  it('returns 404 when storage location not found for user', async () => {
    mockDbState.storageLocation = null
    const res = await PATCH(makePatchRequest({ physicalCopyId: 42, storageLocationId: 999 }))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toContain('Storage location not found')
  })

  it('assigns a storage location successfully', async () => {
    const res = await PATCH(makePatchRequest({ physicalCopyId: 42, storageLocationId: 1 }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.updated).toBe(1)
    expect(data.physicalCopyId).toBe(42)
    expect(data.storageLocationId).toBe(1)
  })

  it('clears storage location when null is provided', async () => {
    const res = await PATCH(makePatchRequest({ physicalCopyId: 42, storageLocationId: null }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.updated).toBe(1)
    expect(data.storageLocationId).toBeNull()
  })

  it('returns 500 when database update fails', async () => {
    mockDbState.updateError = { message: 'DB connection error' }
    const res = await PATCH(makePatchRequest({ physicalCopyId: 42, storageLocationId: 1 }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('DB connection error')
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/collection/assign-location', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{',
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})
