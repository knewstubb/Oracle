// The ONLY connector module allowed to use the service-role client. It touches connector_connections (connection
// metadata, not user data) and every statement is filtered by the verified user id. Contract sections 4 and 6.
import { createAdminClient } from '@/lib/supabase'

export type ConnectionCheck =
  | { status: 'active'; connectionId: string; clientName: string }
  | { status: 'revoked' }
  | { status: 'error' }

type Admin = ReturnType<typeof createAdminClient>

// Loosely typed: the table is not in the generated types until the migration is applied.
function table(admin: Admin) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (admin as any).from('connector_connections')
}

/** Per-request off-switch check. Fails closed: any error is `error`, never `active`. */
export async function checkConnection(userId: string, clientId: string, admin?: Admin): Promise<ConnectionCheck> {
  try {
    const { data, error } = await table(admin ?? createAdminClient())
      .select('id, client_name')
      .eq('user_id', userId)
      .eq('client_id', clientId)
      .is('revoked_at', null)
      .limit(1)
    if (error) return { status: 'error' }
    const row = Array.isArray(data) ? data[0] : null
    return row?.id ? { status: 'active', connectionId: row.id as string, clientName: typeof row.client_name === 'string' && row.client_name ? row.client_name : 'Claude' } : { status: 'revoked' }
  } catch {
    return { status: 'error' }
  }
}

/** Best effort, at most once a minute per connection. Never throws. */
export async function touchConnection(connectionId: string, userId: string, admin?: Admin): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 60_000).toISOString()
    const { error } = await table(admin ?? createAdminClient())
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', connectionId)
      .eq('user_id', userId)
      .or(`last_used_at.is.null,last_used_at.lt.${cutoff}`)
    if (error) console.error('[connector] last_used_at update failed')
  } catch {
    console.error('[connector] last_used_at update failed')
  }
}

export async function insertConnection(
  userId: string,
  clientId: string,
  clientName: string,
  admin?: Admin,
): Promise<{ id: string } | { error: true }> {
  try {
    const { data, error } = await table(admin ?? createAdminClient())
      .insert({ user_id: userId, client_id: clientId, client_name: clientName })
      .select('id')
      .single()
    if (error || !data?.id) return { error: true }
    return { id: data.id as string }
  } catch {
    return { error: true }
  }
}

/** Compensation for a failed approval: remove the row that was just inserted. */
export async function deleteConnection(connectionId: string, userId: string, admin?: Admin): Promise<void> {
  try {
    await table(admin ?? createAdminClient()).delete().eq('id', connectionId).eq('user_id', userId)
  } catch {
    console.error('[connector] could not remove connection row')
  }
}

/** Marks the caller's own active connection revoked. Returns its client id, or an error. */
export async function revokeConnection(
  connectionId: string,
  userId: string,
  admin?: Admin,
): Promise<{ clientId: string } | { error: 'not_found' | 'failed' }> {
  try {
    const { data, error } = await table(admin ?? createAdminClient())
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', connectionId)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .select('client_id')
    if (error) return { error: 'failed' }
    const row = Array.isArray(data) ? data[0] : null
    return row?.client_id ? { clientId: row.client_id as string } : { error: 'not_found' }
  } catch {
    return { error: 'failed' }
  }
}
