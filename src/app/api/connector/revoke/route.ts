import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { createAuthServerClient } from '@/lib/supabase-server'
import { createGateway } from '@/lib/connector/write-gateway'
import { processRevoke } from '@/lib/connector/revoke'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    body = null
  }
  const supabase = await createAuthServerClient()
  const result = await processRevoke(
    { authorizationHeader: req.headers.get('authorization'), body },
    {
      getUserId: async () => (await getAuthUser())?.id ?? null,
      getSessionAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
      // Also cancels every waiting request of this connection, in the same database transaction.
      revokeRow: async (connectionId, userId) => {
        const r = await createGateway().revoke(userId, connectionId)
        if (!r.ok) return r.code === 'connection_not_found' ? { error: 'not_found' as const } : { error: 'failed' as const }
        return r.data.success && r.data.client_id ? { clientId: r.data.client_id } : { error: 'not_found' as const }
      },
      revokeGrant: async (clientId) => supabase.auth.oauth.revokeGrant({ clientId }),
    },
  )
  return NextResponse.json(result.body, { status: result.status })
}
