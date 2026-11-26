import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.fn(async () => ({ data: { user: null } }))
const signInWithPassword = vi.fn(async () => ({ error: null }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser, signInWithPassword } }) }))

import { middleware } from './middleware'
import { SIGNED_OUT_COOKIE } from '@/lib/local-auto-login'

describe('middleware: local auto sign-in after Log out', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('LOCAL_AUTO_LOGIN_EMAIL', 'me@example.com')
    vi.stubEnv('LOCAL_AUTO_LOGIN_PASSWORD', 'pw')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://x')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'k')
  })

  it('signs in automatically when the user has not logged out', async () => {
    await middleware(new NextRequest('http://localhost/collection'))
    expect(signInWithPassword).toHaveBeenCalledTimes(1)
  })

  it('does not sign in again after Log out and sends a signed-out user to the login page', async () => {
    const res = await middleware(
      new NextRequest('http://localhost/collection', { headers: { cookie: `${SIGNED_OUT_COOKIE}=1` } })
    )
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
  })
})
