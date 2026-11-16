/**
 * POST /api/picklist/found | /api/picklist/placed | /api/picklist/cant-find
 * Contract: docs/oracle/contracts/know-where-cards-are.md sections 4 (B1 to B3), 5, 6.
 *
 * Body: { copyId, to: { kind: 'deck', deckId, deckCardId? } | { kind: 'location', locationId }, cardName? }
 *   `to` is the planned destination of the row. For placed it may be any deck with an empty slot or any box ("put it
 *   back anywhere").
 *
 * One call = one tick, saved at once and all-or-nothing, by the stored routine `picklist_tick`. It creates the saved
 * step if the row has none yet, then ticks it. A repeat tick is a harmless no-op (`unchanged: true`).
 * The user id comes only from the signed-in session; the routine is callable by the server only.
 *
 * Response 200: { itemId, state, unchanged, sourceDeckNowShort, decksNowShort, filledDeckCardId }
 * Errors: { error: <code>, message: <plain sentence> } with 400 (bad request), 404, 409 or 500.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import {
  TICK_ACTION_BY_SEGMENT,
  codeFromRoutineError,
  parseTickBody,
  readTickResult,
  tickErrorMessage,
  tickErrorStatus,
  toRoutineTarget,
} from '@/lib/picklist-ticks'

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { action: segment } = await params
  const action = TICK_ACTION_BY_SEGMENT[segment]
  if (!action) return Response.json({ error: 'not_found', message: 'Unknown Picklist action.' }, { status: 404 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ error: 'bad_request', message: 'Invalid request body.' }, { status: 400 })
  }
  const body = parseTickBody(raw)
  if (!body) {
    return Response.json({ error: 'bad_request', message: 'copyId and a valid destination are required.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  // The routine is new and not in the generated types yet.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>
  try {
    const { data, error } = await rpc('picklist_tick', {
      p_user_id: userId,
      p_action: action,
      p_copy_id: body.copyId,
      p_to: toRoutineTarget(body.to),
    })
    if (error) {
      const code = codeFromRoutineError(error.message)
      if (code === 'failed') console.error('[picklist tick]', error.message)
      return Response.json({ error: code, message: tickErrorMessage(code, body.cardName) }, { status: tickErrorStatus(code) })
    }
    const result = readTickResult(data)
    return Response.json(result)
  } catch (err) {
    console.error('[picklist tick]', err)
    return Response.json({ error: 'failed', message: tickErrorMessage('failed', body.cardName) }, { status: 500 })
  }
}
