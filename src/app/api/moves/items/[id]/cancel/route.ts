/**
 * POST /api/moves/items/[id]/cancel — Cancel a step for a card that has not been found yet.
 * Body (optional): { cardName? }. Only a step still waiting (to_find); the step is kept as history, nothing is deleted.
 * Response 200: { itemId, state: 'cancelled', unchanged }
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { runMoveRoutine, badRequest, readJson } from '@/lib/move-routine-route'
import { moveErrorMessage, parseIdSegment, readCancelResult } from '@/lib/move-routines'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const itemId = parseIdSegment((await params).id)
  if (itemId === null) return badRequest('A valid step is required.')
  const raw = (await readJson(request)) as Record<string, unknown> | undefined
  const cardName = raw && typeof raw.cardName === 'string' && raw.cardName.trim() ? raw.cardName.trim() : 'That card'

  const result = await runMoveRoutine('cancel_move_item', { p_user_id: authResult.id, p_item_id: itemId }, cardName)
  if (!result.ok) return result.response
  try {
    return Response.json(readCancelResult(result.data))
  } catch (err) {
    console.error('[cancel_move_item]', err)
    return Response.json({ error: 'failed', message: moveErrorMessage('failed', cardName) }, { status: 500 })
  }
}
