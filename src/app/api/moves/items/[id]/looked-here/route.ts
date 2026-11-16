/**
 * POST /api/moves/items/[id]/looked-here — "I checked here".
 * Body: { place: { kind: 'deck' | 'location', id }, cardName? }. Only for a step whose card is Missing.
 * Remembers the place so Where to look next can leave it out. Moves no card. Repeat = `unchanged: true`.
 * Response 200: { itemId, unchanged, lookedIn }
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { runMoveRoutine, badRequest, readJson } from '@/lib/move-routine-route'
import { moveErrorMessage, parseIdSegment, parseLookedHereBody, readLookedHereResult } from '@/lib/move-routines'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const itemId = parseIdSegment((await params).id)
  if (itemId === null) return badRequest('A valid step is required.')
  const raw = await readJson(request)
  const body = raw === undefined ? null : parseLookedHereBody(raw)
  if (!body) return badRequest('Say which deck or box you checked.')
  const name = (raw as Record<string, unknown>).cardName
  const cardName = typeof name === 'string' && name.trim() ? name.trim() : 'That card'

  const result = await runMoveRoutine('record_move_looked_in', { p_user_id: authResult.id, p_item_id: itemId, p_place: body.place }, cardName)
  if (!result.ok) return result.response
  try {
    return Response.json(readLookedHereResult(result.data))
  } catch (err) {
    console.error('[record_move_looked_in]', err)
    return Response.json({ error: 'failed', message: moveErrorMessage('failed', cardName) }, { status: 500 })
  }
}
