/**
 * GET /api/allocation
 *
 * Get current allocation state.
 * - ?view=shared            → returns cards in 2+ decks with per-deck ownership status
 * - ?view=shared&deckId=X   → returns shared cards filtered to those in deck X AND at least one other
 * - ?deckId=X               → returns allocations for that deck (legacy)
 * - ?cardName=Y             → returns allocations for that card across all decks
 * - No params               → returns the full proxy report
 *
 * Validates: Requirements 7.2, 7.3, 7.4, 7.5
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import {
  getAllocationsForDeck,
  getAllocationsForCard,
  getProxyReport,
} from '@/lib/allocation-store'

/** Response shape for the allocation tab view */
export interface AllocationCardGroup {
  cardName: string
  decks: {
    deckId: number
    deckName: string
    ownershipStatus: 'original' | 'proxy' | 'not_owned'
    proxyOfDeckId: number | null
  }[]
}

/**
 * Returns cards appearing in 2+ decks with per-deck ownership status.
 * When deckId is provided, filters to cards in that deck AND at least one other.
 */
async function getSharedCardsAllocation(deckId?: number): Promise<AllocationCardGroup[]> {
  const supabase = createAdminClient()

  // Step 1: Find card names appearing in 2+ distinct decks
  // We need to query deck_cards grouped by card_name
  const { data: allCards, error: allErr } = await supabase
    .from('deck_cards')
    .select('card_name, deck_id')

  if (allErr) throw new Error(allErr.message)
  if (!allCards || allCards.length === 0) return []

  // Group by card_name and count distinct deck_ids
  const cardDeckMap = new Map<string, Set<number>>()
  for (const row of allCards) {
    if (!cardDeckMap.has(row.card_name)) {
      cardDeckMap.set(row.card_name, new Set())
    }
    cardDeckMap.get(row.card_name)!.add(row.deck_id)
  }

  // Filter to cards in 2+ decks
  let cardNames = [...cardDeckMap.entries()]
    .filter(([, decks]) => decks.size >= 2)
    .map(([name]) => name)

  if (cardNames.length === 0) return []

  // Step 2: If deckId filter provided, narrow to cards that include that deck
  if (deckId !== undefined) {
    cardNames = cardNames.filter((name) => cardDeckMap.get(name)!.has(deckId))
  }

  if (cardNames.length === 0) return []

  // Step 3: Get all deck_cards rows for these shared cards with ownership data
  const { data: rows, error: rowsErr } = await supabase
    .from('deck_cards')
    .select('card_name, deck_id, ownership_status, proxy_of_deck_id, decks!inner(name)')
    .in('card_name', cardNames)

  if (rowsErr) throw new Error(rowsErr.message)
  if (!rows) return []

  // Step 4: Group by card_name
  const groupMap = new Map<string, AllocationCardGroup>()

  for (const row of rows) {
    const deckName = (row.decks as unknown as { name: string })?.name ?? 'Unknown'
    if (!groupMap.has(row.card_name)) {
      groupMap.set(row.card_name, { cardName: row.card_name, decks: [] })
    }
    const group = groupMap.get(row.card_name)!
    group.decks.push({
      deckId: row.deck_id,
      deckName,
      ownershipStatus: (row.ownership_status as 'original' | 'proxy' | 'not_owned') ?? 'not_owned',
      proxyOfDeckId: row.proxy_of_deck_id,
    })
  }

  // Step 5: Only return groups that still have 2+ decks
  const results: AllocationCardGroup[] = []
  for (const group of groupMap.values()) {
    if (group.decks.length >= 2) {
      results.push(group)
    }
  }

  return results.sort((a, b) => a.cardName.localeCompare(b.cardName))
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const searchParams = request.nextUrl.searchParams
    const viewParam = searchParams.get('view')
    const deckIdParam = searchParams.get('deckId')
    const cardNameParam = searchParams.get('cardName')

    // New: shared cards view for the Allocation tab
    if (viewParam === 'shared') {
      const deckId = deckIdParam ? parseInt(deckIdParam, 10) : undefined
      if (deckIdParam && (isNaN(deckId!) || deckId! <= 0)) {
        return Response.json(
          { success: false, error: 'deckId must be a positive integer' },
          { status: 400 }
        )
      }
      const cards = await getSharedCardsAllocation(deckId)
      return Response.json({ cards })
    }

    // Legacy: allocations for a specific deck
    if (deckIdParam) {
      const deckId = parseInt(deckIdParam, 10)
      if (isNaN(deckId) || deckId <= 0) {
        return Response.json(
          { success: false, error: 'deckId must be a positive integer' },
          { status: 400 }
        )
      }

      const allocations = await getAllocationsForDeck(deckId)
      return Response.json({
        success: true,
        deckId,
        allocations,
        count: allocations.length,
      })
    }

    if (cardNameParam) {
      if (!cardNameParam.trim()) {
        return Response.json(
          { success: false, error: 'cardName must not be empty' },
          { status: 400 }
        )
      }

      const allocations = await getAllocationsForCard(cardNameParam)
      return Response.json({
        success: true,
        cardName: cardNameParam,
        allocations,
        count: allocations.length,
      })
    }

    // No filter — return full proxy report
    const proxyReport = await getProxyReport()
    return Response.json({
      success: true,
      proxyReport,
      totalProxiedCards: proxyReport.length,
      totalProxySlots: proxyReport.reduce((sum, entry) => sum + entry.deficit, 0),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[allocation] Unexpected error: ${message}`)
    return Response.json(
      { success: false, error: `Unexpected error: ${message}` },
      { status: 500 }
    )
  }
}
