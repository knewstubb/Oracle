/**
 * Tests for POST/PATCH /api/collection/assign-location
 *
 * The route now moves copies to storage through the atomic RPCs
 * `move_copies_to_storage` (POST, bulk) and `move_copy_to_storage` (PATCH,
 * single). A null locationId means "use the user's default storage location".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock setup — must be before imports
// ---------------------------------------------------------------------------

let mockAuthResult: { id: string; email: string } | Response = {
  id: 'user-123',
  email: 'test@test.com',
}

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(() => Promise.resolve(mockAuthResult)),
}))

const mockRpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({ rpc: mockRpc }),
}))

// ---------------------------------------------------------------------------
// Import route AFTER mocks
// ---------------------------------------------------------------------------

import { POST, PATCH } from './route'
import { NextRequest } from 'next/server'

function makeRequest(method: 'POST' | 'PATCH', body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/collection/assign-location', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/collection/assign-location', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthResult = { id: 'user-123', email: 'test@test.com' }
    mockRpc.mockResolvedValue({
      data: { success: true, updated_count: 2, location_id: 1 },
      error: null,
    })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthResult = Response.json({ error: 'Unauthorized' }, { status: 401 })
    const res = await POST(makeRequest('POST', { collectionIds: [42] }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when collectionIds is missing', async () => {
    const res = await POST(makeRequest('POST', { locationId: 1 }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/collectionIds/i)
  })

  it('returns 400 when collectionIds is empty', async () => {
    const res = await POST(makeRequest('POST', { collectionIds: [] }))
    expect(res.status).toBe(400)
  })

  it('moves multiple copies and returns the updated count', async () => {
    const res = await POST(makeRequest('POST', { collectionIds: [42, 43], locationId: 1 }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.updated).toBe(2)
    expect(data.locationId).toBe(1)
    expect(mockRpc).toHaveBeenCalledWith('move_copies_to_storage', {
      p_copy_ids: [42, 43],
      p_location_id: 1,
      p_user_id: 'user-123',
    })
  })

  it('uses the default storage location when locationId is null', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, updated_count: 1, location_id: 7 },
      error: null,
    })
    const res = await POST(makeRequest('POST', { collectionIds: [42], locationId: null }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.locationId).toBe(7)
    expect(mockRpc).toHaveBeenCalledWith(
      'move_copies_to_storage',
      expect.objectContaining({ p_location_id: null })
    )
  })

  it('maps copy_not_found to 404', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'copy_not_found' } })
    const res = await POST(makeRequest('POST', { collectionIds: [999], locationId: 1 }))
    expect(res.status).toBe(404)
  })

  it('maps storage_location_not_found to 404', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'storage_location_not_found' } })
    const res = await POST(makeRequest('POST', { collectionIds: [42], locationId: 999 }))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toMatch(/location not found/i)
  })

  it('maps an unknown RPC error to 500', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'database exploded' } })
    const res = await POST(makeRequest('POST', { collectionIds: [42], locationId: 1 }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('database exploded')
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/collection/assign-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/collection/assign-location', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthResult = { id: 'user-123', email: 'test@test.com' }
    mockRpc.mockResolvedValue({
      data: { success: true, copy_id: 42, location_id: 1 },
      error: null,
    })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthResult = Response.json({ error: 'Unauthorized' }, { status: 401 })
    const res = await PATCH(makeRequest('PATCH', { copyId: 42, locationId: 1 }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when copyId is missing', async () => {
    const res = await PATCH(makeRequest('PATCH', { locationId: 1 }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/copyId|physicalCopyId/i)
  })

  it('returns 400 when copyId is not a number', async () => {
    const res = await PATCH(makeRequest('PATCH', { copyId: 'abc', locationId: 1 }))
    expect(res.status).toBe(400)
  })

  it('accepts physicalCopyId as an alias for copyId', async () => {
    const res = await PATCH(makeRequest('PATCH', { physicalCopyId: 42, locationId: 1 }))
    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith(
      'move_copy_to_storage',
      expect.objectContaining({ p_copy_id: 42 })
    )
  })

  it('returns 404 when the RPC reports copy_not_found', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'copy_not_found' } })
    const res = await PATCH(makeRequest('PATCH', { copyId: 999, locationId: 1 }))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toMatch(/copy not found/i)
  })

  it('returns 404 when the RPC reports storage_location_not_found', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'storage_location_not_found' } })
    const res = await PATCH(makeRequest('PATCH', { copyId: 42, locationId: 999 }))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toMatch(/location not found/i)
  })

  it('maps copy_already_assigned to 409', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'copy_already_assigned' } })
    const res = await PATCH(makeRequest('PATCH', { copyId: 42, locationId: 1 }))
    expect(res.status).toBe(409)
  })

  it('assigns a location successfully', async () => {
    const res = await PATCH(makeRequest('PATCH', { copyId: 42, locationId: 1 }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.updated).toBe(1)
    expect(data.copyId).toBe(42)
    expect(data.locationId).toBe(1)
  })

  it('uses the default storage location when locationId is null', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, copy_id: 42, location_id: 5 },
      error: null,
    })
    const res = await PATCH(makeRequest('PATCH', { copyId: 42, locationId: null }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.locationId).toBe(5)
    expect(mockRpc).toHaveBeenCalledWith(
      'move_copy_to_storage',
      expect.objectContaining({ p_location_id: null })
    )
  })

  it('returns 500 when the database update fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB connection error' } })
    const res = await PATCH(makeRequest('PATCH', { copyId: 42, locationId: 1 }))
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
