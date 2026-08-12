/**
 * Tests for PATCH /api/collection/assign-location
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.5
 * - Assigns location_id to a collection copy
 * - Clears location_id when null is provided
 * - Returns 400 for missing copyId
 * - Returns 404 if copy doesn't belong to user
 * - Returns 404 if location doesn't belong to user
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
  copy: any | null
  location: any | null
  updateError: any | null
} = {
  copy: null,
  location: null,
  updateError: null,
}

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => createMockSupabase(),
}))

function createMockSupabase() {
  return {
    from: (table: string) => {
      if (table === 'collection') {
        return {
          select: () => ({
            eq: (_col: string, _val: any) => ({
              eq: (_col2: string, _val2: any) => ({
                maybeSingle: () => Promise.resolve({ data: mockDbState.copy, error: null }),
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
      if (table === 'locations') {
        return {
          select: () => ({
            eq: (_col: string, _val: any) => ({
              eq: (_col2: string, _val2: any) => ({
                maybeSingle: () => Promise.resolve({ data: mockDbState.location, error: null }),
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
      copy: { id: 42, user_id: 'user-123' },
      location: { id: 1 },
      updateError: null,
    }
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthResult = Response.json({ error: 'Unauthorized' }, { status: 401 })
    // Support both old and new field names in request
    const res = await PATCH(makePatchRequest({ copyId: 42, locationId: 1 }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when copyId is missing', async () => {
    const res = await PATCH(makePatchRequest({ locationId: 1 }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/copyId|physicalCopyId/i)
  })

  it('returns 400 when copyId is not a number', async () => {
    const res = await PATCH(makePatchRequest({ copyId: 'abc', locationId: 1 }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when copy not found for user', async () => {
    mockDbState.copy = null
    const res = await PATCH(makePatchRequest({ copyId: 999, locationId: 1 }))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toMatch(/copy not found/i)
  })

  it('returns 404 when location not found for user', async () => {
    mockDbState.location = null
    const res = await PATCH(makePatchRequest({ copyId: 42, locationId: 999 }))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toMatch(/location not found/i)
  })

  it('assigns a location successfully', async () => {
    const res = await PATCH(makePatchRequest({ copyId: 42, locationId: 1 }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.updated).toBe(1)
    expect(data.copyId).toBe(42)
    expect(data.locationId).toBe(1)
  })

  it('clears location when null is provided', async () => {
    const res = await PATCH(makePatchRequest({ copyId: 42, locationId: null }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.updated).toBe(1)
    expect(data.locationId).toBeNull()
  })

  it('returns 500 when database update fails', async () => {
    mockDbState.updateError = { message: 'DB connection error' }
    const res = await PATCH(makePatchRequest({ copyId: 42, locationId: 1 }))
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
