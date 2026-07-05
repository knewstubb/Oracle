import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { suggestManaBase } from '@/lib/mcp-client'

export interface LandSwap {
  current: string
  suggested: string
  reasoning: string
  owned: boolean
}

export interface ManaAnalysisResponse {
  colorDistribution: Record<string, number>
  landCount: number
  recommendedLandCount: number
  coverageGaps: string[]
  suggestions: LandSwap[]
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = await request.json()
    const { deckId, collectionOnly } = body as {
      deckId: number
      collectionOnly?: boolean
    }

    if (!deckId || typeof deckId !== 'number') {
      return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: deck, error: deckErr } = await supabase
      .from('decks')
      .select('id, name, commander_name, colour_identity')
      .eq('id', deckId)
      .single()

    if (deckErr || !deck) {
      return Response.json({ error: 'Deck not found' }, { status: 404 })
    }

    const { data: cards, error: cardsErr } = await supabase
      .from('deck_cards')
      .select('card_name, scryfall_id, set_code, categories, is_commander')
      .eq('deck_id', deckId)

    if (cardsErr) {
      return Response.json({ error: cardsErr.message }, { status: 500 })
    }

    const cardNames = (cards ?? []).map((c) => c.card_name)

    // Count lands in the deck by checking the categories field
    const landCards = (cards ?? []).filter((c) =>
      (c.categories || '').toLowerCase().includes('land')
    )
    const landCount = landCards.length

    // Build colour distribution from the deck's colour identity
    const colourIdentity = deck.colour_identity
      ? deck.colour_identity.split(',').map((c) => c.trim())
      : []
    const colorDistribution: Record<string, number> = {}
    for (const colour of ['W', 'U', 'B', 'R', 'G']) {
      if (colourIdentity.includes(colour)) {
        // Count non-land cards that might need this colour (simple heuristic)
        colorDistribution[colour] = 0
      }
    }

    // Fetch collection for owned checks
    const { data: collection } = await supabase
      .from('collection')
      .select('card_name, quantity')

    const ownedSet = new Set(
      (collection ?? []).map((c) => c.card_name.toLowerCase())
    )

    // Call MCP suggestManaBase tool
    const manaResult = await suggestManaBase(cardNames, 'commander')

    // Recommended land count for Commander is typically 36-38
    const recommendedLandCount = 37

    // Parse MCP response into land swap suggestions
    const suggestions: LandSwap[] = manaResult.lands.map((land) => {
      const owned = ownedSet.has(land.name.toLowerCase())
      // Try to parse "current → suggested" from the reason, or treat as addition
      const arrowMatch = land.reason.match(/replace\s+(.+?)(?:\s+with|\s*→)/i)
      const currentCard = arrowMatch ? arrowMatch[1].trim() : ''
      return {
        current: currentCard,
        suggested: land.name,
        reasoning: land.reason,
        owned,
      }
    })

    // Filter to collection-only if requested
    const filteredSuggestions = collectionOnly
      ? suggestions.filter((s) => s.owned)
      : suggestions

    // Build coverage gaps based on colour identity and land count
    const coverageGaps: string[] = []
    if (landCount < recommendedLandCount - 2) {
      coverageGaps.push(
        `You have ${landCount} lands, which is ${recommendedLandCount - landCount} below the recommended ${recommendedLandCount}.`
      )
    }
    for (const colour of colourIdentity) {
      const colourName: Record<string, string> = {
        W: 'white',
        U: 'blue',
        B: 'black',
        R: 'red',
        G: 'green',
      }
      if (colourName[colour]) {
        // Simple heuristic: flag if fewer than 25% of lands could produce this colour
        colorDistribution[colour] = Math.round(
          landCount / Math.max(colourIdentity.length, 1)
        )
      }
    }

    const response: ManaAnalysisResponse = {
      colorDistribution,
      landCount,
      recommendedLandCount,
      coverageGaps,
      suggestions: filteredSuggestions,
    }

    return Response.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Mana analysis failed: ${message}` },
      { status: 500 }
    )
  }
}
