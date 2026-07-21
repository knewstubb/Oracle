/**
 * POST /api/decks/[id]/cards
 *
 * Adds a new card slot to a deck by card name.
 * Creates a deck_cards row with the given card_name, quantity 1, no physical copy assigned.
 *
 * Body: { cardName: string, quantity?: number }
 * Response: { id: number, cardName: string }
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const deckId = parseInt(id, 10)

  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const body = await request.json()
  const cardName = body.cardName?.trim()
  const quantity = body.quantity ?? 1

  if (!cardName) {
    return Response.json({ error: 'cardName is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify deck exists and belongs to user
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, user_id')
    .eq('id', deckId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }

  if (!deck || deck.user_id !== userId) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Look up scryfall_id for the card (for image display)
  let scryfallId: string | null = null
  try {
    const scryfallRes = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`,
      { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
    )
    if (scryfallRes.ok) {
      const scryfallData = await scryfallRes.json()
      scryfallId = scryfallData.id ?? null
    }
  } catch {
    // Non-critical — card still gets added, just without an image
  }

  // Insert the new deck_cards row
  const { data: newCard, error: insertErr } = await supabase
    .from('deck_cards')
    .insert({
      deck_id: deckId,
      card_name: cardName,
      scryfall_id: scryfallId,
      quantity,
      user_id: userId,
    })
    .select('id, card_name')
    .single()

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 })
  }

  return Response.json({ id: newCard.id, cardName: newCard.card_name })
}
