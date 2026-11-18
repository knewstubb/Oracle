/**
 * Server side of the card window's stored roles (slice 2). Calls the database functions from the contract
 * (service role only), always passing the signed-in user's id. Nothing here trusts an id from the request.
 */
import type { StoredRoleRow, StoredRoles, RoleSlug, OwnerRoleAction } from './card-window-stored-roles'

type RpcResult = { data: unknown; error: { message: string } | null }
export interface RolesRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The card identity (oracle_id) of one deck slot, or null when it can't be matched. */
export async function slotOracleId(
  client: RolesRpcClient,
  userId: string,
  deckId: number,
  slotId: number,
): Promise<{ oracleId: string | null; error: string | null }> {
  const { data, error } = await client.rpc('_slot_oracle_id', { p_user_id: userId, p_deck_id: deckId, p_slot_id: slotId })
  if (error) return { oracleId: null, error: error.message }
  return { oracleId: typeof data === 'string' && UUID.test(data) ? data : null, error: null }
}

/** The stored roles for the card, never throwing: a failed read is { status: 'error' }, not an empty answer (D-030). */
export async function loadStoredRoles(
  client: RolesRpcClient,
  userId: string,
  deckId: number,
  slotId: number,
): Promise<StoredRoles> {
  const id = await slotOracleId(client, userId, deckId, slotId)
  if (id.error) return { status: 'error' }
  if (!id.oracleId) return { status: 'no_identity' }
  const { data, error } = await client.rpc('get_effective_card_roles', { p_user_id: userId, p_oracle_ids: [id.oracleId] })
  if (error || !Array.isArray(data)) return { status: 'error' }
  const rows = (data as Array<StoredRoleRow & { oracle_id: string }>)
    .filter((r) => r.oracle_id === id.oracleId)
    .map((r) => ({
      role: r.role,
      in_baseline: r.in_baseline,
      owner_effect: r.owner_effect,
      claude_effect: r.claude_effect,
      claude_state: r.claude_state,
      effective: r.effective,
      effective_from: r.effective_from,
      beside: r.beside,
    }))
  return { status: 'ok', oracleId: id.oracleId, rows }
}

export type OwnerRoleWrite =
  | { ok: true; previous: { owner_effect: 'add' | 'remove' | null }; current: { owner_effect: 'add' | 'remove' | null } }
  | { ok: false; code: 'unknown_role' | 'bad_action' | 'unknown_card' | 'failed' }

/** owner_set_card_role: add, remove or clear one role for the signed-in user. Returns the previous value for Undo. */
export async function writeOwnerRole(
  client: RolesRpcClient,
  userId: string,
  oracleId: string,
  role: RoleSlug,
  action: OwnerRoleAction,
): Promise<OwnerRoleWrite> {
  const { data, error } = await client.rpc('owner_set_card_role', { p_user_id: userId, p_oracle_id: oracleId, p_role: role, p_action: action })
  if (error) {
    const code = (['unknown_role', 'bad_action', 'unknown_card'] as const).find((c) => error.message.includes(c))
    return { ok: false, code: code ?? 'failed' }
  }
  const d = data as { previous?: { owner_effect?: 'add' | 'remove' | null }; current?: { owner_effect?: 'add' | 'remove' | null } } | null
  if (!d?.previous || !d.current) return { ok: false, code: 'failed' }
  return { ok: true, previous: { owner_effect: d.previous.owner_effect ?? null }, current: { owner_effect: d.current.owner_effect ?? null } }
}
