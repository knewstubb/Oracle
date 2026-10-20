/**
 * GET /api/printing-languages?set=sos&cn=333
 *
 * Languages one printing exists in, from Scryfall (called from the server, not
 * the browser). `languages` is null when the lookup failed; the screen then
 * falls back to the languages found in the file.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { fetchPrintingLanguages } from '@/lib/printing-languages'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const set = request.nextUrl.searchParams.get('set')?.trim()
  const cn = request.nextUrl.searchParams.get('cn')?.trim()
  if (!set || !cn || set.length > 10 || cn.length > 20) {
    return Response.json({ error: 'set and cn are required' }, { status: 400 })
  }

  const languages = await fetchPrintingLanguages(set, cn)
  return Response.json({ languages }, { headers: { 'Cache-Control': 'private, max-age=86400' } })
}
