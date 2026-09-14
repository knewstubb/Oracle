/**
 * DELETE /api/decks/[id]/cards/[cardId]
 *
 * Removes a card slot (deck_cards row) from a deck.
 * If the slot has a sleeved copy, the copy is returned to default storage in
 * the same transaction as the slot deletion.
 *
 * Response: { deleted: true, deckCardsId: number }
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import {
  assertAtomicRpcCount,
  assertAtomicRpcId,
  assertAtomicRpcOptionalId,
  assertAtomicRpcSuccess,
} from '@/lib/atomic-rpc'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id, cardId } = await params
  const deckId = parseInt(id, 10)
  const deckCardsId = parseInt(cardId, 10)

  if (isNaN(deckId) || isNaN(deckCardsId)) {
    return Response.json(
      { error: 'Invalid deck ID or card ID' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const operation = 'remove_deck_card_with_release'
  const { data, error: rpcErr } = await supabase.rpc(
    'remove_deck_card_with_release',
    {
      p_deck_id: deckId,
      p_deck_card_id: deckCardsId,
      p_user_id: userId,
    }
  )

  if (rpcErr) {
    if (
      rpcErr.message?.includes('deck_not_found') ||
      rpcErr.message?.includes('deck_card_not_found')
    ) {
      return Response.json({ error: 'Card not found in this deck' }, { status: 404 })
    }
    return Response.json({ error: rpcErr.message }, { status: 500 })
  }

  const result = assertAtomicRpcSuccess(data, operation)
  assertAtomicRpcCount(result, 'deleted_count', operation, 1)
  const releasedCount = assertAtomicRpcCount(result, 'released_count', operation)
  if (releasedCount > 1) {
    throw new Error(`${operation} returned an invalid released_count`)
  }
  const returnedDeckCardId = assertAtomicRpcId(result, 'deck_card_id', operation)
  if (returnedDeckCardId !== deckCardsId) {
    throw new Error(`${operation} returned an unexpected deck_card_id`)
  }
  assertAtomicRpcOptionalId(result, 'copy_id', operation)
  assertAtomicRpcOptionalId(result, 'target_location_id', operation)

  return Response.json({ deleted: true, deckCardsId, ...result })
}


/**
 * PATCH /api/decks/[id]/cards/[cardId]
 *
 * Updates fields on a deck_cards row. Used for converting specific-printing
 * lands to generic (clearing scryfall_id and set_code).
 *
 * Body: { scryfall_id?: string | null, set_code?: string | null }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id, cardId } = await params
  const deckId = parseInt(id, 10)
  const deckCardsId = parseInt(cardId, 10)

  if (isNaN(deckId) || isNaN(deckCardsId)) {
    return Response.json({ error: 'Invalid IDs' }, { status: 400 })
  }

  const body = await request.json()
  const supabase = createAdminClient()

  // Verify ownership
  const { data: row } = await supabase
    .from('deck_cards')
    .select('id, deck_id, decks!deck_cards_deck_id_fkey(user_id)')
    .eq('id', deckCardsId)
    .eq('deck_id', deckId)
    .maybeSingle()

  if (!row) {
    return Response.json({ error: 'Card not found' }, { status: 404 })
  }
  const deck = row.decks as unknown as { user_id: string } | null
  if (!deck || deck.user_id !== userId) {
    return Response.json({ error: 'Card not found' }, { status: 404 })
  }

  // Build update payload — only allow specific fields
  const update: Record<string, unknown> = {}
  if ('scryfall_id' in body) update.scryfall_id = body.scryfall_id
  if ('set_code' in body) update.set_code = body.set_code

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('deck_cards')
    .update(update as { scryfall_id?: string | null; set_code?: string | null })
    .eq('id', deckCardsId)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ updated: true })
}
