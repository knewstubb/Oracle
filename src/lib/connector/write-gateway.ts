// The ONLY connector module (besides connection-store.ts) that may use the service-role client. Contract slice B
// section 3.3. Every call passes a user id that came from a verified token (Claude side) or the cookie session (owner
// side); the RPCs are granted to service_role only and re-check ownership of every row they touch.
import { createAdminClient } from '@/lib/supabase'
import { lookupByName, lookupByScryfallId } from '@/lib/card-lookup'
import type { ConnectionRow, ReenableRpcResult, RevokeRpcResult, ChangeAction, ChangeLogRow, CardWhyResult, DeckCreateResult, DeckSetupResult, Gateway, GatewayResult, MovedSlot, PendingRow, SubmitOutcome, UndoResult } from './write-types'

type Admin = ReturnType<typeof createAdminClient>

interface RpcError {
  message?: string
  details?: string | null
  code?: string
}

function parseDetail(details: string | null | undefined): Record<string, unknown> {
  if (!details) return {}
  try {
    const v = JSON.parse(details)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const CODE_SHAPE = /^[a-z_]{3,40}$/

/** Calls one RPC. A refusal raised by our own SQL (P0001, snake_case code) is returned as data; anything else is `rpc_failed`. */
async function rpc<T>(admin: Admin, fn: string, args: Record<string, unknown>): Promise<GatewayResult<T>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any).rpc(fn, args)
    if (error) {
      const e = error as RpcError
      if (e.code === 'P0001' && e.message && CODE_SHAPE.test(e.message)) return { ok: false, code: e.message, detail: parseDetail(e.details) }
      console.error('[connector] rpc failed', fn)
      return { ok: false, code: 'rpc_failed', detail: {} }
    }
    return { ok: true, data: data as T }
  } catch {
    console.error('[connector] rpc threw', fn)
    return { ok: false, code: 'rpc_failed', detail: {} }
  }
}

