import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSupabaseSelect = vi.fn()
const mockSupabaseUpdate = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mockSupabaseSelect,
        }),
      }),
      update: () => ({
        eq: mockSupabaseUpdate,
      }),
    }),
  }),
}))

import { POST } from './route'
import { NextRequest } from 'next/server'

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('/api/brew/positions', 'http://localhost:3000'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/brew/positions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseUpdate.mockResolvedValue({ error: null })
  })

  it('returns 400 for missing sessionId', async () => {
    const req = makePostRequest({ canvasPositions: {} })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing canvasPositions', async () => {
    const req = makePostRequest({ sessionId: 1 })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 for non-existent session', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const req = makePostRequest({ sessionId: 999, canvasPositions: {} })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('persists positions to skeleton_json (empty skeleton)', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: { skeleton_json: null }, error: null })

    const positions = {
      'Sol Ring': { id: 'Sol Ring', x: 100, y: 200, type: 'deck', updatedAt: 1000 },
    }

    const req = makePostRequest({ sessionId: 1, canvasPositions: positions })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)

    // Verify Supabase update was called
    expect(mockSupabaseUpdate).toHaveBeenCalled()
  })

  it('merges positions into existing skeleton_json (preserves cards)', async () => {
    const existingSkeleton = JSON.stringify({
      cards: [{ card_name: 'Sol Ring', primary_category: 'Ramp' }],
      suggestions: [],
    })
    mockSupabaseSelect.mockResolvedValue({ data: { skeleton_json: existingSkeleton }, error: null })

    const positions = {
      'Sol Ring': { id: 'Sol Ring', x: 50, y: 75, type: 'deck', updatedAt: 2000 },
    }

    const req = makePostRequest({ sessionId: 1, canvasPositions: positions })
    const res = await POST(req)
    expect(res.status).toBe(200)

    // Verify Supabase update was called
    expect(mockSupabaseUpdate).toHaveBeenCalled()
  })

  it('returns success for valid positions with multiple cards', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: { skeleton_json: null }, error: null })

    const positions = {
      'Lightning Bolt': { id: 'Lightning Bolt', x: 0, y: 0, type: 'deck', updatedAt: 100 },
      'Counterspell': { id: 'Counterspell', x: 156, y: 0, type: 'deck', updatedAt: 100 },
      'Forest': { id: 'Forest', x: 0, y: 196, type: 'deck', updatedAt: 100 },
    }

    const req = makePostRequest({ sessionId: 1, canvasPositions: positions })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(mockSupabaseUpdate).toHaveBeenCalled()
  })

  it('returns 500 when Supabase update fails', async () => {
    mockSupabaseSelect.mockResolvedValue({ data: { skeleton_json: null }, error: null })
    mockSupabaseUpdate.mockResolvedValue({ error: { message: 'Connection failed' } })

    const positions = {
      'Sol Ring': { id: 'Sol Ring', x: 100, y: 200, type: 'deck', updatedAt: 1000 },
    }

    const req = makePostRequest({ sessionId: 1, canvasPositions: positions })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
