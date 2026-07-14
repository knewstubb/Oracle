import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock dependencies before importing the route
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: 'test-user-123' }),
}))

vi.mock('@/lib/csv-import', () => ({
  parseCollectionCSV: vi.fn().mockReturnValue([]),
  computeCollectionDelta: vi.fn().mockResolvedValue({ added: [], removed: [], changed: [] }),
  applyCollectionImport: vi.fn().mockResolvedValue({ totalInserted: 0, errors: [] }),
}))

vi.mock('@/lib/collection-reallocator', () => ({
  importCollectionAndReallocate: vi.fn(),
}))

vi.mock('@/lib/import-engine', () => ({
  executeCollectionImportAsync: vi.fn().mockResolvedValue({ inserted: 0, skipped: 0 }),
}))

import { POST } from './route'

function makeRequest(url: string, body: string = 'Card Name,Quantity\nSol Ring,1') {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'POST',
    body,
    headers: { 'content-type': 'text/csv' },
  })
}

describe('POST /api/collection/import — confirm_delete guard (Req 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 403 when mode=legacy and confirm_delete is missing', async () => {
    const req = makeRequest('/api/collection/import?mode=legacy')
    const res = await POST(req)

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain('Legacy destructive import path is disabled')
    expect(json.error).toContain('confirm_delete=true')
  })

  it('returns 403 when mode=legacy and confirm_delete is empty string', async () => {
    const req = makeRequest('/api/collection/import?mode=legacy&confirm_delete=')
    const res = await POST(req)

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain("confirm_delete must be exactly 'true'")
  })

  it('returns 403 when mode=legacy and confirm_delete is "True" (case-sensitive)', async () => {
    const req = makeRequest('/api/collection/import?mode=legacy&confirm_delete=True')
    const res = await POST(req)

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain("received 'True'")
  })

  it('returns 403 when mode=legacy and confirm_delete is "yes"', async () => {
    const req = makeRequest('/api/collection/import?mode=legacy&confirm_delete=yes')
    const res = await POST(req)

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain("received 'yes'")
  })

  it('returns 403 when mode=legacy and confirm_delete is "1"', async () => {
    const req = makeRequest('/api/collection/import?mode=legacy&confirm_delete=1')
    const res = await POST(req)

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain("received '1'")
  })

  it('proceeds (not 403) when mode=legacy and confirm_delete=true', async () => {
    const req = makeRequest('/api/collection/import?mode=legacy&confirm_delete=true')
    const res = await POST(req)

    // Should not be 403 — it proceeds with the legacy flow
    expect(res.status).not.toBe(403)
    // Should not be 404 either (Req 3.4 — route exists)
    expect(res.status).not.toBe(404)
  })

  it('adds X-Import-Warning header when confirm_delete=true and proceeding', async () => {
    const req = makeRequest('/api/collection/import?mode=legacy&confirm_delete=true')
    const res = await POST(req)

    expect(res.headers.get('X-Import-Warning')).toContain('Destructive legacy import performed')
  })

  it('route returns 403 (not 404) ensuring the route is exposed (Req 3.4)', async () => {
    const req = makeRequest('/api/collection/import?mode=legacy')
    const res = await POST(req)

    // Explicitly verifies the route responds with 403, not 404
    expect(res.status).toBe(403)
  })

  it('does NOT apply the guard when mode=upsert (default mode)', async () => {
    const req = makeRequest('/api/collection/import?mode=upsert')
    const res = await POST(req)

    // upsert mode should not get a 403 — it goes through the normal upsert path
    expect(res.status).not.toBe(403)
  })
})
