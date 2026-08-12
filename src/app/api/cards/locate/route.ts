/**
 * Card Location API
 * 
 * GET /api/cards/locate?q=cardname
 * 
 * Searches for a card by name and returns all decks where it appears,
 * along with ownership status for each slot.
 * 
 * Response: {
 *   query: string,
 *   cardName: string | null,  // Resolved card name (null if not found)
 *   locations: Array<{
 *     deckId: number,
 *     deckName: string,
 *     commanderName: string,
 *     quantity: number,
 *     status: 'original' | 'proxy' | 'claimed' | 'open',
 *     copyId: number | null,
 *   }>
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getCardByFuzzyName } from '@/lib/card-data'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim()

  if (!query || query.length < 2) {
    return NextResponse.json({ 
      error: 'Query must be at least 2 characters' 
    }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Try to resolve the card name (fuzzy match)
  let cardName: string | null = null
  
  // First, try exact match in user's deck_cards
  const { data: exactMatch } = await supabase
    .from('deck_cards')
    .select('card_name')
    .eq('user_id', userId)
    .ilike('card_name', query)
    .limit(1)
    .maybeSingle()

  if (exactMatch) {
    cardName = exactMatch.card_name
  } else {
    // Try fuzzy match via ref_cards
    const fuzzyResult = await getCardByFuzzyName(query)
    if (fuzzyResult) {
      cardName = fuzzyResult.name
    } else {
      // Last resort: partial match in deck_cards
      const { data: partialMatch } = await supabase
        .from('deck_cards')
        .select('card_name')
        .eq('user_id', userId)
        .ilike('card_name', `%${query}%`)
        .limit(1)
        .maybeSingle()
      
      cardName = partialMatch?.card_name ?? null
    }
  }

  if (!cardName) {
    return NextResponse.json({
      query,
      cardName: null,
      locations: [],
      message: 'Card not found in your decks',
    })
  }

  // Find all deck_cards entries for this card
  const { data: deckCards, error } = await supabase
    .from('deck_cards')
    .select(`
      id,
      deck_id,
      card_name,
      quantity,
      ownership_status,
      copy_id,
      decks!deck_cards_deck_id_fkey(
        id,
        name,
        commander_name,
        is_active
      )
    `)
    .eq('user_id', userId)
    .ilike('card_name', cardName)

  if (error) {
    console.error('[api/cards/locate] Query error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // Group by deck and aggregate quantities
  const deckMap = new Map<number, {
    deckId: number
    deckName: string
    commanderName: string
    isActive: boolean
    quantity: number
    statuses: string[]
    copyIds: (number | null)[]
  }>()

  for (const dc of deckCards ?? []) {
    const deck = dc.decks as any
    if (!deck) continue

    const existing = deckMap.get(deck.id)
    if (existing) {
      existing.quantity += dc.quantity || 1
      existing.statuses.push(dc.ownership_status || 'original')
      existing.copyIds.push(dc.copy_id)
    } else {
      deckMap.set(deck.id, {
        deckId: deck.id,
        deckName: deck.name,
        commanderName: deck.commander_name,
        isActive: deck.is_active,
        quantity: dc.quantity || 1,
        statuses: [dc.ownership_status || 'original'],
        copyIds: [dc.copy_id],
      })
    }
  }

  // Determine primary status for each deck
  const locations = Array.from(deckMap.values()).map(loc => {
    // Primary status: prefer 'original', then 'proxy', then 'claimed', then 'open'
    const hasOriginal = loc.statuses.includes('original')
    const hasProxy = loc.statuses.includes('proxy')
    const hasClaimed = loc.statuses.includes('claimed')
    
    let primaryStatus: string
    if (hasOriginal) {
      primaryStatus = 'original'
    } else if (hasProxy) {
      primaryStatus = 'proxy'
    } else if (hasClaimed) {
      primaryStatus = 'claimed'
    } else {
      primaryStatus = 'open'
    }

    return {
      deckId: loc.deckId,
      deckName: loc.deckName,
      commanderName: loc.commanderName,
      isActive: loc.isActive,
      quantity: loc.quantity,
      status: primaryStatus,
      hasPhysicalCopy: loc.copyIds.some(id => id !== null),
    }
  })

  // Sort: active decks first, then by deck name
  locations.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return a.deckName.localeCompare(b.deckName)
  })

  return NextResponse.json({
    query,
    cardName,
    locations,
  })
}
