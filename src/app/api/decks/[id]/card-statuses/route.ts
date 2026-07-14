/**
 * GET /api/decks/[id]/card-statuses
 *
 * Returns the five-state status for every card in a deck.
 * Used by the Cards tab, grid view, and Picklist to render allocation state.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { computeDeckCardStatuses } from '@/lib/card-status'

export async function GET(
  _request: NextRequest,
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

  // Fetch deck_cards with physical_copy join for is_proxy
  const { data: deckCards, error } = await supabase
    .from('deck_cards')
    .select(`
      id,
      card_name,
      physical_copy_id,
      physical_copies!deck_cards_physical_copy_id_fkey(is_proxy)
    `)
    .eq('deck_id', deckId)
    .order('card_name')

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Map to the shape computeDeckCardStatuses expects
  const cards = (deckCards ?? []).map((row: any) => ({
    id: row.id,
    card_name: row.card_name,
    physical_copy_id: row.physical_copy_id,
    is_proxy: row.physical_copies?.is_proxy ?? null,
  }))

  const statuses = await computeDeckCardStatuses(cards, userId)

  // Compute summary counts (exclude generic_land from total — it's an exemption, not a status)
  const counts = {
    total: statuses.filter(s => s.status !== 'generic_land').length,
    original: statuses.filter(s => s.status === 'original').length,
    proxy: statuses.filter(s => s.status === 'proxy').length,
    unallocated: statuses.filter(s => s.status === 'unallocated').length,
    claimed: statuses.filter(s => s.status === 'claimed').length,
    unowned: statuses.filter(s => s.status === 'unowned').length,
    generic_land: statuses.filter(s => s.status === 'generic_land').length,
  }

  return Response.json({ cards: statuses, counts })
}
