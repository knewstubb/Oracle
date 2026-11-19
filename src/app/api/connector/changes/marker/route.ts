import { NextResponse } from 'next/server'
import { failJson, guardRoute } from '@/lib/connector/cookie-guard'
import { readChangeMarker, type MarkerDb } from '@/lib/connector/change-marker'
import { createAuthServerClient } from '@/lib/supabase-server'
export const dynamic = 'force-dynamic'
/** Live refresh: a few bytes saying whether Claude changed anything (for one deck with ?deckId=, else for the whole account). */
export async function GET(req: Request) {
  const g = await guardRoute(req)
  if (!g.ok) return failJson(g)
  const raw = new URL(req.url).searchParams.get('deckId')
  if (raw !== null && !/^[1-9][0-9]{0,9}$/.test(raw)) return NextResponse.json({ ok: false, error: 'That is not a deck id.', code: 'invalid_request' }, { status: 400 })
  try {
    // The signed-in session (not the service key): the table only lets an owner read their own rows.
    const db = (await createAuthServerClient()) as unknown as MarkerDb
    const m = await readChangeMarker(db, g.userId, raw === null ? undefined : Number(raw))
    return NextResponse.json({ ok: true, ...m }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not check for changes just now.', code: 'rpc_failed' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
