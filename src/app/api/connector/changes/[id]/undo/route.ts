import { failJson, guardRoute, reply } from '@/lib/connector/cookie-guard'
import * as api from '@/lib/connector/owner-api'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardRoute(req)
  if (!g.ok) return failJson(g)
  const { id } = await ctx.params
  return reply(await api.undoChange(g.gateway, g.userId, id))
}
