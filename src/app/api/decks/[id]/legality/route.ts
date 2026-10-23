/**
 * GET /api/decks/[id]/legality
 * 
 * Checks all cards in a deck for format legality issues.
 * Returns cards that are banned, restricted, or have color identity violations.
 * 
 * Response: {
 *   format: string,
 *   isLegal: boolean,
 *   issues: Array<{
 *     cardName: string,
 *     reason: 'banned' | 'color_identity' | 'over_limit',
 *     details: string,
 *   }>
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { evaluateCommanderLegality } from '@/lib/deck-legality'

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
    return NextResponse.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Get deck with format and color identity
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, format, colour_identity, commander_name')
    .eq('id', deckId)
    .eq('user_id', userId)
    .maybeSingle()

  if (deckErr) {
    return NextResponse.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  const format = deck.format || 'commander'
  // Parse deck color identity - stored as "UB" (no separators), split each character
  const deckColorIdentity = new Set(
    (deck.colour_identity || '')
      .split('')
      .filter((c: string) => 'WUBRG'.includes(c))
  )

  // Get all cards in deck
  const { data: deckCards, error: cardsErr } = await supabase
    .from('deck_cards')
    .select('card_name, quantity, is_commander, command_zone_role')
    .eq('deck_id', deckId)

  if (cardsErr) {
    return NextResponse.json({ error: cardsErr.message }, { status: 500 })
  }

  if (!deckCards || deckCards.length === 0) {
    return NextResponse.json({
      format,
      isLegal: true,
      issues: [],
    })
  }

  // Get card names for lookup
  const cardNames = deckCards.map(c => c.card_name)

  // Fetch legality data from ref_cards
  const legalityMap: Record<string, { commander_legal: boolean; color_identity: string }> = {}
  
  for (let i = 0; i < cardNames.length; i += 200) {
    const batch = cardNames.slice(i, i + 200)
    const { data: cards } = await supabase
      .from('ref_cards')
      .select('name, commander_legal, color_identity')
      .in('name', batch)

    for (const card of cards ?? []) {
      legalityMap[card.name] = {
        commander_legal: card.commander_legal,
        color_identity: card.color_identity || '',
      }
    }
  }

  // Check each card for issues (the companion is outside the deck: see deck-legality.ts)
  const issues = evaluateCommanderLegality(deckCards, legalityMap, deckColorIdentity)

  return NextResponse.json({
    format,
    isLegal: issues.length === 0,
    issues,
  })
}
