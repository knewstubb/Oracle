import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { createAuthServerClient } from '@/lib/supabase-server'
import { revokeConnection } from '@/lib/connector/connection-store'
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
      revokeRow: revokeConnection,
      revokeGrant: async (clientId) => supabase.auth.oauth.revokeGrant({ clientId }),
    },
  )
  return NextResponse.json(result.body, { status: result.status })
}