/** The reasons for these change groups. Any problem (including the table not existing yet) is "no reasons": the list still shows. */
async function readReasons(admin: Admin, userId: string, groupIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any).from('ai_change_reasons').select('group_id, reason').eq('user_id', userId).in('group_id', groupIds)
    if (error || !Array.isArray(data)) return out
    for (const row of data as { group_id: string; reason: string | null }[]) if (row.reason) out.set(row.group_id, row.reason)
  } catch { /* no reasons */ }
  return out
}
/** The reason Claude gave for each waiting request: it rides inside the stored request (payload.claude_reason). Works before the stored-data update too. */
async function readPendingReasons(admin: Admin, userId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any).from('ai_pending_changes').select('id, payload').eq('user_id', userId).in('id', ids)
    if (error || !Array.isArray(data)) return out
    for (const row of data as { id: string; payload: { claude_reason?: unknown } | null }[]) {
      const v = row.payload?.claude_reason
      if (typeof v === 'string' && v.trim()) out.set(row.id, v.trim())
    }
  } catch { /* no reasons */ }
  return out
}
export function createGateway(adminOverride?: Admin): Gateway {
  const admin = () => adminOverride ?? createAdminClient()
  return {
    async resolveCard(name, printingId) {
      try {
        if (printingId) {
          const r = await lookupByScryfallId(printingId)
          if (!r.card || r.card.name.toLowerCase() !== name.trim().toLowerCase()) return { card: null, error: false }
          return { card: { oracleId: r.card.oracle_id, scryfallId: r.card.scryfall_id, name: r.card.name, setCode: r.card.set_code } }
        }
        const r = await lookupByName(name.trim())
        if (!r.card) return { card: null, error: false }
        return { card: { oracleId: r.card.oracle_id, scryfallId: r.card.scryfall_id, name: r.card.name, setCode: r.card.set_code } }
      } catch {
        return { card: null, error: true }
      }
    },

    submit: ({ userId, connectionId, action, payload, dryRun }) =>
      rpc<SubmitOutcome>(admin(), 'ai_submit_change', { p_user_id: userId, p_connection_id: connectionId, p_action: action satisfies ChangeAction, p_payload: payload, p_dry_run: dryRun }),

    createDeck: ({ userId, connectionId, name, format, commander }) =>
      rpc<DeckCreateResult>(admin(), 'ai_create_deck', { p_user_id: userId, p_connection_id: connectionId, p_name: name, p_format: format, p_commander: commander }),
    setDeckSetup: ({ userId, connectionId, deckId, patch }) =>
      rpc<DeckSetupResult>(admin(), 'ai_set_deck_setup', { p_user_id: userId, p_connection_id: connectionId, p_deck_id: deckId, p_patch: patch }),
    setCardWhy: ({ userId, connectionId, deckId, slotId, why, whyBase }) =>
      rpc<CardWhyResult>(admin(), 'ai_set_card_why', { p_user_id: userId, p_connection_id: connectionId, p_deck_id: deckId, p_slot_id: slotId, p_why: why, p_why_base: whyBase }),
    async getPending(userId, connectionId, pendingId) {
      const r = await rpc<{ success: boolean; pending: PendingRow | null }>(admin(), 'ai_get_pending', { p_user_id: userId, p_connection_id: connectionId, p_pending_id: pendingId })
      return r.ok ? { ok: true, data: r.data?.pending ?? null } : r
    },

    recordReason: ({ userId, groupId, reason }) => rpc<{ success: boolean; stored: boolean }>(admin(), 'ai_record_change_reason', { p_user_id: userId, p_group_id: groupId, p_reason: reason }),
    async listRecent(userId) {
      const r = await rpc<ChangeLogRow[]>(admin(), 'ai_list_recent_changes', { p_user_id: userId })
      if (!r.ok || !Array.isArray(r.data) || r.data.length === 0) return r
      const reasons = await readReasons(admin(), userId, [...new Set(r.data.map((x) => x.group_id))])
      return { ok: true, data: r.data.map((x) => (reasons.has(x.group_id) ? { ...x, claude_reason: reasons.get(x.group_id) } : x)) }
    },

    undoAsClaude: (userId, connectionId, groupId) =>
      rpc<UndoResult>(admin(), 'ai_undo_group', { p_user_id: userId, p_group_id: groupId, p_actor: 'claude', p_connection_id: connectionId }),

    undoAsOwner: (userId, groupId) => rpc<UndoResult>(admin(), 'ai_undo_group', { p_user_id: userId, p_group_id: groupId, p_actor: 'owner' }),

    async listPending(userId) {
      const r = await rpc<PendingRow[]>(admin(), 'ai_list_pending', { p_user_id: userId })
      if (!r.ok || !Array.isArray(r.data) || r.data.length === 0) return r
      const reasons = await readPendingReasons(admin(), userId, r.data.map((x) => x.id))
      return { ok: true, data: r.data.map((x) => (reasons.has(x.id) ? { ...x, claude_reason: reasons.get(x.id) } : x)) }
    },

    pendingCount: (userId) => rpc<number>(admin(), 'ai_pending_count', { p_user_id: userId }),

    approve: (userId, pendingId) => rpc(admin(), 'ai_approve_pending', { p_user_id: userId, p_pending_id: pendingId }),

    decline: (userId, pendingId) => rpc(admin(), 'ai_decline_pending', { p_user_id: userId, p_pending_id: pendingId }),

    movedSlots: (userId, deckId) => rpc<MovedSlot[]>(admin(), 'ai_moved_slots', { p_user_id: userId, p_deck_id: deckId }),

    revoke: (userId, connectionId) => rpc<RevokeRpcResult>(admin(), 'revoke_connector_connection', { p_user_id: userId, p_connection_id: connectionId }),

    grantAlive: (userId, clientId) => rpc<boolean>(admin(), 'connector_grant_alive', { p_user_id: userId, p_client_id: clientId }),

    reenable: (userId, connectionId) => rpc<ReenableRpcResult>(admin(), 'reenable_connector_connection', { p_user_id: userId, p_connection_id: connectionId }),

    async latestConnection(userId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (admin() as any)
          .from('connector_connections')
          .select('id, client_id, client_name, created_at, last_used_at, revoked_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
        if (error) return { ok: false, code: 'rpc_failed', detail: {} }
        return { ok: true, data: (Array.isArray(data) && data[0] ? data[0] : null) as ConnectionRow | null }
      } catch {
        return { ok: false, code: 'rpc_failed', detail: {} }
      }
    },

    async activeConnection(userId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (admin() as any)
          .from('connector_connections')
          .select('id, client_name, created_at, last_used_at')
          .eq('user_id', userId)
          .is('revoked_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
        if (error) return { ok: false, code: 'rpc_failed', detail: {} }
        return { ok: true, data: Array.isArray(data) && data[0] ? data[0] : null }
      } catch {
        return { ok: false, code: 'rpc_failed', detail: {} }
      }
    },
  }
}
