import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User } from '@supabase/supabase-js'

// Routes require a signed-in user, so pretend one is signed in.
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}))

import { POST } from './route'
import { requireAuth } from '@/lib/auth'
import { NextRequest } from 'next/server'

const mockUser = { id: 'test-user-id', email: 'test@example.com' } as unknown as User

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/archidekt/create-deck', {
    method: 'POST',
  })
}

describe('POST /api/archidekt/create-deck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 501 indicating Playwright automation is dormant', async () => {
    vi.mocked(requireAuth).mockResolvedValue(mockUser)

    const res = await POST(makeRequest())
    expect(res.status).toBe(501)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('dormant')
  })
})
