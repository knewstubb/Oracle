import { describe, it, expect, vi } from 'vitest'
import { processRevoke, type RevokeDeps } from '../revoke'

const CONN = '11111111-2222-4333-8444-555555555555'
const clientToken = () => {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'none' })}.${b({ sub: 'u', client_id: 'c' })}.x`
}

function deps(over: Partial<RevokeDeps> = {}) {
  const order: string[] = []
  const d: RevokeDeps = {
    getUserId: async () => 'user-1',
    getSessionAccessToken: async () => null,
    revokeRow: vi.fn(async () => { order.push('row'); return { clientId: 'client-1' } }),
    revokeGrant: vi.fn(async () => { order.push('grant'); return { error: null } }),
    ...over,
  }
  return { d, order }
}

describe('processRevoke', () => {
  it('cookie user revokes their own row: row first, then grant', async () => {
    const { d, order } = deps()
    const r = await processRevoke({ authorizationHeader: null, body: { connectionId: CONN } }, d)
    expect(r).toEqual({ status: 200, body: { ok: true } })
    expect(order).toEqual(['row', 'grant'])
    expect(d.revokeRow).toHaveBeenCalledWith(CONN, 'user-1')
  })
  it('another user\'s row is not found (row lookup is scoped by the verified user id)', async () => {
    const { d } = deps({ revokeRow: vi.fn(async () => ({ error: 'not_found' as const })) })
    const r = await processRevoke({ authorizationHeader: null, body: { connectionId: CONN } }, d)
    expect(r.status).toBe(404)
    expect(d.revokeGrant).not.toHaveBeenCalled()
  })
  it('refuses a request carrying a bearer token', async () => {
    const { d } = deps()
    const r = await processRevoke({ authorizationHeader: 'Bearer abc', body: { connectionId: CONN } }, d)
    expect(r.status).toBe(403)
    expect(d.revokeRow).not.toHaveBeenCalled()
  })
  it('refuses a session whose token has a client_id claim', async () => {
    const { d } = deps({ getSessionAccessToken: async () => clientToken() })
    const r = await processRevoke({ authorizationHeader: null, body: { connectionId: CONN } }, d)
    expect(r.status).toBe(403)
    expect(d.revokeRow).not.toHaveBeenCalled()
  })
  it('requires sign-in', async () => {
    const { d } = deps({ getUserId: async () => null })
    expect((await processRevoke({ authorizationHeader: null, body: { connectionId: CONN } }, d)).status).toBe(401)
  })
  it('revokeGrant failure still leaves the row revoked and reports success with a warning', async () => {
    const { d, order } = deps({ revokeGrant: vi.fn(async () => { throw new Error('boom') }) })
    const r = await processRevoke({ authorizationHeader: null, body: { connectionId: CONN } }, d)
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.warning).toBeTruthy()
    expect(order).toEqual(['row'])
  })
  it('rejects a bad connection id', async () => {
    const { d } = deps()
    expect((await processRevoke({ authorizationHeader: null, body: { connectionId: 'x' } }, d)).status).toBe(400)
  })
})
