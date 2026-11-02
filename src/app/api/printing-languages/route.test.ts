import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  auth: { id: 'user-1' } as unknown,
  languages: ['en', 'ja'] as string[] | null,
}))

vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve(state.auth),
}))
vi.mock('@/lib/printing-languages', async (orig) => ({
  ...(await orig<typeof import('@/lib/printing-languages')>()),
  fetchPrintingLanguages: () => Promise.resolve(state.languages),
}))

import { GET } from './route'

const call = (qs: string) => GET(new NextRequest(`http://localhost/api/printing-languages${qs}`))

describe('GET /api/printing-languages', () => {
  beforeEach(() => {
    state.auth = { id: 'user-1' }
    state.languages = ['en', 'ja']
  })

  it('requires sign-in', async () => {
    state.auth = Response.json({ error: 'Unauthorized' }, { status: 401 })
    expect((await call('?set=sos&cn=1')).status).toBe(401)
  })

  it('rejects missing input', async () => {
    expect((await call('?set=sos')).status).toBe(400)
  })

  it('caches a successful answer for a day', async () => {
    const res = await call('?set=sos&cn=1')
    expect(await res.json()).toEqual({ languages: ['en', 'ja'] })
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=86400')
  })

  it('never caches a failed lookup', async () => {
    state.languages = null
    const res = await call('?set=sos&cn=1')
    expect(await res.json()).toEqual({ languages: null })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
