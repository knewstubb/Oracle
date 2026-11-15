import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

import { middleware } from '@/middleware'
import { isConnectorPublicPath } from '../public-paths'

const call = (path: string) => middleware(new NextRequest(`https://oracle.test${path}`))

describe('middleware public paths', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['/mcp', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'])('%s passes without cookies', async (p) => {
    const res = await call(p)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it.each(['/mcp/x', '/mcpfoo', '/mcp/', '/.well-known/other', '/.well-known/oauth-protected-resource/x', '/oauth/consent', '/api/connector/revoke'])('%s is NOT public', async (p) => {
    expect(isConnectorPublicPath(p)).toBe(false)
    const res = await call(p)
    expect(res.status === 401 || res.status === 307).toBe(true)
  })

  it('page redirects to login carrying a return address', async () => {
    const res = await call('/oauth/consent?authorization_id=abc')
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname).toBe('/login')
    expect(loc.searchParams.get('next')).toBe('/oauth/consent?authorization_id=abc')
  })

  it('existing public routes unchanged and api still 401', async () => {
    expect((await call('/login')).status).toBe(200)
    expect((await call('/auth/callback')).status).toBe(200)
    expect((await call('/api/cards/search')).status).toBe(200)
    expect((await call('/api/decks')).status).toBe(401)
  })
})
