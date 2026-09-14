/**
 * POST /api/allocation/add-proxy
 *
 * Atomically creates a proxy collection row and assigns it to a deck slot.
 * Used from Claimed, Open, and Unowned chip popovers in the Cards Tab,
 * and from the Picklist's "Print Proxy" flow.
 *
 * Body: { deckCardsId: number, cardId: number } (also accepts deprecated cardDefinitionId)
 * Returns: { success: true, copyId: number }
 *
 * The proxy is created with:
 * - is_proxy = true
 * - source_tag = 'manual'
 * - printing_id = defaulted from oracle_to_printings (first available)
 * - location_id = null (goes straight to the deck, not storage)
 * - finish = 'nonfoil'
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { assertAtomicRpcId, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { deckCardsId: number; cardId?: number; cardDefinitionId?: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { deckCardsId } = body
  // Support both cardId and deprecated cardDefinitionId
  const cardId = body.cardId ?? body.cardDefinitionId

  if (!deckCardsId || !cardId) {
    return Response.json(
      { error: 'deckCardsId and cardId are required' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  try {
    const { data, error: rpcErr } = await (supabase.rpc as any)('add_proxy_to_slot', {
      p_target_deck_card_id: deckCardsId,
      p_card_id: cardId,
      p_user_id: userId,
    })

    if (rpcErr) {
      if (rpcErr.message?.includes('target_not_found')) {
        return Response.json({ error: 'Deck card slot not found' }, { status: 404 })
      }
      if (rpcErr.message?.includes('target_filled')) {
        return Response.json(
          { error: 'Slot is already resolved — cannot add proxy to an occupied slot' },
          { status: 409 }
        )
      }
      if (rpcErr.message?.includes('card_not_found')) {
        return Response.json({ error: 'Card not found' }, { status: 404 })
      }
      return Response.json({ error: `Failed to create proxy: ${rpcErr.message}` }, { status: 500 })
    }

    const result = assertAtomicRpcSuccess(data, 'add_proxy_to_slot')
    const copyId = assertAtomicRpcId(result, 'copy_id', 'add_proxy_to_slot')
    return Response.json({
      success: true,
      copyId,
      // Deprecated alias for backwards compatibility
      physicalCopyId: copyId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
