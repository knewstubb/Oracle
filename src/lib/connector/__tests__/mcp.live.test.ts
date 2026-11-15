// Live check (skipped unless RUN_LIVE_CONNECTOR_TESTS=1 and CONNECTOR_TEST_TOKEN is set). It needs the owner to have
// enabled Supabase's OAuth server and a real connector token from the TEST account (never the owner's real data).
// It only calls read-only tools.
import { describe, it, expect } from 'vitest'

const base = process.env.CONNECTOR_BASE_URL ?? 'http://localhost:3000'
const token = process.env.CONNECTOR_TEST_TOKEN
const live = process.env.RUN_LIVE_CONNECTOR_TESTS === '1' && !!token

const rpc = (method: string, params: unknown, auth: string | null) =>
  fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })

describe.skipIf(!live)('/mcp live', () => {
  it('without a token: 401 with WWW-Authenticate', async () => {
    const res = await rpc('tools/list', {}, null)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toMatch(/resource_metadata/)
  })
  it('lists exactly five read-only tools', async () => {
    const body = await (await rpc('tools/list', {}, token!)).json()
    expect(body.result.tools).toHaveLength(5)
    for (const t of body.result.tools) expect(t.annotations.readOnlyHint).toBe(true)
  })
  it('get_collection_summary returns counts', async () => {
    const body = await (await rpc('tools/call', { name: 'get_collection_summary', arguments: {} }, token!)).json()
    expect(body.result.structuredContent.ok).toBe(true)
  })
  it('protected-resource document is public', async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`)
    expect(res.status).toBe(200)
    expect((await res.json()).authorization_servers).toHaveLength(1)
  })
})
