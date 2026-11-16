/**
 * POST /api/moves/items/[id]/undo — Undo the latest tick (one level).
 * Body: { expectedState: 'placed' | 'found' | 'missing', cardName? } = the state the screen is showing, so a double tap
 * cannot undo two steps. Refuses rather than overwrite anything that changed since (moved_since, slot_claimed_elsewhere).
 * Response 200: { itemId, state: 'found' | 'to_find', unchanged }
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { runMoveRoutine, badRequest, readJson } from '@/lib/move-routine-route'
import { moveErrorMessage, parseIdSegment, parseUndoBody, readUndoResult } from '@/lib/move-routines'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const itemId = parseIdSegment((await params).id)
  if (itemId === null) return badRequest('A valid step is required.')
  const raw = await readJson(request)
  const body = raw === undefined ? null : parseUndoBody(raw)
  if (!body) return badRequest('Say which step you are undoing.')
  const name = (raw as Record<string, unknown>).cardName
  const cardName = typeof name === 'string' && name.trim() ? name.trim() : 'That card'

  const result = await runMoveRoutine(
    'undo_move_tick',
    { p_user_id: authResult.id, p_item_id: itemId, p_expected_state: body.expectedState },
    cardName,
  )
  if (!result.ok) return result.response
  try {
    return Response.json(readUndoResult(result.data))
  } catch (err) {
    console.error('[undo_move_tick]', err)
    return Response.json({ error: 'failed', message: moveErrorMessage('failed', cardName) }, { status: 500 })
  }
}
