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

  // ─── Case 1: restoreTo is null — card goes back to free/storage ────
  if (!restoreTo) {
    // Clear the current assignment
    const { error: clearErr } = await supabase
      .from('deck_cards')
      .update({
        physical_copy_id: null,
        ownership_status: null,
      })
      .eq('id', deckCardsId)

    if (clearErr) {
      return Response.json(
        { error: `Failed to clear assignment: ${clearErr.message}` },
        { status: 500 }
      )
    }

    return Response.json({ success: true })
  }

  // ─── Case 2: restoreTo has a deckCardsId — restore to prior location ─
  // Check that the restore target's physical_copy_id is still null
  const { data: targetRow, error: targetErr } = await supabase
    .from('deck_cards')
    .select('id, physical_copy_id')
    .eq('id', restoreTo.deckCardsId)
    .single()

  if (targetErr) {
    return Response.json(
      { error: `Failed to check restore target: ${targetErr.message}` },
      { status: 500 }
    )
  }

  // If the slot has been filled by something else, block the undo
  if (targetRow.physical_copy_id !== null) {
    return Response.json({
      success: false,
      reason: 'slot_claimed_elsewhere',
    })
  }

  // Determine ownership_status for the restored copy
  const { data: copyInfo } = await supabase
    .from('physical_copies')
    .select('is_proxy')
    .eq('id', physicalCopyId)
    .single()

  const ownershipStatus = copyInfo?.is_proxy ? 'proxy' : 'original'

  // Clear the current assignment
  const { error: clearErr } = await supabase
    .from('deck_cards')
    .update({
      physical_copy_id: null,
      ownership_status: null,
    })
    .eq('id', deckCardsId)

  if (clearErr) {
    return Response.json(
      { error: `Failed to clear current assignment: ${clearErr.message}` },
      { status: 500 }
    )
  }

  // Restore the physical copy to its original location
  const { error: restoreErr } = await supabase
    .from('deck_cards')
    .update({
      physical_copy_id: physicalCopyId,
      ownership_status: ownershipStatus,
    })
    .eq('id', restoreTo.deckCardsId)

  if (restoreErr) {
    return Response.json(
      { error: `Failed to restore assignment: ${restoreErr.message}` },
      { status: 500 }
    )
  }

  return Response.json({ success: true })
}
