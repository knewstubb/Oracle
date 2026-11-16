/**
 * POST /api/moves/lists — "Add to Picklist" / "Add all".
 * Body: { items: [{ copyId, to: { kind: 'deck', deckId, deckCardId? } | { kind: 'location', locationId }, cardName? }] } (1 to 500)
 * Saves one waiting step per card. Moves no card. Cards that cannot be added come back in `skipped` with a plain reason.
 * Response 200: { listId, created, unchanged, skipped: [{ index, copyId, reason, message }] }
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { runMoveRoutine, badRequest, readJson } from '@/lib/move-routine-route'
import {
  moveErrorMessage, moveErrorStatus, parseCreateListBody, readCreateListResult, skipReasonText, toRoutineItems,
} from '@/lib/move-routines'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const raw = await readJson(request)
  if (raw === undefined) return badRequest('Invalid request body.')
  const body = parseCreateListBody(raw)
  if ('error' in body) {
    return Response.json({ error: body.error, message: moveErrorMessage(body.error, 'That card') }, { status: moveErrorStatus(body.error) })
  }

  const result = await runMoveRoutine('create_move_list', { p_user_id: authResult.id, p_items: toRoutineItems(body.items) }, 'That card')
  if (!result.ok) return result.response
  try {
    const answer = readCreateListResult(result.data)
    const nameByCopy = new Map(body.items.map((i) => [i.copyId, i.cardName]))
    return Response.json({
      ...answer,
      skipped: answer.skipped.map((s) => ({
        ...s,
        message: skipReasonText(s.reason, (s.copyId !== null ? nameByCopy.get(s.copyId) : undefined) ?? 'That card'),
      })),
    })
  } catch (err) {
    console.error('[create_move_list]', err)
    return Response.json({ error: 'failed', message: moveErrorMessage('failed', 'Those cards') }, { status: 500 })
  }
}
