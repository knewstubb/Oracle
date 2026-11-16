import { describe, it, expect } from 'vitest'
import { connectionStatus, enableConnection } from '../owner-api'
import type { Gateway } from '../write-types'

const ID = '11111111-2222-4333-8444-555555555555'
const old = '2026-01-01T00:00:00Z'
const row = (over: Record<string, unknown> = {}) => ({ id: ID, client_id: 'cl', client_name: 'Claude', created_at: old, last_used_at: null, revoked_at: null, ...over })
const gw = (latest: unknown, alive: unknown = { ok: true, data: true }, reenable: unknown = { ok: true, data: { success: true } }) =>
  ({ latestConnection: async () => latest, grantAlive: async () => alive, reenable: async () => reenable }) as unknown as Gateway
const ok = (data: unknown) => ({ ok: true, data })
const fail = { ok: false, code: 'rpc_failed', detail: {} }

describe('connectionStatus', () => {
  it('no row at all: off, cannot re-enable', async () => {
    const r = await connectionStatus(gw(ok(null)), 'u', 'a@b.c')
    expect(r.body).toMatchObject({ state: 'off', connected: false, can_reenable: false, connection: null })
  })
  it('on row with a good grant: active', async () => {
    expect((await connectionStatus(gw(ok(row())), 'u', null)).body).toMatchObject({ state: 'active', connected: true })
  })
  it('on row whose Claude-side grant is gone: expired (needs reconnecting)', async () => {
    expect((await connectionStatus(gw(ok(row()), ok(false)), 'u', null)).body).toMatchObject({ state: 'expired', connected: false })
  })
  it('brand new row with no session yet is still active (sign-in in progress)', async () => {
    expect((await connectionStatus(gw(ok(row({ created_at: new Date().toISOString() })), ok(false)), 'u', null)).body).toMatchObject({ state: 'active' })
  })
  it('switched-off row: off, and can_reenable follows the grant', async () => {
    expect((await connectionStatus(gw(ok(row({ revoked_at: old })), ok(true)), 'u', null)).body).toMatchObject({ state: 'off', can_reenable: true })
    expect((await connectionStatus(gw(ok(row({ revoked_at: old })), ok(false)), 'u', null)).body).toMatchObject({ state: 'off', can_reenable: false })
  })
  it('a failed lookup or grant check fails the whole answer (never guesses off or expired)', async () => {
    expect((await connectionStatus(gw(fail), 'u', null)).status).toBe(503)
    expect((await connectionStatus(gw(ok(row()), fail), 'u', null)).status).toBe(503)
  })
})

describe('enableConnection', () => {
  it('rejects a bad id', async () => {
    expect((await enableConnection(gw(null), 'u', 'nope')).status).toBe(400)
  })
  it('success', async () => {
    expect((await enableConnection(gw(null), 'u', ID)).body).toEqual({ ok: true, state: 'active' })
  })
  it('needs reconnect is a 409 with a plain sentence', async () => {
    const r = await enableConnection(gw(null, undefined, ok({ success: false, error: 'needs_reconnect' })), 'u', ID)
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ ok: false, needs_reconnect: true, code: 'needs_reconnect' })
  })
  it('not found is a 404; database failure is a 503', async () => {
    expect((await enableConnection(gw(null, undefined, ok({ success: false, error: 'not_found' })), 'u', ID)).status).toBe(404)
    expect((await enableConnection(gw(null, undefined, fail), 'u', ID)).status).toBe(503)
  })
})
