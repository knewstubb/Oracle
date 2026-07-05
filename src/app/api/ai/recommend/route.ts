import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { buildAround, commanderOverview, suggestCuts } from '@/lib/mcp-client'

export interface CardSuggestion {
  name: string
  manaCost: string
  reasoning: string
  owned: boolean
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
      .select('id, name, commander_name')
      .eq('id', deckId)
      .single()

    if (deckErr || !deck) {
      return Response.json({ error: 'Deck not found' }, { status: 404 })
    }

    const { data: cards, error: cardsErr } = await supabase
      .from('deck_cards')
      .select('card_name, scryfall_id, set_code, is_commander')
      .eq('deck_id', deckId)

    if (cardsErr) {
      return Response.json({ error: cardsErr.message }, { status: 500 })
    }

    const commanderName =
      deck.commander_name ||
      cards?.find((c) => c.is_commander)?.card_name ||
      ''
    const cardNames = (cards ?? []).map((c) => c.card_name)

    // Fetch collection for owned checks
    const { data: collection } = await supabase
      .from('collection')
      .select('card_name, quantity')

    const ownedSet = new Set(
      (collection ?? []).map((c) => c.card_name.toLowerCase())
    )

    // Run MCP calls in parallel: build-around for adds, suggest-cuts for cuts
    const [addResult, cutResult] = await Promise.allSettled([
      buildAround([commanderName], 'commander', { limit: 10 }),
      suggestCuts(cardNames, commanderName, 5),
    ])

    const addData =
      addResult.status === 'fulfilled' ? addResult.value : null
    const cutData =
      cutResult.status === 'fulfilled' ? cutResult.value : null

    if (!addData && !cutData) {
      const reason =
        addResult.status === 'rejected'
          ? addResult.reason?.message
          : 'Unknown error'
      return Response.json(
        { error: `Recommendations failed: ${reason}` },
        { status: 500 }
      )
    }

    // Build add suggestions, filtering out cards already in deck
    const deckCardSet = new Set(cardNames.map((n) => n.toLowerCase()))
    let adds: CardSuggestion[] = (addData?.cards ?? [])
      .filter((c) => !deckCardSet.has(c.name.toLowerCase()))
      .map((c) => ({
        name: c.name,
        manaCost: c.manaCost || '',
        reasoning: c.role || '',
        owned: ownedSet.has(c.name.toLowerCase()),
      }))

    // If collectionOnly, filter to owned cards
    if (collectionOnly) {
      adds = adds.filter((c) => c.owned)
    }

    // Build cut suggestions
    const cuts: CardSuggestion[] = (cutData?.cuts ?? []).map((c) => ({
      name: c.name,
      manaCost: '',
      reasoning: c.reason || '',
      owned: ownedSet.has(c.name.toLowerCase()),
    }))

    return Response.json({ adds, cuts })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      { error: `Recommendations failed: ${message}` },
      { status: 500 }
    )
  }
}
