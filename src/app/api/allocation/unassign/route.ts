/**
 * POST /api/allocation/unassign
 *
 * Remove a card's allocation from a specific deck.
 * Accepts { cardName: string, deckId: number } and deletes the allocation record,
 * then updates the deck_cards ownership_status to NULL.
 *
 * Returns the updated allocation state for that card across all decks.
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getAllocationsForCard } from '@/lib/allocation-store'
import { requireAuth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = await request.json()
    const { cardName, deckId } = body

    // Validate input
    if (!cardName || typeof cardName !== 'string' || !cardName.trim()) {
      return Response.json(
        { success: false, error: 'cardName must be a non-empty string' },
        { status: 400 }
      )
    }

    if (deckId == null || typeof deckId !== 'number' || !Number.isInteger(deckId) || deckId <= 0) {
      return Response.json(
        { success: false, error: 'deckId must be a positive integer' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const trimmedName = cardName.trim()

    // Delete the allocation record
    const { error: deleteErr } = await supabase
      .from('deck_allocations')
      .delete()
      .eq('card_name', trimmedName)
      .eq('deck_id', deckId)

    if (deleteErr) throw new Error(`Failed to delete allocation: ${deleteErr.message}`)

    // Update deck_cards: clear ownership_status (unresolved status computed at read time)
    const { error: updateErr } = await supabase
      .from('deck_cards')
      .update({ ownership_status: null, proxy_of_deck_id: null })
      .eq('card_name', trimmedName)
      .eq('deck_id', deckId)

    if (updateErr) throw new Error(`Failed to update deck_cards: ${updateErr.message}`)

    // Return the updated allocation state for this card across all decks
    const allocations = await getAllocationsForCard(trimmedName)

    return Response.json({
      success: true,
      cardName: trimmedName,
      deckId,
      allocations,
      count: allocations.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[allocation/unassign] Unexpected error: ${message}`)
    return Response.json(
      { success: false, error: `Unexpected error: ${message}` },
      { status: 500 }
    )
  }
}
