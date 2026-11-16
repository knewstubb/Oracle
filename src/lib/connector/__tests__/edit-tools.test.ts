import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runTool } from '../server'
import { mockDb } from './mock-db'
import { AI_LIMITS } from '../edit-config'
import { guardOwnerRequest } from '../cookie-guard'
import * as api from '../owner-api'
import { groupChanges } from '../change-groups'
import type { ChangeLogRow, Gateway } from '../write-types'

const U = 'user-1'
const G = '11111111-2222-4333-8444-555555555555'

function gw(over: Partial<Record<keyof Gateway, unknown>> = {}): Gateway {
  const fail = () => { throw new Error('unexpected gateway call') }
  const base: Record<string, unknown> = {
    resolveCard: async (n: string) => ({ card: { oracleId: 'o-' + n, scryfallId: 's-' + n, name: n, setCode: 'cmm' } }),
    submit: vi.fn(async () => ({ ok: true, data: { success: true, outcome: 'applied', group_id: G, count: 1 } })),
    getPending: fail, listRecent: fail, undoAsClaude: fail, undoAsOwner: fail, listPending: fail, pendingCount: fail,
    approve: fail, decline: fail, movedSlots: fail, revoke: fail, activeConnection: fail,
  }
  return { ...base, ...over } as unknown as Gateway
}
const ctx = (gateway: Gateway, db = mockDb(() => ({ data: [] })).db) => ({ db, userId: U, connectionId: 'conn-1', clientId: 'cl', clientName: 'Claude', gateway })

describe('limits match the database', () => {
  it('AI_LIMITS equals _ai_limits() in the migration', () => {
    const sql = readFileSync(path.resolve(__dirname, '../../../../supabase/migrations/20261116150100_ai_connector_edit_rpcs.sql'), 'utf8')
    const body = /_ai_limits\(\)[\s\S]*?jsonb_build_object\(([\s\S]*?)\n\s*\)\n\$\$/.exec(sql)![1]
    const found: Record<string, number> = {}
    for (const m of body.matchAll(/'([a-z_]+)'\s*,\s*(\d+)/g)) found[m[1]] = Number(m[2])
    expect(found).toEqual(AI_LIMITS)
  })
})

