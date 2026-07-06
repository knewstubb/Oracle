import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAuthUser, requireAuth } from './auth'

// Mock the supabase-server module
vi.mock('./supabase-server', () => ({
  createAuthServerClient: vi.fn(),
}))

import { createAuthServerClient } from './supabase-server'

const mockGetUser = vi.fn()
const mockSupabaseClient = {
  auth: {
    getUser: mockGetUser,
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(createAuthServerClient).mockResolvedValue(mockSupabaseClient as any)
})

describe('getAuthUser', () => {
  it('returns the user when session is valid', async () => {
    const mockUser = { id: 'user-123', email: 'brad@example.com' }
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null })

    const result = await getAuthUser()

    expect(result).toEqual(mockUser)
    expect(createAuthServerClient).toHaveBeenCalledOnce()
    expect(mockGetUser).toHaveBeenCalledOnce()
  })

  it('returns null when getUser returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    })

    const result = await getAuthUser()

    expect(result).toBeNull()
  })

  it('returns null when user is null (no session)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const result = await getAuthUser()

    expect(result).toBeNull()
  })
})

describe('requireAuth', () => {
  it('returns the user object when authenticated', async () => {
    const mockUser = { id: 'user-456', email: 'player@example.com' }
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null })

    const result = await requireAuth()

    expect(result).not.toBeInstanceOf(Response)
    expect(result).toEqual(mockUser)
  })

  it('returns a 401 Response when no session exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const result = await requireAuth()

    expect(result).toBeInstanceOf(Response)
    const response = result as Response
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns a 401 Response when getUser errors', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid token' },
    })

    const result = await requireAuth()

    expect(result).toBeInstanceOf(Response)
    const response = result as Response
    expect(response.status).toBe(401)
  })
})
