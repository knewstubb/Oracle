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
import { getBatchRankedCandidates, type RankedCandidate } from '@/lib/allocation-candidates'
import { isBasicLand } from '@/lib/basic-lands'

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
    .select('id, card_name, scryfall_id, physical_copy_id, ownership_status')
    .eq('deck_id', deckId)
    .order('card_name')

  if (cardsErr) {
    return Response.json({ error: cardsErr.message }, { status: 500 })
  }

  const cards = deckCards ?? []
  // Generic lands = basic land name + no specific printing (scryfall_id is null)
  const isGenericLand = (c: any) => isBasicLand(c.card_name) && !c.scryfall_id
  const genericLandCount = cards.filter(isGenericLand).length
  const nonGenericResolved = cards.filter(c => c.physical_copy_id !== null && !isGenericLand(c)).length
  const resolved = nonGenericResolved + genericLandCount
  const total = cards.length // Include all cards (lands count toward deck total)

  // For unresolved cards, fetch candidates — deduplicate by card_name
  // Only exclude generic lands (no scryfall_id) — specific-printing lands participate
  const unresolvedCardNames = new Set<string>()
  for (const card of cards) {
    if (card.physical_copy_id === null && !isGenericLand(card)) {
      unresolvedCardNames.add(card.card_name)
    }
  }

  // Batch fetch candidates for all unique unresolved card names (2 queries total)
  let candidatesByName = new Map<string, RankedCandidate[]>()
  try {
    candidatesByName = await getBatchRankedCandidates(Array.from(unresolvedCardNames), userId)
  } catch (err) {
    console.error('[picklist] Failed to batch-fetch candidates:', err)
    // Fall back to empty candidates for all — page still renders, just without candidates
  }

  // Build response — exclude generic lands (they're always satisfied)
  const responseCards = cards
    .filter(card => !isGenericLand(card))
    .map(card => ({
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
