/**
 * GET /api/collection/value
 *
 * Returns collection value summary:
 * - totalMarketValue: sum of current market prices for all owned cards
 * - totalPurchaseValue: sum of purchase prices (what was paid)
 * - gainLoss: totalMarketValue - totalPurchaseValue
 * - cardCount: total physical copies
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

  // Fetch all physical copies with their card names and prices
  // Join physical_copies → card_definitions (for card_name) → card_metadata (for current price)
  const PAGE_SIZE = 1000
  let offset = 0
  let totalMarketValue = 0
  let totalPurchaseValue = 0
  let cardCount = 0
  const cardValues: Array<{ cardName: string; marketPrice: number; scryfallId: string | null }> = []

  while (true) {
    const { data: copies, error } = await supabase
      .from('physical_copies')
      .select(`
        id,
        scryfall_printing_id,
        purchase_price_usd,
        is_proxy,
        card_definitions!physical_copies_card_definition_id_fkey(card_name)
      `)
      .eq('user_id', userId)
      .eq('missing', false)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    if (!copies || copies.length === 0) break

    for (const copy of copies) {
      cardCount++
      if (copy.purchase_price_usd) {
        totalPurchaseValue += Number(copy.purchase_price_usd)
      }
    }

    if (copies.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // Get market prices from card_metadata for all unique card names
  // First get all unique card names from card_definitions
  const { data: allDefs } = await supabase
    .from('card_definitions')
    .select('card_name')
    .eq('user_id', userId)

  const cardNames = [...new Set((allDefs ?? []).map(d => d.card_name))]

  // Fetch prices in batches
  const priceMap = new Map<string, number>()
  for (let i = 0; i < cardNames.length; i += 200) {
    const batch = cardNames.slice(i, i + 200)
    const { data: metaRows } = await supabase
      .from('card_metadata')
      .select('card_name, price_usd')
      .in('card_name', batch)
      .not('price_usd', 'is', null)

    for (const row of metaRows ?? []) {
      if (row.price_usd) priceMap.set(row.card_name, row.price_usd)
    }
  }

  // Now compute total market value by counting copies per card name
  offset = 0
  const cardValueMap = new Map<string, { count: number; price: number; scryfallId: string | null }>()

  while (true) {
    const { data: copies, error } = await supabase
      .from('physical_copies')
      .select(`
        id,
        scryfall_printing_id,
        is_proxy,
        card_definitions!physical_copies_card_definition_id_fkey(card_name)
      `)
      .eq('user_id', userId)
      .eq('missing', false)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error || !copies || copies.length === 0) break

    for (const copy of copies) {
      const cardName = (copy as any).card_definitions?.card_name
      if (!cardName) continue

      const price = priceMap.get(cardName) ?? 0
      totalMarketValue += price

      // Track for top cards
      const existing = cardValueMap.get(cardName)
      if (existing) {
        existing.count++
      } else {
        cardValueMap.set(cardName, { count: 1, price, scryfallId: copy.scryfall_printing_id })
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
