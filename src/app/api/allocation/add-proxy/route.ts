/**
 * POST /api/allocation/add-proxy
 *
 * Atomically creates a proxy collection row and assigns it to a deck slot.
 * Used from Claimed, Open, and Unowned chip popovers in the Cards Tab,
 * and from the Picklist's "Print Proxy" flow.
 *
 * Body: { deckCardsId: number, cardId?: number } (also accepts deprecated cardDefinitionId)
 * Returns: { success: true, copyId: number }
 *
 * When cardId is omitted, the route resolves the card identity from the deck
 * slot itself and creates the user_cards identity row if necessary (this is
 * the "unowned card" proxy path).
 *
 * The proxy is created with:
 * - is_proxy = true
 * - source_tag = 'manual'
 * - printing_id = the printing the deck slot asks for (deck_cards.scryfall_id);
 *   the newest printing of the card is used only when the slot names none (D-038)
 * - finish = the finish the slot asks for (deck_cards.requested_finish), or
 *   'nonfoil' when the slot names none (D-041)
 * - location_id = null (goes straight to the deck, not storage)
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { assertAtomicRpcCount, assertAtomicRpcId, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'
import type { AddProxyBody } from '@/types/placement-source'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: AddProxyBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { deckCardsId } = body
  // Support both cardId and deprecated cardDefinitionId
  const cardId = body.cardId ?? body.cardDefinitionId

  if (!deckCardsId) {
    return Response.json(
      { error: 'deckCardsId is required' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  try {
    if (cardId) {
      // Owned card path: the user_cards identity row already exists.
      const { data, error: rpcErr } = await supabase.rpc('add_proxy_to_slot', {
        p_target_deck_card_id: deckCardsId,
        p_card_id: cardId,
        p_user_id: userId,
        p_source: 'manual',
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
      return makeProxyResponse(copyId)
    }

    // Unowned card path: resolve the identity from the deck slot and create the
    // user_cards row inside add_proxies_to_slots if it does not exist yet.
    const { data: slotRow, error: slotErr } = await supabase
      .from('deck_cards')
      .select('id, card_name, scryfall_id, requested_finish')
      .eq('id', deckCardsId)
      .eq('user_id', userId)
      .maybeSingle()

    if (slotErr) {
      return Response.json({ error: `Failed to load deck slot: ${slotErr.message}` }, { status: 500 })
    }
    if (!slotRow) {
      return Response.json({ error: 'Deck card slot not found' }, { status: 404 })
    }

    const { data: proxyData, error: rpcErr } = await supabase.rpc('add_proxies_to_slots', {
      p_user_id: userId,
      p_assignments: [
        {
          deck_card_id: deckCardsId,
          card_name: slotRow.card_name,
          printing_id: slotRow.scryfall_id ?? null,
          finish: slotRow.requested_finish ?? null,
        },
      ],
      p_source: 'manual',
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
      if (
        rpcErr.message?.includes('card_printing_not_found') ||
        rpcErr.message?.includes('card_mismatch')
      ) {
        return Response.json({ error: 'Card could not be resolved to a printing' }, { status: 404 })
      }
      return Response.json({ error: `Failed to create proxy: ${rpcErr.message}` }, { status: 500 })
    }

    const result = assertAtomicRpcSuccess(proxyData, 'add_proxies_to_slots')
    assertAtomicRpcCount(result, 'created_count', 'add_proxies_to_slots', 1)

    // add_proxies_to_slots returns a count, not the id. Read the newly assigned
    // copy id back from the deck slot.
    const { data: updatedSlot } = await supabase
      .from('deck_cards')
      .select('copy_id')
      .eq('id', deckCardsId)
      .maybeSingle()

    const copyId = updatedSlot?.copy_id
    if (!copyId || typeof copyId !== 'number') {
      return Response.json(
        { error: 'Proxy was created but copy id could not be read back' },
        { status: 500 }
      )
    }

    return makeProxyResponse(copyId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}

function makeProxyResponse(copyId: number) {
  return Response.json({
    success: true,
    copyId,
    // Deprecated alias for backwards compatibility
    physicalCopyId: copyId,
  })
}
