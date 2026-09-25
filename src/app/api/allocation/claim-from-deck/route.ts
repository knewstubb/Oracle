/**
 * POST /api/allocation/claim-from-deck
 *
 * Tier 4: Force-claim a physical copy from another deck into a specific slot.
 * This bypasses the assign_physical_copy RPC's already-claimed guard because
 * the user has already confirmed via the Tier 4 confirmation modal.
 *
 * Steps:
 *   1. Advisory-lock on the copy_id (via Postgres function or manual lock)
 *   2. Clear the source deck_cards row (set copy_id = NULL)
 *   3. Fill the target deck_cards row (set copy_id + ownership_status)
 *
 * Body: { deckCardsId: number, physicalCopyId: number }
 * Returns: { success: true }
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { assertAtomicRpcSuccess } from '@/lib/atomic-rpc'
import type { ClaimFromDeckBody } from '@/types/placement-source'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: ClaimFromDeckBody
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

    const { data, error: rpcErr } = await (supabase.rpc as any)('force_claim_copy', {
      p_target_deck_card_id: deckCardsId,
      p_copy_id: physicalCopyId,
      p_user_id: userId,
      p_source: 'manual',
    })

    if (rpcErr) {
      if (rpcErr.message?.includes('target_not_found')) {
        return Response.json({ error: 'Target slot not found' }, { status: 404 })
      }
      if (rpcErr.message?.includes('target_filled')) {
        return Response.json({ error: 'Target slot is already filled' }, { status: 409 })
      }
      if (rpcErr.message?.includes('copy_not_found')) {
        return Response.json({ error: 'Physical copy not found' }, { status: 404 })
      }
      return Response.json({ error: `Failed to claim copy: ${rpcErr.message}` }, { status: 500 })
    }

    const result = assertAtomicRpcSuccess(data, 'force_claim_copy')
    return Response.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
