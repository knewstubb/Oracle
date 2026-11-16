import { describe, it, expect, vi } from 'vitest'
import { checkConnection, touchConnection } from '../connection-store'
import { handleMcpRequest, type McpDeps } from '../handle-request'

// A recording stand-in for the admin client's connector_connections table.
function fakeAdmin(result: { data?: unknown; error?: unknown } | 'throw') {
  const calls: { op: string; args: unknown[] }[] = []
  const chain: Record<string, unknown> = {}
  for (const op of ['select', 'update', 'eq', 'is', 'limit', 'or']) chain[op] = (...args: unknown[]) => { calls.push({ op, args }); return chain }
  chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
    (result === 'throw' ? Promise.reject(new Error('x')) : Promise.resolve({ data: null, error: null, ...result })).then(ok, bad)
  return { admin: { from: () => chain } as never, calls }
}

describe('checkConnection', () => {
  it('active row -> active', async () => {
    const { admin, calls } = fakeAdmin({ data: [{ id: 'c1' }] })
    expect(await checkConnection('u', 'cl', admin)).toEqual({ status: 'active', connectionId: 'c1' })
    expect(calls).toContainEqual({ op: 'eq', args: ['user_id', 'u'] })
    expect(calls).toContainEqual({ op: 'eq', args: ['client_id', 'cl'] })
    expect(calls).toContainEqual({ op: 'is', args: ['revoked_at', null] })
  })
  it('no row (or only revoked rows, which the filter excludes) -> revoked', async () => {
    expect(await checkConnection('u', 'cl', fakeAdmin({ data: [] }).admin)).toEqual({ status: 'revoked' })
  })
  it('lookup error -> error (fail closed)', async () => {
    expect(await checkConnection('u', 'cl', fakeAdmin({ error: { message: 'x' } }).admin)).toEqual({ status: 'error' })
    expect(await checkConnection('u', 'cl', fakeAdmin('throw').admin)).toEqual({ status: 'error' })
  })
})

describe('touchConnection', () => {
  it('only updates when last_used_at is empty or older than a minute', async () => {
    const { admin, calls } = fakeAdmin({})
    await touchConnection('c1', 'u', admin)
    const or = calls.find((c) => c.op === 'or')!.args[0] as string
    expect(or).toMatch(/^last_used_at\.is\.null,last_used_at\.lt\./)
    const cutoff = Date.parse(or.split('last_used_at.lt.')[1])
    expect(Date.now() - cutoff).toBeGreaterThan(55_000)
    expect(Date.now() - cutoff).toBeLessThan(65_000)
    expect(calls).toContainEqual({ op: 'eq', args: ['user_id', 'u'] })
  })
  it('never throws', async () => {
    await expect(touchConnection('c1', 'u', fakeAdmin('throw').admin)).resolves.toBeUndefined()
  })
})

function deps(over: Partial<McpDeps> = {}): McpDeps {
  return {
    verify: vi.fn(async () => ({ ok: true as const, userId: 'user-1', clientId: 'cl' })),
    check: vi.fn(async () => ({ status: 'active' as const, connectionId: 'c1', clientName: 'Claude' })),
    touch: vi.fn(async () => {}),
    makeDb: vi.fn(() => ({ select: () => { throw new Error('db must not be used') } })),
    ...over,
  }
}
const rpc = (method: string, params: unknown = {}, headers: Record<string, string> = {}) =>
  new Request('https://oracle.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer tok', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })

describe('handleMcpRequest', () => {
  it('no token -> 401 with WWW-Authenticate pointing at the resource document', async () => {
    const res = await handleMcpRequest(rpc('tools/list', {}, { authorization: '' }), deps())
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toMatch(/resource_metadata=".*\/\.well-known\/oauth-protected-resource"/)
  })
  it('bad Origin -> 403 before anything else', async () => {
    const d = deps()
    const res = await handleMcpRequest(rpc('tools/list', {}, { origin: 'https://evil.example' }), d)
    expect(res.status).toBe(403)
    expect(d.verify).not.toHaveBeenCalled()
  })
  it('claude.ai origin allowed', async () => {
    const res = await handleMcpRequest(rpc('tools/list', {}, { origin: 'https://claude.ai' }), deps())
    expect(res.status).toBe(200)
  })
  it('invalid token -> 401 invalid_token, no lookups', async () => {
    const d = deps({ verify: vi.fn(async () => ({ ok: false as const, reason: 'invalid' as const })) })
    const res = await handleMcpRequest(rpc('tools/list'), d)
    expect(res.status).toBe(401)
    expect(d.check).not.toHaveBeenCalled()
  })
  it('expired token says to reconnect', async () => {
    const d = deps({ verify: vi.fn(async () => ({ ok: false as const, reason: 'expired' as const })) })
    const res = await handleMcpRequest(rpc('tools/list'), d)
    expect(res.headers.get('www-authenticate')).toMatch(/expired/)
  })
  it('revoked connection -> 401 CONNECTION_REVOKED, tool not reached', async () => {
    const d = deps({ check: vi.fn(async () => ({ status: 'revoked' as const })) })
    const res = await handleMcpRequest(rpc('tools/call', { name: 'list_decks', arguments: {} }), d)
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('CONNECTION_REVOKED')
    expect(d.makeDb).not.toHaveBeenCalled()
  })
  it('lookup error -> 503 and the tool is NOT called (fail closed)', async () => {
    const d = deps({ check: vi.fn(async () => ({ status: 'error' as const })) })
    const res = await handleMcpRequest(rpc('tools/call', { name: 'list_decks', arguments: {} }), d)
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('LOOKUP_FAILED')
    expect(d.makeDb).not.toHaveBeenCalled()
    expect(d.touch).not.toHaveBeenCalled()
  })
  it('checks the connection on every request, and touches last_used_at', async () => {
    const d = deps()
    await handleMcpRequest(rpc('tools/list'), d)
    await handleMcpRequest(rpc('tools/list'), d)
    expect(d.check).toHaveBeenCalledTimes(2)
    expect(d.touch).toHaveBeenCalledWith('c1', 'user-1')
  })
  it('GET and DELETE are 405 with Allow: POST', async () => {
    for (const method of ['GET', 'DELETE']) {
      const res = await handleMcpRequest(new Request('https://oracle.test/mcp', { method }), deps())
      expect(res.status).toBe(405)
      expect(res.headers.get('allow')).toBe('POST')
    }
  })
  it('oversized body is refused', async () => {
    const res = await handleMcpRequest(new Request('https://oracle.test/mcp', { method: 'POST', headers: { authorization: 'Bearer t' }, body: 'x'.repeat(40_000) }), deps())
    expect(res.status).toBe(413)
  })
  it('tools/call passes the verified sub and ignores any user id argument (INVALID_INPUT)', async () => {
    const d = deps()
    const res = await handleMcpRequest(rpc('tools/call', { name: 'list_decks', arguments: { user_id: 'someone-else' } }), d)
    const body = await res.json()
    expect(body.result.isError).toBe(true)
    expect(body.result.structuredContent.error.code).toBe('INVALID_INPUT')
    expect(d.makeDb).toHaveBeenCalledWith('tok')
  })
  it('unknown tool name is refused', async () => {
    const res = await handleMcpRequest(rpc('tools/call', { name: 'delete_deck', arguments: {} }), deps())
    expect((await res.json()).result.structuredContent.error.code).toBe('INVALID_INPUT')
  })
})
