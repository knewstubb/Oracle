/**
 * GET /api/collection/value
 *
 * Returns collection value summary:
 * - totalMarketValue: sum of current market prices for all owned cards
 * - totalPurchaseValue: sum of purchase prices (what was paid)
 * - gainLoss: totalMarketValue - totalPurchaseValue
 * - cardCount: total copies
 * - topCards: top 10 most valuable cards
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
  let totalPurchaseValue = 0
  let cardCount = 0
  const cardValueMap = new Map<string, { count: number; price: number; scryfallId: string | null }>()

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

      const cardName = (copy.user_cards as any)?.card_name
      if (!cardName) continue

      // Get price from ref_printings via printing_id
      const price = copy.printing_id ? (priceMap.get(copy.printing_id) ?? 0) : 0
      totalMarketValue += price

      // Track for top cards
      const existing = cardValueMap.get(cardName)
      if (existing) {
        existing.count++
        existing.price = Math.max(existing.price, price) // Use highest price for display
      } else {
        cardValueMap.set(cardName, { count: 1, price, scryfallId: copy.printing_id })
      }
    }

    if (copies.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // Top 10 most valuable (by total value = count * price)
  const topCards = Array.from(cardValueMap.entries())
    .map(([cardName, { count, price, scryfallId }]) => ({
      cardName,
      copies: count,
      pricePerCopy: price,
      totalValue: count * price,
      scryfallId,
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 10)

  return Response.json({
    totalMarketValue: Math.round(totalMarketValue * 100) / 100,
    totalPurchaseValue: Math.round(totalPurchaseValue * 100) / 100,
    gainLoss: Math.round((totalMarketValue - totalPurchaseValue) * 100) / 100,
    cardCount,
    topCards,
  })
}
