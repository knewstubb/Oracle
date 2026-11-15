// Revocation logic (contract section 2.1, last paragraph). Order matters: mark the row revoked FIRST so access is cut
// even if the second call fails.
import { decodeJwt } from 'jose'

export interface RevokeDeps {
  getUserId: () => Promise<string | null>
  getSessionAccessToken: () => Promise<string | null>
  revokeRow: (connectionId: string, userId: string) => Promise<{ clientId: string } | { error: 'not_found' | 'failed' }>
  revokeGrant: (clientId: string) => Promise<{ error: unknown } | { error?: null }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function carriesClientId(token: string | null | undefined): boolean {
  if (!token) return false
  try {
    return decodeJwt(token).client_id !== undefined
  } catch {
    return false
  }
}

export async function processRevoke(
  req: { authorizationHeader: string | null; body: unknown },
  deps: RevokeDeps,
): Promise<{ status: number; body: { ok: boolean; error?: string; warning?: string } }> {
  // A connector (Claude) token must never be able to switch connections on or off.
  if (req.authorizationHeader) return { status: 403, body: { ok: false, error: 'Not allowed from a connector sign-in.' } }
  const userId = await deps.getUserId()
  if (!userId) return { status: 401, body: { ok: false, error: 'Unauthorized' } }
  if (carriesClientId(await deps.getSessionAccessToken())) return { status: 403, body: { ok: false, error: 'Not allowed from a connector sign-in.' } }

  const id = (req.body as { connectionId?: unknown } | null)?.connectionId
  if (typeof id !== 'string' || !UUID.test(id)) return { status: 400, body: { ok: false, error: 'connectionId is required.' } }

  const row = await deps.revokeRow(id, userId)
  if ('error' in row) {
    return row.error === 'not_found'
      ? { status: 404, body: { ok: false, error: 'No active connection with that id.' } }
      : { status: 500, body: { ok: false, error: 'Could not switch the connection off. Try again.' } }
  }
  try {
    const r = await deps.revokeGrant(row.clientId)
    if (r.error) return { status: 200, body: { ok: true, warning: 'Switched off. Claude can no longer read Oracle. Its saved sign-in may linger until it expires.' } }
  } catch {
    return { status: 200, body: { ok: true, warning: 'Switched off. Claude can no longer read Oracle. Its saved sign-in may linger until it expires.' } }
  }
  return { status: 200, body: { ok: true } }
}
