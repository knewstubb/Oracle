/**
 * DELETE /api/decks/[id]/cards/[cardId]
 *
 * Removes a card slot (deck_cards row) from a deck.
 * Does NOT cascade to physical_copies — the referenced Copy simply becomes
 * free (same end state as Unassign, but via row deletion rather than nulling
 * the pointer).
 *
 * Response: { deleted: true, deckCardsId: number }
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

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

  // Verify the deck_cards row exists and belongs to the authenticated user
  const { data: row, error: fetchErr } = await supabase
    .from('deck_cards')
    .select('id, deck_id, decks!deck_cards_deck_id_fkey(user_id)')
    .eq('id', deckCardsId)
    .eq('deck_id', deckId)
    .maybeSingle()

  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!row) {
    return Response.json(
      { error: 'Card not found in this deck' },
      { status: 404 }
    )
  }

  // Verify ownership via the joined deck
  const deck = row.decks as unknown as { user_id: string } | null
  if (!deck || deck.user_id !== userId) {
    return Response.json(
      { error: 'Card not found in this deck' },
      { status: 404 }
    )
  }

  // Delete the deck_cards row — no cascade needed on physical_copies
  const { error: deleteErr } = await supabase
    .from('deck_cards')
    .delete()
    .eq('id', deckCardsId)

  if (deleteErr) {
    return Response.json({ error: deleteErr.message }, { status: 500 })
  }

  return Response.json({ deleted: true, deckCardsId })
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
    .update(update)
    .eq('id', deckCardsId)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ updated: true })
}
