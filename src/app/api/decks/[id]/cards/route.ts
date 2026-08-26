/**
 * POST /api/decks/[id]/cards
 *
 * Adds a new card slot to a deck by card name.
 * Creates a deck_cards row with the given card_name, quantity 1, no physical copy assigned.
 * Sets the category from the request body if provided, otherwise from card_definitions.default_category,
 * or derives from type_line as a fallback.
 *
 * Body: { cardName: string, quantity?: number, category?: string }
 * Response: { id: number, cardName: string }
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { deriveDefaultCategory } from '@/lib/card-definition-resolver'
import {
  createVersionSnapshot,
  checkMilestoneCrossed,
  getDeckCardCount,
} from '@/lib/deck-versions'

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
  const explicitCategory = body.category?.trim() // Optional: explicit category (e.g., "Maybeboard")

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

  // Look up card info from Scryfall (for image display and type line)
  let scryfallId: string | null = null
  let typeLine: string | null = null
  try {
    const scryfallRes = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`,
      { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
    )
    if (scryfallRes.ok) {
      const scryfallData = await scryfallRes.json()
      scryfallId = scryfallData.id ?? null
      typeLine = scryfallData.type_line ?? null
    }
  } catch {
    // Non-critical — card still gets added, just without an image or category
  }

  // Try to get default_category from ref_cards (global reference table)
  // default_category is JSONB: { primary: string, secondary: string[], confidence: string, notes?: string }
  let categories: string | null = null
  if (cardName) {
    const { data: cardMeta } = await supabase
      .from('ref_cards')
      .select('default_category')
      .eq('name', cardName)
      .maybeSingle()
    
    if (cardMeta?.default_category) {
      // Extract primary category from JSONB structure
      const categoryData = cardMeta.default_category as { primary?: string; secondary?: string[] } | null
      if (categoryData?.primary) {
        categories = JSON.stringify([categoryData.primary])
      }
    }
  }
  
  // Fallback: derive from type_line if no stored default
  if (!categories && typeLine) {
    const derived = deriveDefaultCategory(typeLine)
    categories = JSON.stringify([derived])
  }

  // Override with explicit category if provided (e.g., "Maybeboard")
  if (explicitCategory) {
    categories = JSON.stringify([explicitCategory])
  }

  // Insert the new deck_cards row
  const { data: newCard, error: insertErr } = await supabase
    .from('deck_cards')
    .insert({
      deck_id: deckId,
      card_name: cardName,
      scryfall_id: scryfallId,
      quantity,
      categories,
      user_id: userId,
    })
    .select('id, card_name')
    .single()

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 })
  }

  // Check for milestone card count
  const newCount = await getDeckCardCount(deckId)
  // Estimate the before count (may be slightly off due to race conditions, but good enough)
  const beforeCount = newCount - quantity
  const milestone = checkMilestoneCrossed(beforeCount, newCount)

  if (milestone) {
    await createVersionSnapshot(
      deckId,
      userId,
      'milestone',
      `Reached ${milestone} cards`
    )
  }

  return Response.json({ id: newCard.id, cardName: newCard.card_name })
}
