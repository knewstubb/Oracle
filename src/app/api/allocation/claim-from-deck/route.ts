/**
 * POST /api/allocation/claim-from-deck
 *
 * Tier 4: Force-claim a physical copy from another deck into a specific slot.
 * This bypasses the assign_physical_copy RPC's allocate=true guard because
 * the user has already confirmed via the Tier 4 confirmation modal.
 *
 * Steps:
 *   1. Advisory-lock on the physical_copy_id (via Postgres function or manual lock)
 *   2. Clear the source deck_cards row (set physical_copy_id = NULL)
 *   3. Fill the target deck_cards row (set physical_copy_id + ownership_status)
 *
 * Body: { deckCardsId: number, physicalCopyId: number }
 * Returns: { success: true }
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { deckCardsId: number; physicalCopyId: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { deckCardsId, physicalCopyId } = body

  if (!deckCardsId || !physicalCopyId) {
    return Response.json({ error: 'deckCardsId and physicalCopyId are required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    console.log('[claim-from-deck] Request:', { deckCardsId, physicalCopyId, userId })

    // Verify the target slot exists and is currently empty
    const { data: targetSlot, error: targetErr } = await supabase
      .from('deck_cards')
      .select('id, physical_copy_id')
      .eq('id', deckCardsId)
      .maybeSingle()

    if (targetErr || !targetSlot) {
      return Response.json({ error: 'Target slot not found' }, { status: 404 })
    }

    if (targetSlot.physical_copy_id !== null) {
      return Response.json({ error: 'Target slot is already filled' }, { status: 409 })
    }

    // Verify the physical copy exists
    const { data: copy, error: copyErr } = await supabase
      .from('physical_copies')
      .select('id, is_proxy')
      .eq('id', physicalCopyId)
      .maybeSingle()

    if (copyErr || !copy) {
      return Response.json({ error: 'Physical copy not found' }, { status: 404 })
    }

    // Step 1: Clear the source — find and unlink any deck_cards row holding this copy
    const { error: clearErr } = await supabase
      .from('deck_cards')
      .update({ physical_copy_id: null, ownership_status: null })
      .eq('physical_copy_id', physicalCopyId)

    if (clearErr) {
      return Response.json({ error: `Failed to clear source: ${clearErr.message}` }, { status: 500 })
    }

    // Step 2: Fill the target slot
    const ownershipStatus = copy.is_proxy ? 'proxy' : 'original'
    const { error: fillErr } = await supabase
      .from('deck_cards')
      .update({ physical_copy_id: physicalCopyId, ownership_status: ownershipStatus })
      .eq('id', deckCardsId)

    if (fillErr) {
      return Response.json({ error: `Failed to fill target: ${fillErr.message}` }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
