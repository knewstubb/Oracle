import { describe, it, expect, vi } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { runTool } from '../server'
import { mockDb } from './mock-db'
import { AI_LIMITS, AI_LIMITS_NEW } from '../edit-config'
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
    approve: fail, decline: fail, movedSlots: fail, revoke: fail, activeConnection: fail, latestConnection: fail, grantAlive: fail, reenable: fail,
  }
  return { ...base, ...over } as unknown as Gateway
}
const ctx = (gateway: Gateway, db = mockDb(() => ({ data: [] })).db) => ({ db, userId: U, connectionId: 'conn-1', clientId: 'cl', clientName: 'Claude', gateway })

describe('limits match the database', () => {
  const limitsIn = (sql: string) => {
    const defs = [...sql.matchAll(/FUNCTION public\._ai_limits\(\)[\s\S]*?jsonb_build_object\(([\s\S]*?)\n\s*\)\n\$\$/g)]
    if (!defs.length) return null
    const found: Record<string, number> = {}
    for (const m of defs[defs.length - 1][1].matchAll(/'([a-z_]+)'\s*,\s*(\d+)/g)) found[m[1]] = Number(m[2])
    return found
  }
  it('AI_LIMITS equals the LAST _ai_limits() definition in supabase/migrations', () => {
    const dir = path.resolve(__dirname, '../../../../supabase/migrations')
    let last: Record<string, number> | null = null
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql') && !n.includes('rollback')).sort()) {
      const l = limitsIn(readFileSync(path.join(dir, f), 'utf8'))
      if (l) last = l
    }
    // Until the CC-13 migration (supabase/drafts) is applied, the migrations still hold the old values; the draft is the next definition.
    const draftPath = path.resolve(__dirname, '../../../../supabase/drafts/20261117100000_cc13_loosen_limits.draft.sql')
    const draft = existsSync(draftPath) ? limitsIn(readFileSync(draftPath, 'utf8')) : null
    // Applied: the last migration must match. Not applied yet: the draft must match.
    expect(last && JSON.stringify(last) === JSON.stringify(AI_LIMITS) ? last : draft).toEqual(AI_LIMITS)
  })
  it('AI_LIMITS_NEW equals the LAST _ai_limits_new() definition (migrations, else the cc15a draft)', () => {
    const limitsNewIn = (sql: string) => {
      const defs = [...sql.matchAll(/FUNCTION public\._ai_limits_new\(\)[\s\S]*?jsonb_build_object\(([\s\S]*?)\n\s*\)\n\$\$/g)]
      if (!defs.length) return null
      const found: Record<string, number> = {}
      for (const m of defs[defs.length - 1][1].matchAll(/'([a-z_]+)'\s*,\s*(\d+)/g)) found[m[1]] = Number(m[2])
      return found
    }
    const root = path.resolve(__dirname, '../../../../supabase')
    let last: Record<string, number> | null = null
    for (const f of readdirSync(path.join(root, 'migrations')).filter((n) => n.endsWith('.sql') && !n.includes('rollback')).sort()) {
      const l = limitsNewIn(readFileSync(path.join(root, 'migrations', f), 'utf8'))
      if (l) last = l
    }
    const draftPath = path.join(root, 'drafts/20261117200000_cc15a_new_change_kinds.draft.sql')
    const draft = existsSync(draftPath) ? limitsNewIn(readFileSync(draftPath, 'utf8')) : null
    // Applied: the last migration must match. Not applied yet: the draft must match.
    expect(last ?? draft).toEqual(AI_LIMITS_NEW)
  })
  it('AI_LIMITS equals the CC-13 contract types', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../../docs/oracle/contracts/claude-connector-cc13-amendment.types.ts'), 'utf8')
    const body = /export const AI_LIMITS = \{([\s\S]*?)\}/.exec(src)![1]
    const found: Record<string, number> = {}
    for (const m of body.matchAll(/([a-z_]+):\s*(\d+)/g)) found[m[1]] = Number(m[2])
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
  it('a 120-card deck build goes to the database as ONE request (one group, one Undo)', async () => {
    const g = gw()
    const cards = Array.from({ length: 120 }, (_, i) => ({ name: 'C' + i }))
    const r = await runTool(ctx(g), 'add_cards_to_deck', { deck_id: 1, cards })
    expect(r.isError).toBeFalsy()
    expect(g.submit).toHaveBeenCalledTimes(1)
    expect((g.submit as unknown as { mock: { calls: { payload: { items: unknown[] } }[][] } }).mock.calls[0][0].payload.items).toHaveLength(120)
  })
  it('a 100-card deck given as card names with quantities is one request', async () => {
    const g = gw()
    const r = await runTool(ctx(g), 'add_cards_to_deck', { deck_id: 1, cards: [{ name: 'Forest', quantity: 36 }, { name: 'Sol Ring' }] })
    expect(r.isError).toBeFalsy()
    expect(g.submit).toHaveBeenCalledTimes(1)
  })
  it('more than 200 cards in one request is rejected before anything is looked up', async () => {
    const g = gw()
    const cards = Array.from({ length: 201 }, (_, i) => ({ name: 'C' + i }))
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
    expect(ok.structuredContent).toMatchObject({ status: 'pending_approval' }) // an old-style waiting row still reads fine
    expect(g.submit).toHaveBeenCalledWith(expect.objectContaining({ action: 'copy_move', payload: { copy_id: 9, to_deck_id: 6, expected_source_deck_id: 5, expected_source_slot_id: 77 } }))
    const bad = await runTool(ctx(g, db), 'request_card_move', { copy_id: 9, name: 'Island', to_deck_id: 6 })
    expect(bad.structuredContent).toMatchObject({ error: { code: 'wrong_card' } })
  })
  it('request_card_move goes straight through when the database applies it', async () => {
    const g = gw({ submit: vi.fn(async () => ({ ok: true, data: { success: true, outcome: 'applied', group_id: G, count: 1 } })) })
    const db = mockDb((q) => ({ data: q.table === 'user_copies' ? [{ id: 9, card_id: 4 }] : q.table === 'user_cards' ? [{ card_name: 'Sol Ring' }] : [{ id: 77, deck_id: 5 }] })).db
    const r = await runTool(ctx(g, db), 'request_card_move', { copy_id: 9, name: 'Sol Ring', to_deck_id: 6 })
    expect(r.isError).toBeFalsy()
    expect(JSON.stringify(r.structuredContent)).not.toMatch(/pending_approval/)
  })
  it('tool text: one-request deck builds, 120 limit, free copies only, moves undone by owner', async () => {
    const { CONNECTOR_TOOLS: TOOLS } = await import('../tools')
    const d = (n: string) => (TOOLS as unknown as { name: string; description: string }[]).find((t) => t.name === n)!.description
    expect(d('add_cards_to_deck')).toMatch(/120/)
    expect(d('add_cards_to_deck')).toMatch(/ONE call/)
    expect(d('add_cards_to_deck')).not.toMatch(/Up to 10 /)
    expect(d('add_cards_to_deck')).toMatch(/role category.*Ramp, Card Draw, Removal, Board Wipes, Lands.*reuse the category names the deck already shows in get_deck/)
    expect(d('sleeve_free_copy')).toMatch(/free copies only/i)
    expect(d('request_card_move')).toMatch(/straight through/)
    expect(d('request_card_move')).toMatch(/only the owner can undo/i)
    expect(d('undo_change')).toMatch(/200/)
  })
  it('a move that was not approved by the owner says Claude moved it, with no "you approved"', async () => {
    const { describeGroup } = await import('../change-sentences')
    const mv = row({ kind: 'copy_move', other_deck_name: 'Korvold', deck_name: 'Prosper' })
    expect(describeGroup([mv]).summary).not.toMatch(/approved/)
    expect(describeGroup([{ ...mv, approved_by_owner: true }]).summary).toMatch(/you approved this/)
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

describe('set_card_category', () => {
  const slot = (categories: string[]) => ({ slot_id: 7, name: 'Sol Ring', categories })
  it('sends names trimmed but otherwise as written (no case change, no matching), mapping slot_id to id', async () => {
    const g = gw()
    const r = await runTool(ctx(g), 'set_card_category', { deck_id: 3, slots: [slot(['  ramp ', 'Good Stuff'])] })
    expect(r.isError).toBeFalsy()
    expect(g.submit).toHaveBeenCalledWith({
      userId: U, connectionId: 'conn-1', action: 'deck_category', dryRun: false,
      payload: { deck_id: 3, slots: [{ id: 7, card_name: 'Sol Ring', categories: ['ramp', 'Good Stuff'] }] },
    })
  })
  it('rejects 0 or 6 categories, empty and over-60 names, extra user id, and 201 slots', async () => {
    const g = gw()
    const bad: unknown[] = [
      { deck_id: 1, slots: [slot([])] },
      { deck_id: 1, slots: [slot(['a', 'b', 'c', 'd', 'e', 'f'])] },
      { deck_id: 1, slots: [slot(['   '])] },
      { deck_id: 1, slots: [slot(['x'.repeat(61)])] },
      { deck_id: 1, slots: [slot(['a'])], user_id: 'o' },
      { deck_id: 1, slots: Array.from({ length: 201 }, (_, i) => ({ slot_id: i + 1, name: 'C', categories: ['a'] })) },
    ]
    for (const a of bad) expect((await runTool(ctx(g), 'set_card_category', a as Record<string, unknown>)).isError).toBe(true)
    expect(g.submit).not.toHaveBeenCalled()
    expect((await runTool(ctx(g), 'set_card_category', { deck_id: 1, slots: [slot(['a', 'b', 'c', 'd', 'e'])] })).isError).toBeFalsy()
  })
  it('a dry run surfaces the database respellings as warnings, with changes and skipped', async () => {
    const plan = { matched: [{ card: 'Sol Ring', sent: 'ramp', used: 'Ramp' }], changes: [{ slot_id: 7, card_name: 'Sol Ring', from: [], to: ['Ramp'] }], skipped: [] }
    const g = gw({ submit: async () => ({ ok: true, data: { success: true, outcome: 'would_apply', reason: null, plan } }) })
    const r = await runTool(ctx(g), 'set_card_category', { deck_id: 3, dry_run: true, slots: [slot(['ramp'])] })
    expect(r.structuredContent).toMatchObject({ ok: true, status: 'would_apply', changes: plan.changes })
    expect((r.structuredContent as { warnings: string[] }).warnings).toEqual(["Stored 'ramp' as 'Ramp' on Sol Ring, which this deck already uses."])
  })
  it('over ten is reported as pending approval', async () => {
    const g = gw({ submit: async () => ({ ok: true, data: { success: true, outcome: 'pending', pending_id: G, expires_at: 'x', reason: 'over_ten' } }) })
    const r = await runTool(ctx(g), 'set_card_category', { deck_id: 3, slots: [slot(['a'])] })
    expect(r.structuredContent).toMatchObject({ status: 'pending_approval', pending_id: G })
  })
  it.each(['category_reserved', 'slot_in_maybeboard', 'nothing_to_change'])('database refusal %s comes back by code with "Nothing was changed"', async (code) => {
    const g = gw({ submit: async () => ({ ok: false, code, detail: { card: 'Sol Ring', deck: 'Korvold', category: 'Maybeboard' } }) })
    const r = await runTool(ctx(g), 'set_card_category', { deck_id: 3, slots: [slot(['a'])] })
    expect(r.isError).toBe(true)
    expect(r.structuredContent).toMatchObject({ error: { code } })
    expect(JSON.stringify(r.structuredContent)).toMatch(/Nothing was changed/)
    expect(JSON.stringify(r.structuredContent)).not.toMatch(/could not make that change/)
  })
  it('sentences: one card, several cards, pending, ungrouped from-empty', () => {
    const row2 = (o: Partial<ChangeLogRow>) => row({ kind: 'deck_category', categories_from: ['Ramp'], categories_to: ['Ramp', 'Good Stuff'], ...o })
    expect(groupChanges([row2({})])[0].summary).toBe('Claude changed the categories of Sol Ring in Korvold from Ramp to Ramp, Good Stuff.')
    expect(groupChanges([row2({ categories_from: null })])[0].summary).toContain('from no category to')
    expect(groupChanges([row2({}), row2({ id: 'r2', card_name: 'Island' })])[0].summary).toBe('Claude changed the categories of 2 cards in Korvold.')
  })
})

describe('add_cards_to_deck refuses Maybeboard as a category', () => {
  it.each(['Maybeboard', 'maybeboard', ' Maybeboard ', 'MAYBEBOARD'])('refuses %j and submits nothing', async (category) => {
    const g = gw()
    const r = await runTool(ctx(g), 'add_cards_to_deck', { deck_id: 1, cards: [{ name: 'Sol Ring', category }] })
    expect(r.isError).toBe(true)
    expect(JSON.stringify(r.structuredContent ?? r)).toMatch(/set_card_zone/)
    expect(g.submit).not.toHaveBeenCalled()
  })
  it('still accepts a normal category', async () => {
    const g = gw()
    expect((await runTool(ctx(g), 'add_cards_to_deck', { deck_id: 1, cards: [{ name: 'Sol Ring', category: 'Ramp' }] })).isError).toBeFalsy()
  })
})

describe('CC-22 card categories', () => {
  it('stores the category passed for each card as given, and Other when none is passed', async () => {
    const g = gw()
    await runTool(ctx(g), 'add_cards_to_deck', { deck_id: 1, cards: [{ name: 'Sol Ring', category: 'Ramp' }, { name: 'Rhystic Study', category: 'Card Draw' }, { name: 'Forest' }] })
    const items = (g.submit as ReturnType<typeof vi.fn>).mock.calls[0][0].payload.items
    expect(items.map((i: { categories: string }) => i.categories)).toEqual(['["Ramp"]', '["Card Draw"]', '["Other"]'])
  })
})
describe('CC-21 deck colours', () => {
  const LIB: Record<string, string> = { 'Lightning Bolt': 'R', 'Doom Blade': 'B', 'Sol Ring': '', 'Izzet Charm': 'UR' }
  const colourCtx = (deckColours: string | null | undefined, g = gw()) => {
    const { db } = mockDb((q) => {
      if (q.table === 'decks') return { data: deckColours === undefined ? [] : [{ colour_identity: deckColours }] }
      if (q.table === 'ref_cards') {
        const names = (q.filters.find((f) => f.op === 'in')?.args[1] as string[] | undefined) ?? []
        return { data: names.filter((n) => n in LIB).map((n) => ({ name: n, type_line: 'x', oracle_text: null, mana_cost: null, mana_value: 1, color_identity: LIB[n], commander_legal: true })) }
      }
      return { data: [] }
    })
    return ctx(g, db)
  }
  const add = (c: ReturnType<typeof colourCtx>, names: string[]) => runTool(c, 'add_cards_to_deck', { deck_id: 1, cards: names.map((name) => ({ name })) }).then((r) => r.structuredContent as Record<string, unknown>)
  it('mono-red deck given a black card: still added, with a warning naming the card', async () => {
    const g = gw()
    const r = await add(colourCtx('R', g), ['Doom Blade'])
    expect(r.ok).toBe(true)
    expect(g.submit).toHaveBeenCalledTimes(1)
    expect((g.submit as ReturnType<typeof vi.fn>).mock.calls[0][0].payload.items).toHaveLength(1)
    expect(r.warnings).toEqual([expect.stringContaining('"Doom Blade" (B) is outside this deck\'s colours (R)')])
  })
  it('in-colour and colourless cards give no warning', async () => {
    const r = await add(colourCtx('R'), ['Lightning Bolt', 'Sol Ring'])
    expect(r.ok).toBe(true)
    expect(r.warnings).toBeUndefined()
    expect(r.colour_check).toBeUndefined()
  })
  it('a card partly outside the colours warns once, in a stored "R,W" style deck too', async () => {
    const r = await add(colourCtx('R,W'), ['Izzet Charm', 'Lightning Bolt'])
    expect(r.warnings).toEqual([expect.stringContaining('"Izzet Charm" (UR) is outside this deck\'s colours (WR)')])
  })
  it('a deck with no colours set: added, no warning, and the result says colours were not checked', async () => {
    for (const none of [null, '']) {
      const r = await add(colourCtx(none), ['Doom Blade'])
      expect(r.ok).toBe(true)
      expect(r.warnings).toBeUndefined()
      expect(r.colour_check).toMatch(/no colours set/)
    }
  })
  it('list_decks and get_deck show the colours in one format', async () => {
    const deck = { id: 1, name: 'D', commander_name: 'C', colour_identity: 'U,W', format: 'commander', status: 'built', bracket: null, card_count: 0, is_active: true }
    const none = { ...deck, id: 2, colour_identity: null }
    const { db } = mockDb((q) => {
      if (q.table === 'decks') return { data: q.filters.some((f) => f.op === 'eq' && f.args[0] === 'id') ? [deck] : [deck, none], count: 2 }
      return { data: [] }
    })
    const list = (await runTool(ctx(gw(), db), 'list_decks', {})).structuredContent as unknown as { items: { colourIdentity: string | null }[] }
    expect(list.items.map((d) => d.colourIdentity)).toEqual(['WU', null])
    const one = (await runTool(ctx(gw(), db), 'get_deck', { deck_id: 1 })).structuredContent as unknown as { deck: { colourIdentity: string | null } }
    expect(one.deck.colourIdentity).toBe('WU')
  })
})

describe('CC-15 create_deck and set_deck_setup', () => {
  const created = { ok: true, data: { success: true, outcome: 'applied', group_id: G, deck_id: 42, count: 1 } }
  const korvold = 'Korvold, Fae-Cursed King'
  const factsDb = mockDb((q) => ({ data: q.table === 'ref_cards' ? [{ name: korvold, type_line: 'Legendary Creature', oracle_text: '', mana_cost: '{B}{R}{G}', mana_value: 3, color_identity: 'BRG', commander_legal: true }] : [] })).db
  it('creates a deck: ids and colours of the commander go to the database, user id from the token', async () => {
    const g = gw({ createDeck: vi.fn(async () => created) })
    const r = await runTool(ctx(g, factsDb), 'create_deck', { name: 'TEST C', format: 'commander', commander: { name: korvold } })
    expect(r.isError).toBeFalsy()
    expect(g.createDeck).toHaveBeenCalledWith({
      userId: U, connectionId: 'conn-1', name: 'TEST C', format: 'commander',
      commander: { card_name: korvold, scryfall_id: 's-' + korvold, oracle_id: 'o-' + korvold, colour_identity: 'BRG' },
    })
    expect(r.structuredContent).toMatchObject({ ok: true, status: 'applied', deck_id: 42, group_id: G })
  })
  it('a Commander deck without a commander is refused before the database is called', async () => {
    const g = gw({ createDeck: vi.fn() })
    const r = await runTool(ctx(g), 'create_deck', { name: 'TEST C', format: 'commander' })
    expect(r.structuredContent).toMatchObject({ error: { code: 'commander_required' } })
    expect(g.createDeck).not.toHaveBeenCalled()
  })
  it('a non-Commander deck needs no commander', async () => {
    const g = gw({ createDeck: vi.fn(async () => created) })
    const r = await runTool(ctx(g), 'create_deck', { name: 'Pauper fun', format: 'pauper' })
    expect(r.isError).toBeFalsy()
    expect(g.createDeck).toHaveBeenCalledWith(expect.objectContaining({ commander: null }))
  })
  it.each(['user_id', 'userId', 'connection_id'])('create_deck rejects an extra %s argument', async (key) => {
    const g = gw({ createDeck: vi.fn() })
    const r = await runTool(ctx(g), 'create_deck', { name: 'x', format: 'pauper', [key]: 'other' })
    expect(r.isError).toBe(true)
    expect(g.createDeck).not.toHaveBeenCalled()
  })
  it('a duplicate name is refused in plain words with "Nothing was changed"', async () => {
    const g = gw({ createDeck: async () => ({ ok: false, code: 'deck_name_taken', detail: { name: 'TEST C' } }) })
    const r = await runTool(ctx(g), 'create_deck', { name: 'test c', format: 'pauper' })
    expect(r.structuredContent).toMatchObject({ error: { code: 'deck_name_taken' } })
    expect(JSON.stringify(r.structuredContent)).toMatch(/TEST C.*Nothing was changed/)
  })
  it('an unknown commander name refuses the request', async () => {
    const g = gw({ createDeck: vi.fn(), resolveCard: async () => ({ card: null, error: false }) })
    const r = await runTool(ctx(g), 'create_deck', { name: 'x', format: 'commander', commander: { name: 'Nope' } })
    expect(r.structuredContent).toMatchObject({ error: { code: 'card_not_found' } })
    expect(g.createDeck).not.toHaveBeenCalled()
  })
  it('sets bracket and notes in one call, sending only the keys given', async () => {
    const g = gw({ setDeckSetup: vi.fn(async () => ({ ok: true, data: { success: true, outcome: 'applied', group_id: G, count: 1, changed: { bracket: 3 } } })) })
    const r = await runTool(ctx(g), 'set_deck_setup', { deck_id: 7, bracket: 3, strategy_notes: 'Aristocrats.' })
    expect(r.isError).toBeFalsy()
    expect(g.setDeckSetup).toHaveBeenCalledWith({ userId: U, connectionId: 'conn-1', deckId: 7, patch: { bracket: 3, strategy_notes: 'Aristocrats.' } })
    expect(r.structuredContent).toMatchObject({ status: 'applied', group_id: G })
  })
  it('bracket null clears it and is sent as null', async () => {
    const g = gw({ setDeckSetup: vi.fn(async () => ({ ok: true, data: { success: true, outcome: 'no_change', count: 0 } })) })
    const r = await runTool(ctx(g), 'set_deck_setup', { deck_id: 7, bracket: null })
    expect(g.setDeckSetup).toHaveBeenCalledWith(expect.objectContaining({ patch: { bracket: null } }))
    expect(r.structuredContent).toMatchObject({ status: 'no_change' })
    expect(JSON.stringify(r.structuredContent)).toMatch(/Nothing was changed/)
  })
  it('a commander in the setup is resolved to ids', async () => {
    const g = gw({ setDeckSetup: vi.fn(async () => ({ ok: true, data: { success: true, outcome: 'applied', group_id: G, count: 1, changed: {} } })) })
    await runTool(ctx(g), 'set_deck_setup', { deck_id: 7, commander: { name: 'Prosper' } })
    expect(g.setDeckSetup).toHaveBeenCalledWith(expect.objectContaining({ patch: { commander: { card_name: 'Prosper', scryfall_id: 's-Prosper', oracle_id: 'o-Prosper' } } }))
  })
  it.each([
    ['bracket 5', { deck_id: 1, bracket: 5 }],
    ['bracket 0', { deck_id: 1, bracket: 0 }],
    ['notes over 4000', { deck_id: 1, strategy_notes: 'x'.repeat(AI_LIMITS_NEW.strategy_notes_max_chars + 1) }],
    ['no fields', { deck_id: 1 }],
    ['user_id', { deck_id: 1, bracket: 2, user_id: 'other' }],
  ])('set_deck_setup rejects %s and never reaches the database', async (_n, input) => {
    const g = gw({ setDeckSetup: vi.fn() })
    const r = await runTool(ctx(g), 'set_deck_setup', input)
    expect(r.isError).toBe(true)
    expect(g.setDeckSetup).not.toHaveBeenCalled()
  })
  it('notes of exactly 4000 characters are accepted', async () => {
    const g = gw({ setDeckSetup: vi.fn(async () => ({ ok: true, data: { success: true, outcome: 'applied', group_id: G, count: 1, changed: {} } })) })
    const r = await runTool(ctx(g), 'set_deck_setup', { deck_id: 1, strategy_notes: 'x'.repeat(AI_LIMITS_NEW.strategy_notes_max_chars) })
    expect(r.isError).toBeFalsy()
  })
  it('Claude can undo a setup change through undo_change', async () => {
    const g = gw({ undoAsClaude: vi.fn(async () => ({ ok: true, data: { success: true, undone: 1 } })) })
    const r = await runTool(ctx(g), 'undo_change', { group_id: G })
    expect(g.undoAsClaude).toHaveBeenCalledWith(U, 'conn-1', G)
    expect(r.structuredContent).toMatchObject({ status: 'undone' })
  })
  it('Claude undoing a deck creation is refused as owner-only', async () => {
    const g = gw({ undoAsClaude: async () => ({ ok: true, data: { success: false, refused: { code: 'owner_only' } } }) })
    const r = await runTool(ctx(g), 'undo_change', { group_id: G })
    expect(r.structuredContent).toMatchObject({ error: { code: 'undo_refused' } })
    expect(JSON.stringify(r.structuredContent)).toMatch(/Only you can undo.*Nothing was changed/)
  })
  it('the owner removes an empty created deck through Undo', async () => {
    const g = gw({ undoAsOwner: vi.fn(async () => ({ ok: true, data: { success: true, undone: 1 } })) })
    const r = await api.undoChange(g, U, G)
    expect(g.undoAsOwner).toHaveBeenCalledWith(U, G)
    expect(r.status).toBe(200)
  })
  it('the owner is refused in plain words once a card is on the deck', async () => {
    const g = gw({ undoAsOwner: async () => ({ ok: true, data: { success: false, refused: { code: 'deck_not_empty', deck: 'TEST C' } } }) })
    const r = await api.undoChange(g, U, G)
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ code: 'undo_refused', refused: { code: 'deck_not_empty' }, error: "Can't remove TEST C: it has a card on it now. Remove the card first or delete the deck by hand. Nothing was changed." })
  })
  it('Claude is refused the same way, ending "Nothing was changed."', async () => {
    const g = gw({ undoAsClaude: async () => ({ ok: true, data: { success: false, refused: { code: 'deck_not_empty', deck: 'TEST C' } } }) })
    const r = await runTool(ctx(g), 'undo_change', { group_id: G })
    expect(JSON.stringify(r.structuredContent)).toMatch(/Can't remove TEST C: it has a card on it now.*Nothing was changed\./)
  })
  it.each(['deck_in_use', 'deck_gone', 'changed_since', 'too_old'])('refusal %s has its own plain sentence', async (code) => {
    const { undoRefusalText } = await import('../change-sentences')
    const t = undoRefusalText({ code, deck: 'TEST C' })
    expect(t).not.toMatch(/Something changed since/)
    expect(t).toMatch(/Can't/)
  })
  it('Recent changes sentences for the two new kinds', async () => {
    const { describeGroup } = await import('../change-sentences')
    expect(describeGroup([row({ kind: 'deck_create', deck_name: 'TEST C', card_name: 'Prosper, Tome-Bound' })]).summary).toBe('Claude created the deck TEST C with Prosper, Tome-Bound as commander.')
    expect(describeGroup([row({ kind: 'deck_create', deck_name: 'TEST C', card_name: 'TEST C' })]).summary).toBe('Claude created the deck TEST C.')
    expect(describeGroup([row({ kind: 'deck_setup', deck_name: 'TEST C' })]).summary).toMatch(/^Claude changed the setup of TEST C/)
    const v = groupChanges([row({ kind: 'deck_create', owner_only: true, undo_blocker: { code: 'deck_not_empty', deck: 'TEST C' }, deck_name: 'TEST C', card_name: 'TEST C' })])
    expect(v[0]).toMatchObject({ owner_only: true, refusal_text: expect.stringMatching(/Can't remove TEST C/) })
  })
  it('tool text: new tools say what they do and that Claude cannot delete', async () => {
    const { CONNECTOR_TOOLS: TOOLS } = await import('../tools')
    const d = (n: string) => (TOOLS as unknown as { name: string; description: string }[]).find((t) => t.name === n)!.description
    expect(d('create_deck')).toMatch(/Claude cannot delete a deck/)
    expect(d('create_deck')).toMatch(/commander/)
    expect(d('set_deck_setup')).toMatch(/bracket/)
    expect(d('undo_change')).toMatch(/deck creation/)
    expect(d('list_decks')).not.toMatch(/Claude cannot\)/)
    expect(d('get_deck')).not.toMatch(/Claude cannot set it/)
  })
})
