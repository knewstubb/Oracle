/**
 * POST /api/allocation/assign-free-copy
 *
 * Assigns a free (unassigned) physical copy to an open slot in a target deck.
 * Used from Storage detail view where the copy isn't currently in any deck.
 *
 * Body: {
 *   physicalCopyId: number  — the free physical copy
 *   targetDeckId: number    — the deck to assign it to
 *   cardName: string        — used to find the open slot
 * }
 *
 * Returns: { success: true, deckCardsId: number }
 *
 * Errors:
 * - 404: copy not found, or no open slot in target deck
 * - 409: copy is already assigned to a deck (use reassign-to-deck instead)
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { physicalCopyId: number; targetDeckId: number; cardName: string }
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
    // 1. Verify the physical copy belongs to this user and is free
    const { data: copy, error: copyErr } = await supabase
      .from('physical_copies')
      .select('id, is_proxy')
      .eq('id', physicalCopyId)
      .eq('user_id', userId)
      .maybeSingle()

    if (copyErr || !copy) {
      return Response.json({ error: 'Physical copy not found' }, { status: 404 })
    }

    // Check it's not already assigned
    const { data: existingSlot } = await supabase
      .from('deck_cards')
      .select('id')
      .eq('physical_copy_id', physicalCopyId)
      .limit(1)
      .maybeSingle()

    if (existingSlot) {
      return Response.json(
        { error: 'Copy is already assigned to a deck — use reassign-to-deck instead' },
        { status: 409 }
      )
    }

    // 2. Find an open slot in the target deck for this card
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

    // 3. Fill the slot
    const ownershipStatus = copy.is_proxy ? 'proxy' : 'original'
    const { error: fillErr } = await supabase
      .from('deck_cards')
      .update({ physical_copy_id: physicalCopyId, ownership_status: ownershipStatus })
      .eq('id', targetSlot.id)

    if (fillErr) {
      return Response.json({ error: `Failed to assign: ${fillErr.message}` }, { status: 500 })
    }

    return Response.json({ success: true, deckCardsId: targetSlot.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
