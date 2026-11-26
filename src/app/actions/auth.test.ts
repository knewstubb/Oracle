import { describe, it, expect, vi, beforeEach } from 'vitest'

const signOut = vi.fn(async () => ({ error: null }))
const set = vi.fn()
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set }) }))
vi.mock('@/lib/supabase-server', () => ({ createAuthServerClient: async () => ({ auth: { signOut } }) }))

import { logout } from './auth'
import { SIGNED_OUT_COOKIE } from '@/lib/local-auto-login'

describe('logout', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ends the session, marks the browser as signed out (so local auto sign-in stays off) and goes to the login page', async () => {
    await expect(logout()).rejects.toThrow('REDIRECT:/login')
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(SIGNED_OUT_COOKIE, '1', expect.objectContaining({ path: '/' }))
  })
})
