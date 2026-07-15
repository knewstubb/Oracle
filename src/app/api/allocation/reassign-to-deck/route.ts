/**
 * POST /api/allocation/reassign-to-deck
 *
 * Atomically moves a physical copy from its current deck slot to an open slot
 * in the target deck. One-step operation: unlinks from source → links to target.
 *
 * Body: {
 *   physicalCopyId: number  — the physical copy to move
 *   targetDeckId: number    — the deck to move it to
 *   cardName: string        — used to find the open slot in target deck
 * }
 *
 * Returns: { success: true, targetDeckCardsId: number }
 *
 * Errors:
 * - 404: copy not found, or no open slot in target deck for this card
 * - 409: copy is not currently assigned to any deck
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

interface ReassignBody {
  physicalCopyId: number
  targetDeckId: number
  cardName: string
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: ReassignBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { physicalCopyId, targetDeckId, cardName } = body

  if (!physicalCopyId || !targetDeckId || !cardName) {
    return Response.json(
      { error: 'physicalCopyId, targetDeckId, and cardName are required' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  try {
    // 1. Verify the physical copy belongs to this user
    const { data: copy, error: copyErr } = await supabase
      .from('physical_copies')
      .select('id, is_proxy')
      .eq('id', physicalCopyId)
      .eq('user_id', userId)
      .maybeSingle()

    if (copyErr || !copy) {
      return Response.json({ error: 'Physical copy not found' }, { status: 404 })
    }

    // 2. Find the source deck_cards row (where this copy is currently assigned)
    const { data: sourceSlot, error: srcErr } = await supabase
      .from('deck_cards')
      .select('id, deck_id')
      .eq('physical_copy_id', physicalCopyId)
      .eq('user_id', userId)
      .maybeSingle()

    if (srcErr || !sourceSlot) {
      return Response.json(
        { error: 'Copy is not currently assigned to any deck' },
        { status: 409 }
      )
    }

    // 3. Find an open slot in the target deck for this card
    //    An open slot is a deck_cards row with: deck_id = target, card_name matches,
    //    and physical_copy_id IS NULL (unresolved)
    const { data: targetSlot, error: tgtErr } = await supabase
      .from('deck_cards')
      .select('id')
      .eq('deck_id', targetDeckId)
      .eq('card_name', cardName)
      .eq('user_id', userId)
      .is('physical_copy_id', null)
      .limit(1)
      .maybeSingle()

    if (tgtErr || !targetSlot) {
      return Response.json(
        { error: `No open slot for "${cardName}" in target deck` },
        { status: 404 }
      )
    }

    // 4. Atomic move: clear source slot + fill target slot
    //    Step A: Clear the source (set physical_copy_id = null, ownership_status = null)
    const { error: clearErr } = await supabase
      .from('deck_cards')
      .update({ physical_copy_id: null, ownership_status: null })
      .eq('id', sourceSlot.id)

    if (clearErr) {
      return Response.json({ error: `Failed to clear source: ${clearErr.message}` }, { status: 500 })
    }

    //    Step B: Fill the target slot
    const ownershipStatus = copy.is_proxy ? 'proxy' : 'original'
    const { error: fillErr } = await supabase
      .from('deck_cards')
      .update({ physical_copy_id: physicalCopyId, ownership_status: ownershipStatus })
      .eq('id', targetSlot.id)

    if (fillErr) {
      // Rollback: re-assign to source
      await supabase
        .from('deck_cards')
        .update({ physical_copy_id: physicalCopyId, ownership_status: ownershipStatus })
        .eq('id', sourceSlot.id)
      return Response.json({ error: `Failed to fill target: ${fillErr.message}` }, { status: 500 })
    }

    return Response.json({ success: true, targetDeckCardsId: targetSlot.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
