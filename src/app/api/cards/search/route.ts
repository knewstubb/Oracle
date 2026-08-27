/**
 * GET /api/cards/search?q=<query>&deckId=<deckId>
 *
 * Smart card search for deck building. Searches local ref_cards database first,
 * applies ranking based on relevance, ownership, and deck context, then supplements
 * with Scryfall for cards not in our database.
 *
 * Query params:
 *   q       - Search query (min 2 chars)
 *   deckId  - Optional deck ID for color identity filtering and ownership context
 *
 * Returns: { data: Array<{ name: string, owned: boolean, isCommander: boolean }> }
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'

interface CardResult {
  name: string
  owned: boolean
  isCommander: boolean
  score: number
}

interface RefCard {
  name: string
  color_identity: string | null
  can_be_commander: boolean | null
  is_legendary: boolean | null
  edhrec_rank: number | null
  commander_legal: boolean | null
}

/**
 * Calculate relevance score for a card based on various factors
 */
function calculateScore(
  card: RefCard,
  query: string,
  queryLower: string,
  isOwned: boolean,
  deckColorIdentity: string | null
): number {
  let score = 0
  const nameLower = card.name.toLowerCase()

  // Exact match (case-insensitive)
  if (nameLower === queryLower) {
    score += 1000
  }

  // Starts with query (prefix match) - important for "Urza," matching "Urza, Lord"
  if (nameLower.startsWith(queryLower)) {
    score += 100
  }

  // Word boundary match - query appears after a space or comma
  // This helps "Urza," match "Urza, Lord High Artificer" over "Urza's Bauble"
  const wordBoundaryPattern = new RegExp(`(^|[\\s,])${escapeRegex(queryLower)}`, 'i')
  if (wordBoundaryPattern.test(card.name)) {
    score += 50
  }

  // Commander status - high value targets
  if (card.can_be_commander) {
    score += 40
  } else if (card.is_legendary) {
    score += 15
  }

  // User owns the card - prefer cards they can actually use
  if (isOwned) {
    score += 30
  }

  // Color identity match with deck (if provided)
  if (deckColorIdentity && card.color_identity) {
    if (isColorIdentityLegal(card.color_identity, deckColorIdentity)) {
      score += 20
    } else {
      // Penalty for cards that don't fit the deck's colors
      score -= 10
    }
  }

  // EDHREC popularity - lower rank = more popular (scaled 0-10)
  if (card.edhrec_rank && card.edhrec_rank > 0) {
    // Top 100 cards get +10, top 1000 get +5, etc.
    if (card.edhrec_rank <= 100) {
      score += 10
    } else if (card.edhrec_rank <= 500) {
      score += 7
    } else if (card.edhrec_rank <= 1000) {
      score += 5
    } else if (card.edhrec_rank <= 5000) {
      score += 2
    }
  }

  // Commander legal cards get a small boost (all results are commander-legal due to query filter)
  if (card.commander_legal) {
    score += 2
  }

  return score
}

/**
 * Check if a card's color identity is legal in a deck
 */
function isColorIdentityLegal(cardColors: string, deckColors: string): boolean {
  // Empty color identity (colorless) is always legal
  if (!cardColors) return true
  
  // Each color in the card must be in the deck's identity
  for (const color of cardColors) {
    if (!deckColors.includes(color)) {
      return false
    }
  }
  return true
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')
  const deckIdParam = request.nextUrl.searchParams.get('deckId')

  if (!q || q.length < 2) {
    return Response.json({ data: [] })
  }

  const queryLower = q.toLowerCase()
  const supabase = createAdminClient()

  // Get deck color identity if deckId provided
  let deckColorIdentity: string | null = null
  if (deckIdParam) {
    const deckId = parseInt(deckIdParam, 10)
    if (!isNaN(deckId)) {
      const { data: deck } = await supabase
        .from('decks')
        .select('commander_id, ref_commanders(color_identity)')
        .eq('id', deckId)
        .maybeSingle()
      
      if (deck?.ref_commanders) {
        deckColorIdentity = (deck.ref_commanders as { color_identity: string }).color_identity
      }
    }
  }

  // Get user's owned cards for ownership boost (optional - works without auth)
  let ownedCardNames = new Set<string>()
  const user = await getAuthUser()
  if (user) {
    const { data: ownedCards } = await supabase
      .from('user_cards')
      .select('card_name')
      .eq('user_id', user.id)
    
    if (ownedCards) {
      ownedCardNames = new Set(ownedCards.map(c => c.card_name))
    }
  }

  // Search ref_cards with ILIKE for substring matching
  // Use simple ILIKE pattern - contains query anywhere in name
  // Filter to commander-legal cards only since this is a Commander deck builder
  const { data: localCards, error } = await supabase
    .from('ref_cards')
    .select('name, color_identity, can_be_commander, is_legendary, edhrec_rank, commander_legal')
    .ilike('name', `%${q}%`)
    .eq('commander_legal', true)
    .limit(100) // Get more than we need for better ranking

  if (error) {
    console.error('[cards/search] ref_cards query error:', error.message)
    return fallbackToScryfall(q)
  }

  // Score and sort results
  const scoredResults: CardResult[] = (localCards || []).map((card: RefCard) => ({
    name: card.name,
    owned: ownedCardNames.has(card.name),
    isCommander: card.can_be_commander ?? false,
    score: calculateScore(card, q, queryLower, ownedCardNames.has(card.name), deckColorIdentity),
  }))

  // Sort by score descending
  scoredResults.sort((a, b) => b.score - a.score)

  // Take top 15
  let results = scoredResults.slice(0, 15)

  // If we have few results, supplement with Scryfall
  // This handles brand new cards not yet in our database
  if (results.length < 10 && q.length >= 3) {
    const scryfallResults = await fetchScryfallAutocomplete(q)
    const existingNames = new Set(results.map(r => r.name))
    
    for (const name of scryfallResults) {
      if (!existingNames.has(name) && results.length < 15) {
        results.push({
          name,
          owned: ownedCardNames.has(name),
          isCommander: false, // We don't know from Scryfall autocomplete
          score: 0, // Scryfall results come after local results
        })
        existingNames.add(name)
      }
    }
  }

  // Return just what the client needs (without internal scores)
  return Response.json({
    data: results.map(r => ({
      name: r.name,
      owned: r.owned,
      isCommander: r.isCommander,
    })),
  })
}

/**
 * Fetch autocomplete results from Scryfall as a fallback
 */
async function fetchScryfallAutocomplete(q: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`,
      {
        headers: { 'User-Agent': 'TheOracle/0.1.0' },
        next: { revalidate: 3600 },
      }
    )

    if (!res.ok) return []

    const json = await res.json()
    return json.data ?? []
  } catch {
    return []
  }
}

/**
 * Fall back to pure Scryfall autocomplete if local search fails
 */
async function fallbackToScryfall(q: string): Promise<Response> {
  const names = await fetchScryfallAutocomplete(q)
  return Response.json({
    data: names.map(name => ({
      name,
      owned: false,
      isCommander: false,
    })),
  })
}
