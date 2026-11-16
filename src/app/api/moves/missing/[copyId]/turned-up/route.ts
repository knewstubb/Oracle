/**
 * POST /api/moves/missing/[copyId]/turned-up — "Turned up" / "Found it" on the Missing page.
 * Body: { to: { kind: 'in_hand' } | { kind: 'location', locationId } | { kind: 'deck', deckId, deckCardId? }, cardName? }
 * The owner always chooses the place; Oracle never picks one. A repeat is a harmless no-op (`unchanged: true`).
 * Response 200: { success, unchanged, state, location_id?, filled_deck_card_id?, deck_id? }
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { runMoveRoutine, badRequest, readJson } from '@/lib/move-routine-route'
import { moveErrorMessage, parseIdSegment, parseTurnedUpBody, readTurnedUpResult, toTurnedUpTarget } from '@/lib/move-routines'

export async function POST(request: NextRequest, { params }: { params: Promise<{ copyId: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const copyId = parseIdSegment((await params).copyId)
  if (copyId === null) return badRequest('A valid card copy is required.')
  const raw = await readJson(request)
  const body = raw === undefined ? null : parseTurnedUpBody(raw)
  if (!body) return badRequest('Choose where the card is now.')

  const result = await runMoveRoutine(
    'resolve_missing_copy',
    { p_user_id: authResult.id, p_copy_id: copyId, p_to: toTurnedUpTarget(body.to) },
    body.cardName,
  )
  if (!result.ok) return result.response
  try {
    return Response.json(readTurnedUpResult(result.data))
  } catch (err) {
    console.error('[resolve_missing_copy]', err)
    return Response.json({ error: 'failed', message: moveErrorMessage('failed', body.cardName) }, { status: 500 })
  }
}
