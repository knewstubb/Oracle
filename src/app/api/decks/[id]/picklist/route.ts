/**
 * GET /api/decks/[id]/picklist
 *
 * Returns all deck_cards rows for a deck with their resolution status,
 * plus ranked candidates for each unresolved row.
 *
 * Response: {
 *   deckName: string,
 *   cards: Array<{
 *     deckCardsId: number,
 *     cardName: string,
 *     isResolved: boolean,
 *     physicalCopyId: number | null,
 *     ownershipStatus: string | null,
 *     candidates: RankedCandidate[]
 *   }>,
 *   progress: { resolved: number, total: number }
 * }
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getRankedCandidates, type RankedCandidate } from '@/lib/allocation-candidates'

export async function GET(
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

  const supabase = createAdminClient()

  // Fetch deck info
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, name, status')
    .eq('id', deckId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Fetch all deck_cards for this deck
  const { data: deckCards, error: cardsErr } = await supabase
    .from('deck_cards')
    .select('id, card_name, physical_copy_id, ownership_status')
    .eq('deck_id', deckId)
    .order('card_name')

  if (cardsErr) {
    return Response.json({ error: cardsErr.message }, { status: 500 })
  }

  const cards = deckCards ?? []
  const resolved = cards.filter(c => c.physical_copy_id !== null).length
  const total = cards.length

  // For unresolved cards, fetch candidates — deduplicate by card_name
  // to avoid calling getRankedCandidates multiple times for the same card
  const unresolvedCardNames = new Set<string>()
  for (const card of cards) {
    if (card.physical_copy_id === null) {
      unresolvedCardNames.add(card.card_name)
    }
  }

  // Fetch candidates for all unique unresolved card names
  const candidatesByName = new Map<string, RankedCandidate[]>()
  const candidatePromises = Array.from(unresolvedCardNames).map(async (cardName) => {
    try {
      const candidates = await getRankedCandidates(cardName, userId)
      candidatesByName.set(cardName, candidates)
    } catch (err) {
      // If a single card fails, still show it with no candidates
      console.error(`[picklist] Failed to fetch candidates for "${cardName}":`, err)
      candidatesByName.set(cardName, [])
    }
  })

  await Promise.all(candidatePromises)

  // Build response
  const responseCards = cards.map(card => ({
    deckCardsId: card.id,
    cardName: card.card_name,
    isResolved: card.physical_copy_id !== null,
    physicalCopyId: card.physical_copy_id,
    ownershipStatus: card.ownership_status,
    candidates: card.physical_copy_id === null
      ? (candidatesByName.get(card.card_name) ?? [])
      : [],
  }))

  return Response.json({
    deckName: deck.name,
    cards: responseCards,
    progress: { resolved, total },
  })
}