describe('edit tools', () => {
  it('user id and connection id come from the token context, never from arguments', async () => {
    const g = gw()
    const r = await runTool(ctx(g), 'add_cards_to_deck', { deck_id: 3, cards: [{ name: 'Sol Ring' }] })
    expect(r.isError).toBeFalsy()
    expect(g.submit).toHaveBeenCalledWith({
      userId: U, connectionId: 'conn-1', action: 'deck_add', dryRun: false,
      payload: { deck_id: 3, items: [{ card_name: 'Sol Ring', scryfall_id: 's-Sol Ring', set_code: 'cmm', oracle_id: 'o-Sol Ring', quantity: 1, categories: '["Other"]' }] },
    })
  })
  it.each(['user_id', 'userId', 'connection_id'])('an extra %s argument is rejected and nothing is submitted', async (key) => {
    const g = gw()
    const r = await runTool(ctx(g), 'remove_cards_from_deck', { deck_id: 1, slots: [{ slot_id: 2, name: 'x' }], [key]: 'other' })
    expect(r.isError).toBe(true)
    expect(g.submit).not.toHaveBeenCalled()
  })
  it('refuses destructive and unknown tool names, and never reaches the gateway', async () => {
    const g = gw()
    for (const name of ['delete_deck', 'remove_from_collection', 'delete_card', 'import_collection', 'bulk_remove', 'sync_collection', 'not_a_tool']) {
      const r = await runTool(ctx(g), name, {})
      expect(r.isError, name).toBe(true)
    }
    const r = await runTool(ctx(g), 'delete_deck', {})
    expect(r.structuredContent).toMatchObject({ error: { code: 'tool_not_allowed' } })
    expect(g.submit).not.toHaveBeenCalled()
  })
  it('more than 60 cards in one request is rejected before anything is looked up', async () => {
    const g = gw()
    const cards = Array.from({ length: 61 }, (_, i) => ({ name: 'C' + i }))
    const r = await runTool(ctx(g), 'add_cards_to_deck', { deck_id: 1, cards })
    expect(r.isError).toBe(true)
    expect(g.submit).not.toHaveBeenCalled()
  })
  it('an unknown card name refuses the whole request', async () => {
    const g = gw({ resolveCard: async (n: string) => (n === 'Nope' ? { card: null, error: false } : { card: { oracleId: 'o', scryfallId: 's', name: n, setCode: 'x' } }) })
    const r = await runTool(ctx(g), 'add_cards_to_deck', { deck_id: 1, cards: [{ name: 'Sol Ring' }, { name: 'Nope' }] })
    expect(r.structuredContent).toMatchObject({ error: { code: 'card_not_found' } })
    expect(g.submit).not.toHaveBeenCalled()
  })
  it('a pending outcome is reported as pending_approval with the pending id', async () => {
    const g = gw({ submit: async () => ({ ok: true, data: { success: true, outcome: 'pending', pending_id: G, expires_at: 'x', reason: 'over_ten' } }) })
    const r = await runTool(ctx(g), 'remove_cards_from_deck', { deck_id: 1, slots: [{ slot_id: 2, name: 'x' }] })
    expect(r.structuredContent).toMatchObject({ ok: true, status: 'pending_approval', pending_id: G })
  })
  it('a database refusal comes back as its specific code with "Nothing was changed"', async () => {
    const g = gw({ submit: async () => ({ ok: false, code: 'commander_slot', detail: { card: 'Korvold' } }) })
    const r = await runTool(ctx(g), 'remove_cards_from_deck', { deck_id: 1, slots: [{ slot_id: 2, name: 'Korvold' }] })
    expect(r.isError).toBe(true)
    expect(r.structuredContent).toMatchObject({ error: { code: 'commander_slot' } })
    expect(JSON.stringify(r.structuredContent)).toMatch(/Nothing was changed/)
  })
  it('request_card_move captures the current source slot and refuses a wrong name', async () => {
    const g = gw({ submit: vi.fn(async () => ({ ok: true, data: { success: true, outcome: 'pending', pending_id: G, expires_at: 'x', reason: 'card_move' } })) })
    const db = mockDb((q) => ({ data: q.table === 'user_copies' ? [{ id: 9, card_id: 4 }] : q.table === 'user_cards' ? [{ card_name: 'Sol Ring' }] : [{ id: 77, deck_id: 5 }] })).db
    const ok = await runTool(ctx(g, db), 'request_card_move', { copy_id: 9, name: 'sol ring', to_deck_id: 6 })
    expect(ok.structuredContent).toMatchObject({ status: 'pending_approval' })
    expect(g.submit).toHaveBeenCalledWith(expect.objectContaining({ action: 'copy_move', payload: { copy_id: 9, to_deck_id: 6, expected_source_deck_id: 5, expected_source_slot_id: 77 } }))
    const bad = await runTool(ctx(g, db), 'request_card_move', { copy_id: 9, name: 'Island', to_deck_id: 6 })
    expect(bad.structuredContent).toMatchObject({ error: { code: 'wrong_card' } })
  })
  it('undo_change uses the Claude path and reports a refusal in words', async () => {
    const g = gw({ undoAsClaude: vi.fn(async () => ({ ok: true, data: { success: false, refused: { code: 'owner_only' } } })) })
    const r = await runTool(ctx(g), 'undo_change', { group_id: G })
    expect(g.undoAsClaude).toHaveBeenCalledWith(U, 'conn-1', G)
    expect(r.structuredContent).toMatchObject({ error: { code: 'undo_refused' } })
  })
})

const row = (over: Partial<ChangeLogRow> = {}): ChangeLogRow => ({
  id: 'r', group_id: G, kind: 'deck_add', client_name: 'Claude', deck_id: 1, deck_name: 'Korvold', other_deck_id: null, other_deck_name: null,
  card_name: 'Sol Ring', oracle_id: null, printing_id: null, approved_by_owner: false, created_at: '2026-11-16T01:00:00Z',
  undoable_until: '2026-11-23T01:00:00Z', undone_at: null, undone_by: null, owner_only: false, undo_blocker: null, ...over,
})

