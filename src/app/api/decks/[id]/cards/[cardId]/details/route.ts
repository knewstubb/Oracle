import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { loadCardDetails, loadDeckCollectionPart, loadDeckOverview, loadDeckRulings, type Loaded } from '@/lib/card-details/load'
/**
 * GET /api/decks/[id]/cards/[cardId]/details
 * Read-only. What the card details modal shows for one deck slot. The window asks for it in parts so the Overview
 * arrives first:
 *   ?part=overview                      card facts, Tags, the slot's own printing, deck name, the Why line
 *   ?part=collection&oracleId=...       printings (with owned counts) and the user's copies
 *   ?part=rulings&oracleId=...          rulings
 * With no part, everything comes in one answer (the original shape).
 * Another user's deck or card is a 404. A failed lookup is a 500, never an empty answer.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; cardId: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id, cardId } = await params
  const deckId = parseInt(id, 10)
  const deckCardId = parseInt(cardId, 10)
  if (isNaN(deckId) || isNaN(deckCardId)) {
    return Response.json({ error: 'Invalid deck ID or card ID' }, { status: 400 })
  }
  const part = request.nextUrl.searchParams.get('part')
  const oracleId = request.nextUrl.searchParams.get('oracleId')
  if (part !== null && part !== 'overview' && part !== 'collection' && part !== 'rulings') {
    return Response.json({ error: 'Unknown part' }, { status: 400 })
  }
  if ((part === 'collection' || part === 'rulings') && !oracleId) {
    return Response.json({ error: 'oracleId is required' }, { status: 400 })
  }
  const supabase = createAdminClient()
  try {
    let result: Loaded<unknown>
    if (part === 'overview') result = await loadDeckOverview(supabase, authResult.id, deckId, deckCardId)
    else if (part === 'collection') result = await loadDeckCollectionPart(supabase, authResult.id, deckId, deckCardId, oracleId!)
    else if (part === 'rulings') result = await loadDeckRulings(supabase, authResult.id, deckId, deckCardId, oracleId!)
    else result = await loadCardDetails(supabase, authResult.id, deckId, deckCardId)
    if (result.status === 'no-deck') return Response.json({ error: 'Deck not found' }, { status: 404 })
    if (result.status === 'no-card') return Response.json({ error: 'Card not found in this deck' }, { status: 404 })
    return Response.json(result.data)
  } catch (err) {
    console.error('[card details GET]', err)
    return Response.json({ error: "Couldn't load this card's details." }, { status: 500 })
  }
}
