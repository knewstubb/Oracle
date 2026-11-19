import { failJson, guardRoute, reply } from '@/lib/connector/cookie-guard'
import * as api from '@/lib/connector/owner-api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await guardRoute(req)
  if (!g.ok) return failJson(g)
  const raw = new URL(req.url).searchParams.get('deckId')
  if (raw !== null && !/^[1-9][0-9]{0,9}$/.test(raw)) return reply({ status: 400, body: { ok: false, error: 'That is not a deck id.', code: 'invalid_request' } })
  return reply(await api.listChanges(g.gateway, g.userId, raw === null ? undefined : Number(raw)))
}
