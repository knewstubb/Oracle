import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { loadCardDetails } from '@/lib/card-details/load'

/**
 * GET /api/decks/[id]/cards/[cardId]/details
 * Read-only. Everything the card details modal shows for one deck slot: card facts, Tags, printings (one row per
 * printing and finish), the user's copies of the card, rulings from ref_rulings, and whether the Why line exists.
 * Another user's deck or card is a 404. A failed lookup is a 500, never an empty answer.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; cardId: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id, cardId } = await params
  const deckId = parseInt(id, 10)
  const deckCardId = parseInt(cardId, 10)
  if (isNaN(deckId) || isNaN(deckCardId)) {
    return Response.json({ error: 'Invalid deck ID or card ID' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { data: deck, error: deckErr } = await supabase.from('decks').select('id').eq('id', deckId).eq('user_id', authResult.id).maybeSingle()
  if (deckErr) return Response.json({ error: deckErr.message }, { status: 500 })
  if (!deck) return Response.json({ error: 'Deck not found' }, { status: 404 })
  try {
    const details = await loadCardDetails(supabase, authResult.id, deckId, deckCardId)
    if (!details) return Response.json({ error: 'Card not found in this deck' }, { status: 404 })
    return Response.json(details)
  } catch (err) {
    console.error('[card details GET]', err)
    return Response.json({ error: "Couldn't load this card's details." }, { status: 500 })
  }
}
