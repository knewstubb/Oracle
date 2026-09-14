/**
 * POST /api/allocation/undo
 *
 * Exact restore undo per Section 8.
 *
 * Body:
 *   - deckCardsId: number — the row that was just assigned (to clear)
 *   - physicalCopyId: number — the physical copy to restore to its prior location
 *   - restoreTo: { deckCardsId: number } | null — where it came from (null = was free/storage)
 *
 * If restoreTo.deckCardsId has been claimed by something else since,
 * return { success: false, reason: "slot_claimed_elsewhere" } and do NOT fall back.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { assertAtomicRpcSuccess } from '@/lib/atomic-rpc'

interface UndoBody {
  deckCardsId: number
  physicalCopyId: number
  restoreTo: { deckCardsId: number } | null
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let body: UndoBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { deckCardsId, physicalCopyId, restoreTo } = body

  if (!deckCardsId || !physicalCopyId) {
    return Response.json(
      { error: 'deckCardsId and physicalCopyId are required' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  const { data, error: rpcErr } = await (supabase.rpc as any)('undo_copy_move', {
    p_current_deck_card_id: deckCardsId,
    p_copy_id: physicalCopyId,
    p_restore_deck_card_id: restoreTo?.deckCardsId ?? null,
    p_user_id: authResult.id,
  })

  if (rpcErr) {
    if (rpcErr.message?.includes('slot_claimed_elsewhere')) {
      return Response.json({
        success: false,
        reason: 'slot_claimed_elsewhere',
      })
    }
    if (rpcErr.message?.includes('copy_not_found') || rpcErr.message?.includes('target_not_found')) {
      return Response.json({ error: 'Copy or current slot not found' }, { status: 404 })
    }
    if (rpcErr.message?.includes('restore_target_not_found')) {
      return Response.json({ error: 'Restore target not found' }, { status: 404 })
    }
    if (rpcErr.message?.includes('current_assignment_mismatch')) {
      return Response.json({ error: 'The assignment has changed; undo is no longer available' }, { status: 409 })
    }
    return Response.json({ error: `Undo failed: ${rpcErr.message}` }, { status: 500 })
  }

  try {
    const result = assertAtomicRpcSuccess(data, 'undo_copy_move')
    return Response.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
