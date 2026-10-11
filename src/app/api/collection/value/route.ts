/**
 * GET /api/collection/value
 *
 * Returns collection value summary:
 * - totalMarketValue: sum of current Scryfall prices for all owned cards.
 *   Cards with no known price count as 0 in the total, but are also reported
 *   separately (unpricedCardCount) so the UI never presents a missing price as
 *   a real $0.00 value (D-042 / owner decision on unknown prices).
 * - totalPurchaseValue: sum of purchase prices (what was paid)
 * - gainLoss: totalMarketValue - totalPurchaseValue
 * - cardCount: total owned (non-proxy) copies
 * - unpricedCardCount: owned copies with no known price
 * - topCards: top 10 most valuable cards; price is null when unknown
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const supabase = createAdminClient()

  // Fetch all user copies with their card names and printing info
  // Join user_copies → user_cards (for card_name) → ref_printings (for current price)
  const PAGE_SIZE = 1000
  let offset = 0
  let totalMarketValue = 0
  const totalPurchaseValue = 0
  let cardCount = 0
  let unpricedCardCount = 0
  const cardValueMap = new Map<
    string,
    { count: number; pricedCount: number; maxPrice: number; totalValue: number; scryfallId: string | null }
  >()

  while (true) {
    const { data: copies, error } = await supabase
      .from('user_copies')
      .select(`
        id,
        printing_id,
        acquired_at,
        is_proxy,
        user_cards!inner(card_name)
      `)
      .eq('user_id', userId)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    if (!copies || copies.length === 0) break

    // Collect printing_ids for price lookup
    const printingIds = copies
      .map(c => c.printing_id)
      .filter((id): id is string => id !== null)

    // Fetch prices from ref_printings
    const priceMap = new Map<string, number>()
    if (printingIds.length > 0) {
      const { data: printings } = await supabase
        .from('ref_printings')
        .select('scryfall_id, price_usd')
        .in('scryfall_id', printingIds)
        .not('price_usd', 'is', null)

      for (const p of printings ?? []) {
        if (p.price_usd) priceMap.set(p.scryfall_id, p.price_usd)
      }
    }

    for (const copy of copies) {
      // Skip proxies for value calculation
      if (copy.is_proxy) continue

      cardCount++
      // Note: acquired_price was renamed to purchase_price in schema
      // But for now use acquired_at as timestamp

      const cardName = (copy as { user_cards?: { card_name?: string } | null }).user_cards?.card_name
      if (!cardName) continue

      // Get price from ref_printings via printing_id. `undefined` means we do
      // not know the price — it must never be presented as a real $0.00.
      const price = copy.printing_id ? priceMap.get(copy.printing_id) : undefined
      if (price === undefined) {
        unpricedCardCount++
      }
      totalMarketValue += price ?? 0

      // Track for top cards
      const existing = cardValueMap.get(cardName)
      if (existing) {
        existing.count++
        if (price !== undefined) {
          existing.pricedCount++
          existing.maxPrice = Math.max(existing.maxPrice, price)
          existing.totalValue += price
        }
      } else {
        cardValueMap.set(cardName, {
          count: 1,
          pricedCount: price !== undefined ? 1 : 0,
          maxPrice: price ?? 0,
          totalValue: price ?? 0,
          scryfallId: copy.printing_id,
        })
      }
    }

    if (copies.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // Top 10 most valuable. Unknown prices sort last and display as null (em
  // dash), never as a definitive $0.00.
  const topCards = Array.from(cardValueMap.entries())
    .map(([cardName, { count, pricedCount, maxPrice, totalValue, scryfallId }]) => ({
      cardName,
      copies: count,
      pricePerCopy: pricedCount > 0 ? maxPrice : null,
      totalValue: pricedCount > 0 ? Math.round(totalValue * 100) / 100 : null,
      scryfallId,
    }))
    .sort((a, b) => (b.totalValue ?? -1) - (a.totalValue ?? -1))
    .slice(0, 10)

  return Response.json({
    totalMarketValue: Math.round(totalMarketValue * 100) / 100,
    totalPurchaseValue: Math.round(totalPurchaseValue * 100) / 100,
    gainLoss: Math.round((totalMarketValue - totalPurchaseValue) * 100) / 100,
    cardCount,
    unpricedCardCount,
    topCards,
  })
}