describe('owner routes logic', () => {
  it('groups rows into one entry per request with a sentence', () => {
    const v = groupChanges([row(), row({ id: 'r2', card_name: 'Island' }), row({ id: 'r3', group_id: 'other', kind: 'collection_add', owner_only: true })])
    expect(v).toHaveLength(2)
    expect(v[0]).toMatchObject({ card_count: 2, cards: ['Sol Ring', 'Island'], summary: 'Added 2 cards to Korvold.' })
    expect(v[1].owner_only).toBe(true)
  })
  it('undo refusal is a 409 with the refusal and plain words', async () => {
    const g = gw({ undoAsOwner: async () => ({ ok: true, data: { success: false, refused: { code: 'slot_sleeved', card: 'Sol Ring', deck: 'Korvold' } } }) })
    const r = await api.undoChange(g, U, G)
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ ok: false, success: false, code: 'undo_refused', refused: { code: 'slot_sleeved' } })
  })
  it('undo success is 200 and uses the session user id', async () => {
    const undoAsOwner = vi.fn(async () => ({ ok: true, data: { success: true, undone: 3 } }))
    const r = await api.undoChange(gw({ undoAsOwner }), U, G)
    expect(r.status).toBe(200)
    expect(undoAsOwner).toHaveBeenCalledWith(U, G)
  })
  it('approving a stale request is a 409 with plain words', async () => {
    const g = gw({ listPending: async () => ({ ok: true, data: [] }), approve: async () => ({ ok: true, data: { success: false, outcome: 'failed', reason: { code: 'copy_not_in_a_deck', card: 'Sol Ring' } } }) })
    const r = await api.approvePending(g, U, G)
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ ok: false, outcome: 'failed', code: 'pending_ended' })
    expect(JSON.stringify(r.body)).toMatch(/Nothing was changed/)
  })
  it('approve and decline of a bad id are 400, an unknown one is 404', async () => {
    expect((await api.approvePending(gw(), U, 'nope')).status).toBe(400)
    const g = gw({ listPending: async () => ({ ok: true, data: [] }), approve: async () => ({ ok: false, code: 'pending_not_found', detail: {} }) })
    expect((await api.approvePending(g, U, G)).status).toBe(404)
  })
  it('declining works', async () => {
    const r = await api.declinePending(gw({ decline: async () => ({ ok: true, data: { success: true, outcome: 'declined' } }) }), U, G)
    expect(r).toMatchObject({ status: 200, body: { ok: true, outcome: 'declined' } })
  })
  it('a database failure is 503 with no change claimed', async () => {
    const r = await api.pendingCount(gw({ pendingCount: async () => ({ ok: false, code: 'rpc_failed', detail: {} }) }), U)
    expect(r.status).toBe(503)
  })
  it('count returns the number', async () => {
    expect(await api.pendingCount(gw({ pendingCount: async () => ({ ok: true, data: 4 }) }), U)).toEqual({ status: 200, body: { ok: true, count: 4 } })
  })
  it('moved-slots needs a deck id', async () => {
    expect((await api.movedSlots(gw(), U, null)).status).toBe(400)
  })
})

describe('cookie guard', () => {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const clientToken = async () => `${b64({ alg: 'none' })}.${b64({ sub: U, client_id: 'c' })}.x`
  const deps = (over = {}) => ({ getUserId: async () => U as string | null, getSessionAccessToken: async () => null as string | null, siteOrigins: ['https://oracle.test'], ...over })
  const req = (method: string, headers: Record<string, string> = {}) => ({ method, headers: new Headers(headers) })

  it('accepts a cookie session GET', async () => {
    expect(await guardOwnerRequest(req('GET'), deps())).toEqual({ ok: true, userId: U })
  })
  it('rejects any Authorization header', async () => {
    expect(await guardOwnerRequest(req('GET', { authorization: 'Bearer x' }), deps())).toMatchObject({ ok: false, status: 403 })
  })
  it('rejects a session token that carries a client_id', async () => {
    const t = await clientToken()
    expect(await guardOwnerRequest(req('GET'), deps({ getSessionAccessToken: async () => t }))).toMatchObject({ ok: false, status: 403 })
  })
  it('rejects a POST without or with a foreign Origin, accepts the site origin', async () => {
    expect(await guardOwnerRequest(req('POST'), deps())).toMatchObject({ ok: false, status: 403 })
    expect(await guardOwnerRequest(req('POST', { origin: 'https://evil.test' }), deps())).toMatchObject({ ok: false, status: 403 })
    expect(await guardOwnerRequest(req('POST', { origin: 'https://oracle.test' }), deps())).toMatchObject({ ok: true })
  })
  it('rejects when signed out', async () => {
    expect(await guardOwnerRequest(req('GET'), deps({ getUserId: async () => null }))).toMatchObject({ ok: false, status: 401 })
  })
})
