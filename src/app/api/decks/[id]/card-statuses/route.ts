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

  // Fetch deck_cards with user_copies join for is_proxy, include categories for filtering
  const { data: deckCards, error } = await supabase
    .from('deck_cards')
    .select(`
      id,
      card_name,
      scryfall_id,
      copy_id,
      categories,
      user_copies!deck_cards_copy_id_fkey(is_proxy)
    `)
    .eq('deck_id', deckId)
    .order('card_name')

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Helper to parse primary category from JSON categories string
  function parsePrimaryCategory(raw: string | null | undefined): string {
    if (!raw) return 'Other'
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string')
        return parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
    } catch { /* */ }
    return raw.split(',')[0]?.trim().replace(/\(top\)|\(bottom\)/gi, '') || 'Other'
  }

  // Map to the shape computeDeckCardStatuses expects
  const cards = (deckCards ?? []).map((row: any) => ({
    id: row.id,
    card_name: row.card_name,
    scryfall_id: row.scryfall_id ?? null,
    copy_id: row.copy_id,
    is_proxy: row.user_copies?.is_proxy ?? null,
    categories: row.categories,
  }))

  const statuses = await computeDeckCardStatuses(cards, userId)

  // Build a map of card id -> primary category for filtering counts
  const categoryMap = new Map<number, string>()
  for (const card of cards) {
    categoryMap.set(card.id, parsePrimaryCategory(card.categories))
  }

  // Filter out Maybeboard and Sideboard from counts (they don't count toward deck size)
  const countableStatuses = statuses.filter(s => {
    const category = categoryMap.get(s.deckCardsId)
    return category !== 'Maybeboard' && category !== 'Sideboard'
  })

  // Compute summary counts (exclude generic_land from total — it's an exemption, not a status)
  // 'alternate' counts as 'available' since it represents owned cards in storage (different printing)
  const counts = {
    total: countableStatuses.filter(s => s.status !== 'generic_land').length,
    original: countableStatuses.filter(s => s.allocationStatus === 'original').length,
    proxy: countableStatuses.filter(s => s.allocationStatus === 'proxy').length,
    available: countableStatuses.filter(s => s.allocationStatus === 'available' || s.allocationStatus === 'alternate').length,
    claimed: countableStatuses.filter(s => s.allocationStatus === 'claimed').length,
    unowned: countableStatuses.filter(s => s.allocationStatus === 'unowned').length,
    generic_land: countableStatuses.filter(s => s.allocationStatus === 'generic_land').length,
    planned: countableStatuses.filter(s => s.lifecycle === 'planned' && s.status !== 'generic_land').length,
    sleeved: countableStatuses.filter(s => s.lifecycle === 'sleeved').length,
  }

  return Response.json({ cards: statuses, counts })
}
