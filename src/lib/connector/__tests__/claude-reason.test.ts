/* eslint-disable @typescript-eslint/no-explicit-any -- test results are inspected loosely */
// DV-04: one line of reason on every Claude change. Required by every write tool, stored with the change, returned to Claude and to the owner,
// and never mixed up with the approval-hold reason (over_ten, recent_total, busy, card_move).
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runTool } from '../server'
import { CONNECTOR_TOOLS } from '../tools'
import { mockDb } from './mock-db'
import { REASON_MAX } from '../change-reason'
import { createGateway } from '../write-gateway'
import * as api from '../owner-api'
import { groupChanges } from '../change-groups'
import type { ChangeLogRow, Gateway, PendingRow } from '../write-types'
vi.mock('../../card-data', () => ({ getOwnedPrintingsByNames: async () => new Map<string, string>() }))
const U = 'user-1'
const G = '11111111-2222-4333-8444-555555555555'
const REASON = 'The deck is two mana sources under its target.'
function gw(over: Partial<Record<keyof Gateway, unknown>> = {}): Gateway {
  const base: Record<string, unknown> = {
    resolveCard: async (n: string) => ({ card: { oracleId: 'o-' + n, scryfallId: 's-' + n, name: n, setCode: 'cmm' } }),
    submit: vi.fn(async () => ({ ok: true, data: { success: true, outcome: 'applied', group_id: G, count: 1 } })),
    createDeck: vi.fn(async () => ({ ok: true, data: { success: true, outcome: 'applied', group_id: G, deck_id: 42, count: 1 } })),
    setDeckSetup: vi.fn(async () => ({ ok: true, data: { success: true, outcome: 'applied', group_id: G, count: 1, changed: {} } })),
    recordReason: vi.fn(async () => ({ ok: true, data: { success: true, stored: true } })),
    getPending: async () => ({ ok: true, data: null }),
    listRecent: vi.fn(),
  }
  return { ...base, ...over } as unknown as Gateway
}
const ctx = (gateway: Gateway, db = mockDb(() => ({ data: [] })).db) => ({ db, userId: U, connectionId: 'conn-1', clientId: 'cl', clientName: 'Claude', gateway })
const slot = { slot_id: 7, name: 'Sol Ring' }
// One valid request per write tool (without the reason).
const REQUESTS: [string, Record<string, unknown>][] = [
  ['add_cards_to_deck', { deck_id: 3, cards: [{ name: 'Sol Ring' }] }],
  ['remove_cards_from_deck', { deck_id: 3, slots: [slot] }],
  ['set_card_zone', { deck_id: 3, slots: [slot], to: 'maybeboard' }],
  ['set_card_category', { deck_id: 3, slots: [{ ...slot, categories: ['Ramp'] }] }],
  ['add_card_to_collection', { name: 'Sol Ring' }],
  ['sleeve_free_copy', { deck_id: 3, copy_id: 9, name: 'Sol Ring' }],
  ['make_slot_original', { deck_id: 3, slot_id: 7, name: 'Sol Ring', original_copy_id: 9 }],
  ['create_proxy_for_slot', { deck_id: 3, slot_id: 7, name: 'Sol Ring' }],
  ['request_card_move', { copy_id: 9, name: 'Sol Ring', to_deck_id: 6 }],
  ['create_deck', { name: 'New deck', format: 'pauper' }],
  ['set_deck_setup', { deck_id: 7, bracket: 3 }],
]
const copyDb = () => mockDb((q) => {
  if (q.table === 'user_copies') return { data: [{ id: 9, card_id: 1 }] }
  if (q.table === 'user_cards') return { data: [{ card_name: 'Sol Ring' }] }
  if (q.table === 'deck_cards') return { data: [{ id: 77, deck_id: 5 }] }
  return { data: [] }
}).db
describe('a reason is required by every Claude write tool', () => {
  it('there are eleven write tools and every one has a required, described "reason" input', () => {
    const writeTools = CONNECTOR_TOOLS.filter((t) => REQUESTS.some(([n]) => n === t.name))
    expect(writeTools).toHaveLength(REQUESTS.length)
    for (const t of writeTools) {
      const shape = (t.inputSchema as any)._zod?.def?.shape ?? (t.inputSchema as any).shape ?? (t.inputSchema as any)._zod?.def?.in?._zod?.def?.shape
      expect(Object.keys(shape ?? {}), t.name).toContain('reason')
    }
  })
  it.each(REQUESTS)('%s: with a reason it goes through', async (name, args) => {
    const g = gw()
    const r = await runTool(ctx(g, copyDb()), name, { ...args, reason: REASON })
    expect(r.isError, JSON.stringify(r.structuredContent)).toBeFalsy()
  })
  it.each(REQUESTS)('%s: without a reason it is refused with a plain message that says what to send, and nothing reaches the database', async (name, args) => {
    const g = gw()
    const r = await runTool(ctx(g, copyDb()), name, args)
    expect(r.isError).toBe(true)
    const text = JSON.stringify(r.structuredContent)
    expect(text).toMatch(/Send \\"reason\\": one plain sentence/)
    expect(text).toMatch(/at most 200 characters/)
    expect(text).toMatch(/Nothing was changed/)
    for (const fn of ['submit', 'createDeck', 'setDeckSetup', 'recordReason'] as const) expect((g as any)[fn]).not.toHaveBeenCalled()
  })
  it.each(['', '   ', 5, null, ['a'], 'line one\nline two', 'x'.repeat(REASON_MAX + 1)])('an empty, blank, non-text, multi-line or over-long reason (%j) is refused', async (bad) => {
    const g = gw()
    const r = await runTool(ctx(g), 'add_cards_to_deck', { deck_id: 3, cards: [{ name: 'Sol Ring' }], reason: bad })
    expect(r.isError).toBe(true)
    expect(JSON.stringify(r.structuredContent)).toMatch(/Nothing was changed/)
    expect(g.submit).not.toHaveBeenCalled()
  })
  it('exactly 200 characters is accepted, and spaces around the reason are trimmed', async () => {
    const g = gw()
    expect((await runTool(ctx(g), 'add_cards_to_deck', { deck_id: 3, cards: [{ name: 'Sol Ring' }], reason: 'y'.repeat(REASON_MAX) })).isError).toBeFalsy()
    await runTool(ctx(g), 'add_cards_to_deck', { deck_id: 3, cards: [{ name: 'Sol Ring' }], reason: '  Spaces around.  ' })
    expect((g.submit as any).mock.calls[1][0].payload.claude_reason).toBe('Spaces around.')
  })
  it('a dry run needs a reason too (one rule for every write tool)', async () => {
    const g = gw()
    const r = await runTool(ctx(g), 'add_cards_to_deck', { deck_id: 3, cards: [{ name: 'Sol Ring' }], dry_run: true })
    expect(r.isError).toBe(true)
  })
  it('undo_change, change status and the read tools do not take a reason', async () => {
    for (const n of ['undo_change', 'get_change_status', 'list_recent_changes']) {
      const t = CONNECTOR_TOOLS.find((x) => x.name === n)
      if (!t) continue
      const shape = (t.inputSchema as any)._zod?.def?.shape ?? (t.inputSchema as any).shape ?? {}
      expect(Object.keys(shape), n).not.toContain('reason')
    }
  })
  it("every write tool's description tells Claude to give a one-sentence plain reason, and says the owner sees it", () => {
    for (const [n] of REQUESTS) {
      const d = CONNECTOR_TOOLS.find((t) => t.name === n)!.description
      expect(d, n).toMatch(/reason: one plain sentence/)
      expect(d, n).toMatch(/Changed by Claude/)
    }
  })
})
describe('the reason is stored with every Claude write path', () => {
  it.each([
    ['add_cards_to_deck', { deck_id: 3, cards: [{ name: 'Sol Ring' }] }],
    ['remove_cards_from_deck', { deck_id: 3, slots: [slot] }],
    ['set_card_zone', { deck_id: 3, slots: [slot], to: 'main' }],
    ['set_card_category', { deck_id: 3, slots: [{ ...slot, categories: ['Ramp'] }] }],
    ['add_card_to_collection', { name: 'Sol Ring' }],
    ['sleeve_free_copy', { deck_id: 3, copy_id: 9, name: 'Sol Ring' }],
    ['make_slot_original', { deck_id: 3, slot_id: 7, name: 'Sol Ring', original_copy_id: 9 }],
    ['create_proxy_for_slot', { deck_id: 3, slot_id: 7, name: 'Sol Ring' }],
    ['request_card_move', { copy_id: 9, name: 'Sol Ring', to_deck_id: 6 }],
  ] as [string, Record<string, unknown>][])('%s sends the reason inside the request (the database stores it with the change, or keeps it for the owner\'s yes)', async (name, args) => {
    const g = gw()
    await runTool(ctx(g, copyDb()), name, { ...args, reason: REASON })
    expect((g.submit as any).mock.calls[0][0].payload.claude_reason).toBe(REASON)
  })
  it('create_deck stores the reason for the new deck\'s change group right after it is made', async () => {
    const g = gw()
    const r = await runTool(ctx(g), 'create_deck', { name: 'New deck', format: 'pauper', reason: 'The owner asked for a Friday pod deck.' })
    expect((g.recordReason as any).mock.calls[0][0]).toEqual({ userId: U, groupId: G, reason: 'The owner asked for a Friday pod deck.' })
    expect((r.structuredContent as any).reason_note).toBeUndefined()
  })
  it('set_deck_setup (the Strategy rewrite path) stores the reason for its change group', async () => {
    const g = gw()
    const db = mockDb((q) => ({ data: q.table === 'deck_strategy' ? [{ strategy_notes: 'Mine.', updated_at: '2026-11-19T10:00:00Z' }] : [] })).db
    const r = await runTool(ctx(g, db), 'set_deck_setup', { deck_id: 7, strategy: 'Mine. Needs more sacrifice outlets.', based_on: '2026-11-19T10:00:00Z', reason: 'The graveyard plan needs outlets.' })
    expect(r.isError).toBeFalsy()
    expect((g.recordReason as any).mock.calls[0][0]).toEqual({ userId: U, groupId: G, reason: 'The graveyard plan needs outlets.' })
    // the reason is not smuggled into the Strategy text or the patch
    expect(JSON.stringify((g.setDeckSetup as any).mock.calls[0][0].patch)).not.toMatch(/graveyard plan needs outlets/)
  })
  it('a set_deck_setup that changes nothing stores no reason', async () => {
    const g = gw({ setDeckSetup: vi.fn(async () => ({ ok: true, data: { success: true, outcome: 'no_change', count: 0 } })) })
    await runTool(ctx(g), 'set_deck_setup', { deck_id: 7, bracket: 3, reason: 'Nothing to say.' })
    expect(g.recordReason).not.toHaveBeenCalled()
  })
})
describe('before the stored-data update the app keeps working and says so plainly', () => {
  const noTable = mockDb((q) => (q.table === 'ai_change_reasons' ? { error: { message: 'relation "public.ai_change_reasons" does not exist' } } : { data: [] })).db
  const down = mockDb((q) => (q.table === 'ai_change_reasons' ? { error: { message: 'connection reset' } } : { data: [] })).db
  it('a deck change is still made, and the answer says the reason could not be saved yet', async () => {
    const g = gw()
    const r = await runTool(ctx(g, noTable), 'add_cards_to_deck', { deck_id: 3, cards: [{ name: 'Sol Ring' }], reason: REASON })
    expect(r.isError).toBeFalsy()
    expect(g.submit).toHaveBeenCalledTimes(1)
    expect((r.structuredContent as any).status).toBe('applied')
    expect((r.structuredContent as any).reason_note).toMatch(/change was made, but its reason could not be saved.*has not been updated for reasons/)
  })
  it('create_deck and set_deck_setup are made too, no reason call is attempted, and the note is there', async () => {
    const g = gw()
    const a = await runTool(ctx(g, noTable), 'create_deck', { name: 'New deck', format: 'pauper', reason: REASON })
    const b = await runTool(ctx(g, noTable), 'set_deck_setup', { deck_id: 7, bracket: 3, reason: REASON })
    expect((a.structuredContent as any).status).toBe('applied')
    expect((b.structuredContent as any).status).toBe('applied')
    expect((a.structuredContent as any).reason_note).toMatch(/could not be saved/)
    expect((b.structuredContent as any).reason_note).toMatch(/could not be saved/)
    expect(g.recordReason).not.toHaveBeenCalled()
  })
  it('a request that waits for the owner says its reason cannot be kept for them yet', async () => {
    const g = gw({ submit: vi.fn(async () => ({ ok: true, data: { success: true, outcome: 'pending', pending_id: 'p', expires_at: 'x', reason: 'over_ten' } })) })
    const r = await runTool(ctx(g, noTable), 'remove_cards_from_deck', { deck_id: 3, slots: [slot], reason: REASON })
    expect((r.structuredContent as any).status).toBe('pending_approval')
    expect((r.structuredContent as any).reason).toBe('over_ten') // the hold reason stays its own field
    expect((r.structuredContent as any).reason_note).toMatch(/waiting for the owner, but its reason cannot be kept/)
  })
  it('a passing failure says "just now" instead of "not updated"; a failed recording never undoes the change', async () => {
    const g = gw({ recordReason: vi.fn(async () => ({ ok: false, code: 'rpc_failed', detail: {} })) })
    const a = await runTool(ctx(g, down), 'add_cards_to_deck', { deck_id: 3, cards: [{ name: 'Sol Ring' }], reason: REASON })
    expect((a.structuredContent as any).reason_note).toMatch(/Oracle could not save it just now/)
    const b = await runTool(ctx(g), 'create_deck', { name: 'New deck', format: 'pauper', reason: REASON })
    expect((b.structuredContent as any).status).toBe('applied')
    expect((b.structuredContent as any).reason_note).toMatch(/Oracle could not save it just now/)
  })
  it('a dry run adds no note (nothing is stored)', async () => {
    const g = gw({ submit: vi.fn(async () => ({ ok: true, data: { success: true, outcome: 'would_apply', reason: null } })) })
    const r = await runTool(ctx(g, noTable), 'add_cards_to_deck', { deck_id: 3, cards: [{ name: 'Sol Ring' }], reason: REASON, dry_run: true })
    expect((r.structuredContent as any).reason_note).toBeUndefined()
  })
  it('the reason table is read with the owner id, like every other query', async () => {
    const { db, queries } = mockDb(() => ({ data: [] }))
    await runTool(ctx(gw(), db), 'add_cards_to_deck', { deck_id: 3, cards: [{ name: 'Sol Ring' }], reason: REASON })
    const q = queries.find((x) => x.table === 'ai_change_reasons')!
    expect(q.filters.some((f) => f.op === 'eq' && f.args[0] === 'user_id' && f.args[1] === U)).toBe(true)
  })
})
const logRow = (over: Partial<ChangeLogRow> = {}): ChangeLogRow => ({
  id: 'r1', group_id: 'g1', kind: 'deck_add', client_name: 'Claude', deck_id: 7, deck_name: 'Yedora', other_deck_id: null, other_deck_name: null,
  card_name: 'Arcane Signet', oracle_id: null, printing_id: null, approved_by_owner: false, created_at: '2026-11-19T10:00:00Z', undoable_until: '2026-11-26T10:00:00Z',
  undone_at: null, undone_by: null, owner_only: false, undo_blocker: null, ...over,
} as ChangeLogRow)
/** A stand-in for the database client: rpc answers, and from() answers the reason table. */
function fakeAdmin(opts: { rows?: unknown; reasons?: { data?: unknown; error?: unknown }; pending?: unknown; pendingPayloads?: { data?: unknown; error?: unknown } }) {
  const from = vi.fn((table: string) => {
    const result = table === 'ai_change_reasons' ? (opts.reasons ?? { data: [] }) : (opts.pendingPayloads ?? { data: [] })
    const chain: any = { select: () => chain, eq: () => chain, in: () => Promise.resolve({ data: null, error: null, ...result }) }
    return chain
  })
  const rpc = vi.fn(async (fn: string) => ({ data: fn === 'ai_list_recent_changes' ? opts.rows : opts.pending, error: null }))
  return { admin: { rpc, from } as any, from, rpc }
}
describe('the owner sees the reason beside the change (Recent changes and History read the same list)', () => {
  it('listRecent attaches each group\'s reason; a group without one stays as it was', async () => {
    const { admin } = fakeAdmin({ rows: [logRow(), logRow({ id: 'r2', group_id: 'g2', card_name: 'Old card' })], reasons: { data: [{ group_id: 'g1', reason: REASON }] } })
    const r = await createGateway(admin).listRecent(U)
    expect(r.ok && r.data.map((x) => x.claude_reason ?? null)).toEqual([REASON, null])
  })
  it('older changes (no reasons stored yet, or the table missing) still list, with no reason and no error', async () => {
    const { admin } = fakeAdmin({ rows: [logRow()], reasons: { error: { message: 'relation "ai_change_reasons" does not exist' } } })
    const r = await createGateway(admin).listRecent(U)
    expect(r.ok).toBe(true)
    expect(r.ok && r.data[0].claude_reason).toBeUndefined()
  })
  it('the group view carries the reason, and the Claude tool list_recent_changes returns it (only when there is one)', async () => {
    const rows = [logRow({ claude_reason: REASON }), logRow({ id: 'r2', group_id: 'g2', claude_reason: null })]
    expect(groupChanges(rows).map((g) => g.claude_reason ?? null)).toEqual([REASON, null])
    const g = gw({ listRecent: vi.fn(async () => ({ ok: true, data: rows })) })
    const out = (await runTool(ctx(g), 'list_recent_changes', {})).structuredContent as any
    expect(out.changes[0].reason).toBe(REASON)
    expect('reason' in out.changes[1]).toBe(false)
  })
  it('waiting requests: the reason comes from the stored request and is separate from the hold reason', async () => {
    const pending = { id: 'p1', kind: 'big_edit', action: 'deck_remove', reason: 'over_ten', deck_id: 7, deck_name: 'Yedora', other_deck_id: null, other_deck_name: null, card_count: 15, preview: { cards: [], decks: [] }, status: 'waiting', client_name: 'Claude', created_at: 'x', expires_at: 'y', decided_at: null, failure_reason: null, cancel_reason: null }
    const { admin } = fakeAdmin({ pending: [pending], pendingPayloads: { data: [{ id: 'p1', payload: { deck_id: 7, claude_reason: REASON } }] } })
    const r = await createGateway(admin).listPending(U)
    expect(r.ok && (r.data[0] as PendingRow).claude_reason).toBe(REASON)
    const view = api.pendingView((r as any).data[0])
    expect(view.claude_reason).toBe(REASON)
    expect(view.reason).toBe('over_ten')
  })
  it('a waiting request without a reason (or when the stored request cannot be read) still lists', async () => {
    const pending = { id: 'p1', kind: 'copy_move', action: 'copy_move', reason: 'card_move', card_count: 1, preview: { cards: [], decks: [] }, status: 'waiting' }
    const { admin } = fakeAdmin({ pending: [pending], pendingPayloads: { error: { message: 'down' } } })
    const r = await createGateway(admin).listPending(U)
    expect(r.ok && (r.data[0] as PendingRow).claude_reason).toBeUndefined()
    expect(api.pendingView((r as any).data[0]).claude_reason).toBeNull()
  })
  it('recordReason calls the database function with the owner id from the token', async () => {
    const { admin, rpc } = fakeAdmin({})
    await createGateway(admin).recordReason({ userId: U, groupId: G, reason: REASON })
    expect(rpc).toHaveBeenCalledWith('ai_record_change_reason', { p_user_id: U, p_group_id: G, p_reason: REASON })
  })
})
describe('one History per deck reads the one change list, filtered to the deck', () => {
  const rows = [
    logRow({ group_id: 'a', deck_id: 7, claude_reason: REASON }),
    logRow({ id: 'r2', group_id: 'b', deck_id: 8, deck_name: 'Prosper' }),
    logRow({ id: 'r3', group_id: 'c', kind: 'copy_move', deck_id: 8, other_deck_id: 7 }),
  ]
  it('without a deck every change is listed; with a deck only the changes touching it (including a move into it)', async () => {
    const g = gw({ listRecent: vi.fn(async () => ({ ok: true, data: rows })) })
    const all = await api.listChanges(g, U)
    const one = await api.listChanges(g, U, 7)
    expect((all.body as any).changes.map((c: any) => c.group_id)).toEqual(['a', 'b', 'c'])
    expect((one.body as any).changes.map((c: any) => c.group_id)).toEqual(['a', 'c'])
    expect((one.body as any).changes[0].claude_reason).toBe(REASON)
  })
})
describe('the draft keeps the same limit as the tool', () => {
  it('the reason limit equals the table check in the S4 draft, the draft has a rollback, and the hold reason column is not reused', () => {
    const dir = path.resolve(__dirname, '../../../../supabase/drafts')
    const draft = readFileSync(path.join(dir, '20261119110000_s4_claude_change_reason.draft.sql'), 'utf8')
    const rollback = readFileSync(path.join(dir, '20261119110000_s4_claude_change_reason.rollback.sql'), 'utf8')
    expect(draft).toContain(`BETWEEN 1 AND ${REASON_MAX}`)
    expect(draft).toMatch(/DRAFT\. NOT APPLIED/)
    expect(rollback).toMatch(/NOT APPLIED/)
    expect(draft).not.toMatch(/ALTER TABLE public\.ai_pending_changes/)
    expect(draft).not.toMatch(/ALTER TABLE public\.ai_change_log/)
  })
})
