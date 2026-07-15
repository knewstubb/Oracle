/**
 * POST /api/allocation/assign-free-copy
 *
 * Assigns a free (unassigned) physical copy to an open slot in a target deck
 * via the `assign_free_copy` Postgres RPC (migration 021).
 * Single database call — guards against race conditions atomically.
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

    // Atomic RPC: guard + fill in one transaction
    const { data, error: rpcErr } = await supabase.rpc('assign_free_copy', {
      p_physical_copy_id: physicalCopyId,
      p_target_deck_id: targetDeckId,
      p_card_name: cardName,
      p_user_id: userId,
    })

    if (rpcErr) {
      if (rpcErr.message?.includes('copy_already_assigned')) {
        return Response.json(
          { error: 'Copy is already assigned to a deck — use reassign-to-deck instead' },
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
        { error: `Assign failed: ${rpcErr.message}` },
        { status: 500 }
      )
    }

    const result = data as { success: boolean; deck_card_id: number }
    return Response.json({ success: true, deckCardsId: result.deck_card_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
