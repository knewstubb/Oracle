// Consent step logic (contract section 2.1 step 4). The user id comes from the cookie session, never from the form;
// the client id and name come from Supabase's own authorization record, never from the form either.
// Approve: insert the connection row, then approve; if approve fails the row is removed again.
export interface ConsentDeps {
  getUserId: () => Promise<string | null>
  getDetails: (authorizationId: string) => Promise<
    | { kind: 'details'; clientId: string; clientName: string }
    | { kind: 'already'; redirectUrl: string }
    | { kind: 'error' }
  >
  approve: (authorizationId: string) => Promise<{ redirectUrl: string } | { error: true }>
  deny: (authorizationId: string) => Promise<{ redirectUrl: string } | { error: true }>
  insertConnection: (userId: string, clientId: string, clientName: string) => Promise<{ id: string } | { error: true }>
  deleteConnection: (connectionId: string, userId: string) => Promise<void>
}

export type ConsentResult = { redirectTo: string } | { error: 'unauthenticated' | 'invalid' | 'failed' }

const AUTH_ID = /^[A-Za-z0-9_-]{1,200}$/

export function isValidAuthorizationId(v: unknown): v is string {
  return typeof v === 'string' && AUTH_ID.test(v)
}

export async function processConsent(decision: 'allow' | 'deny', authorizationId: unknown, deps: ConsentDeps): Promise<ConsentResult> {
  if (!isValidAuthorizationId(authorizationId)) return { error: 'invalid' }
  const userId = await deps.getUserId()
  if (!userId) return { error: 'unauthenticated' }

  if (decision === 'deny') {
    const d = await deps.deny(authorizationId)
    return 'error' in d ? { error: 'failed' } : { redirectTo: d.redirectUrl }
  }

  const details = await deps.getDetails(authorizationId)
  if (details.kind === 'error') return { error: 'failed' }
  if (details.kind === 'already') return { redirectTo: details.redirectUrl }

  const row = await deps.insertConnection(userId, details.clientId, details.clientName)
  if ('error' in row) return { error: 'failed' }
  const approved = await deps.approve(authorizationId)
  if ('error' in approved) {
    await deps.deleteConnection(row.id, userId)
    return { error: 'failed' }
  }
  return { redirectTo: approved.redirectUrl }
}
