import { failJson, guardRoute, reply } from '@/lib/connector/cookie-guard'
import * as api from '@/lib/connector/owner-api'

export const dynamic = 'force-dynamic'

// Switch back on. Cookie-only (same guard as approve/decline): a Claude token can never switch itself on.
export async function POST(req: Request) {
  const g = await guardRoute(req)
  if (!g.ok) return failJson(g)
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    body = null
  }
  return reply(await api.enableConnection(g.gateway, g.userId, (body as { connectionId?: unknown } | null)?.connectionId))
}
