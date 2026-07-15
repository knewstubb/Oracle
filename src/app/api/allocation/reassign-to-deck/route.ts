/**
 * POST /api/allocation/reassign-to-deck
 *
 * Atomically moves a physical copy from its current deck slot to an open slot
 * in the target deck via the `reassign_to_deck` Postgres RPC (migration 021).
 * Single database call — all-or-nothing, no window where the copy is orphaned.
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
    // Verify ownership before calling RPC
    const { data: copy, error: copyErr } = await supabase
      .from('physical_copies')
      .select('id')
      .eq('id', physicalCopyId)
      .eq('user_id', userId)
      .maybeSingle()

    if (copyErr || !copy) {
      return Response.json({ error: 'Physical copy not found' }, { status: 404 })
    }

    // Atomic RPC: clear source + fill target in one transaction
    const { data, error: rpcErr } = await supabase.rpc('reassign_to_deck', {
      p_physical_copy_id: physicalCopyId,
      p_target_deck_id: targetDeckId,
      p_card_name: cardName,
      p_user_id: userId,
    })

    if (rpcErr) {
      if (rpcErr.message?.includes('copy_not_assigned')) {
        return Response.json(
          { error: 'Copy is not currently assigned to any deck' },
          { status: 409 }
        )
      }
      if (rpcErr.message?.includes('no_open_slot')) {
        return Response.json(
          { error: `No open slot for "${cardName}" in target deck` },
          { status: 404 }
        )
      }
      return Response.json(
        { error: `Reassign failed: ${rpcErr.message}` },
        { status: 500 }
      )
    }

    const result = data as { success: boolean; source_deck_card_id: number; target_deck_card_id: number }
    return Response.json({ success: true, targetDeckCardsId: result.target_deck_card_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
