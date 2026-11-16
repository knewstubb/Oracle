// Logic of the owner-only routes, kept apart from Next so tests can call it with a mock gateway.
// Every function takes the user id from the cookie session (never from the request) and returns { status, body }.
import { groupChanges } from './change-groups'
import { movedSlotSentence, pendingEndedText, pendingSummary, pendingTitle, staleText, undoRefusalText } from './change-sentences'
import type { ApiFailure, ChangesResponse, DecideResponse, MovedSlotsResponse, PendingCountResponse, PendingItemView, PendingResponse, StatusResponse, UndoResponse } from './api-types'
import type { Gateway, GatewayFailure, PendingRow } from './write-types'

export interface Reply<T = unknown> {
  status: number
  body: T | ApiFailure
}

const DB_DOWN: ApiFailure = { ok: false, error: 'Oracle could not reach the database just now. Nothing was changed. Try again.', code: 'rpc_failed' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s)

function dbFail(f: GatewayFailure): Reply<never> {
  if (f.code === 'pending_not_found' || f.code === 'change_not_found') return { status: 404, body: { ok: false, error: 'That one is not in your Oracle any more.', code: f.code } }
  return { status: 503, body: DB_DOWN }
}

export function pendingView(p: PendingRow): PendingItemView {
  return {
    id: p.id,
    kind: p.kind,
    action: p.action,
    reason: p.reason,
    deck_id: p.deck_id,
    deck_name: p.deck_name,
    other_deck_id: p.other_deck_id,
    other_deck_name: p.other_deck_name,
    card_count: p.card_count,
    preview: p.preview,
    status: p.status,
    client_name: p.client_name,
    created_at: p.created_at,
    expires_at: p.expires_at,
    decided_at: p.decided_at,
    failure_reason: p.status === 'failed' ? staleText(p.failure_reason) : null,
    cancel_reason: p.status === 'cancelled' ? (pendingEndedText(p) ?? null) : null,
    title: pendingTitle(p),
    summary: pendingSummary(p),
  }
}

export async function listChanges(g: Gateway, userId: string): Promise<Reply<ChangesResponse>> {
  const r = await g.listRecent(userId)
  if (!r.ok) return dbFail(r)
  return { status: 200, body: { ok: true, changes: groupChanges(r.data) } }
}

export async function undoChange(g: Gateway, userId: string, groupId: string): Promise<Reply<UndoResponse>> {
  if (!isUuid(groupId)) return { status: 400, body: { ok: false, error: 'That is not a change id.', code: 'invalid_request' } }
  const r = await g.undoAsOwner(userId, groupId)
  if (!r.ok) return dbFail(r)
  if (r.data.success) return { status: 200, body: { ok: true, success: true, undone: r.data.undone, summary: r.data.undone === 1 ? 'Undone. It is back as it was.' : `Undone. All ${r.data.undone} cards are back as they were.` } }
  const refused = r.data.refused
  return { status: 409, body: { ok: false, success: false, refused, error: `${undoRefusalText(refused)} Nothing was changed.`, code: 'undo_refused' } }
}

export async function listPending(g: Gateway, userId: string): Promise<Reply<PendingResponse>> {
  const r = await g.listPending(userId)
  if (!r.ok) return dbFail(r)
  return { status: 200, body: { ok: true, pending: r.data.map(pendingView) } }
}

export async function pendingCount(g: Gateway, userId: string): Promise<Reply<PendingCountResponse>> {
  const r = await g.pendingCount(userId)
  if (!r.ok) return dbFail(r)
  return { status: 200, body: { ok: true, count: r.data } }
}

function endedReply(outcome: 'expired' | 'declined' | 'cancelled' | 'failed' | 'approved', row: PendingRow | undefined, reason: { code?: string; card?: string; deck?: string } | null | undefined): Reply<DecideResponse> {
  let text: string
  if (outcome === 'failed') text = `Couldn't apply. ${staleText(reason ?? row?.failure_reason)}. Nothing was changed. Ask Claude again.`
  else if (outcome === 'approved') text = 'That was already approved.'
  else text = pendingEndedText({ status: outcome, failure_reason: null, cancel_reason: row?.cancel_reason ?? 'switched_off', decided_at: row?.decided_at ?? null, expires_at: row?.expires_at ?? '' }) ?? 'That request has ended.'
  return { status: 409, body: { ok: false, outcome, reason: text, error: text, code: 'pending_ended' } }
}

export async function approvePending(g: Gateway, userId: string, id: string): Promise<Reply<DecideResponse>> {
  if (!isUuid(id)) return { status: 400, body: { ok: false, error: 'That is not a request id.', code: 'invalid_request' } }
  const before = await g.listPending(userId)
  const row = before.ok ? before.data.find((p) => p.id === id) : undefined
  const r = await g.approve(userId, id)
  if (!r.ok) return dbFail(r)
  if (r.data.success) {
    const summary = row ? `Done. ${row.action === 'copy_move' ? 'The copy was moved.' : `${r.data.count} ${r.data.count === 1 ? 'card' : 'cards'} changed.`} You can undo it from Recent changes.` : 'Done. You can undo it from Recent changes.'
    return { status: 200, body: { ok: true, outcome: 'approved', summary, group_id: r.data.group_id, count: r.data.count } }
  }
  return endedReply(r.data.outcome, row, r.data.reason)
}

export async function declinePending(g: Gateway, userId: string, id: string): Promise<Reply<DecideResponse>> {
  if (!isUuid(id)) return { status: 400, body: { ok: false, error: 'That is not a request id.', code: 'invalid_request' } }
  const r = await g.decline(userId, id)
  if (!r.ok) return dbFail(r)
  if (r.data.success) return { status: 200, body: { ok: true, outcome: 'declined', summary: 'You said no. Nothing changed.' } }
  const o = r.data.outcome
  return endedReply(o === 'expired' || o === 'cancelled' || o === 'failed' || o === 'approved' ? o : 'declined', undefined, null)
}

export async function movedSlots(g: Gateway, userId: string, deckIdRaw: string | null): Promise<Reply<MovedSlotsResponse>> {
  const deckId = Number(deckIdRaw)
  if (!deckIdRaw || !Number.isInteger(deckId) || deckId <= 0) return { status: 400, body: { ok: false, error: 'deckId is required.', code: 'invalid_request' } }
  const r = await g.movedSlots(userId, deckId)
  if (!r.ok) return dbFail(r)
  return { status: 200, body: { ok: true, moved: r.data.map((m) => ({ ...m, sentence: movedSlotSentence(m) })) } }
}

export async function connectionStatus(g: Gateway, userId: string, email: string | null): Promise<Reply<StatusResponse>> {
  const r = await g.activeConnection(userId)
  if (!r.ok) return dbFail(r)
  return { status: 200, body: { ok: true, connected: !!r.data, connection: r.data, email } }
}
