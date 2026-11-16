import { failJson, guardRoute, reply } from '@/lib/connector/cookie-guard'
import * as api from '@/lib/connector/owner-api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await guardRoute(req)
  if (!g.ok) return failJson(g)
  return reply(await api.pendingCount(g.gateway, g.userId))
}
