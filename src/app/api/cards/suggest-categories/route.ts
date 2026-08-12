import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getCardTags, getCardTagsBatch } from '@/lib/scryfall-tags-data'
import { suggestCategoriesFromTags, type CategorySuggestion } from '@/lib/scryfall-category-mapping'

/**
 * GET /api/cards/suggest-categories
 * 
 * Get category suggestions for a card based on Scryfall tags.
 * 
 * Query params:
 * - cardName: Card name to look up
 * - oracleId: Oracle ID (preferred, faster lookup)
 * - scryfallId: Scryfall ID (will resolve to oracle_id)
 * 
 * Returns:
 * - suggestions: Array of CategorySuggestion objects
 * - cardName: Resolved card name
 * - oracleId: Resolved oracle ID
 * - tags: Raw tags from Scryfall
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { searchParams } = new URL(request.url)
  const cardName = searchParams.get('cardName')
  const oracleId = searchParams.get('oracleId')
  const scryfallId = searchParams.get('scryfallId')

  if (!cardName && !oracleId && !scryfallId) {
    return Response.json(
      { error: 'Must provide cardName, oracleId, or scryfallId' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  let resolvedOracleId = oracleId
  let resolvedCardName = cardName

  // Resolve oracle_id if not provided
  if (!resolvedOracleId) {
    if (scryfallId) {
      const { data: printing } = await supabase
        .from('ref_printings')
        .select('oracle_id, name')
        .eq('scryfall_id', scryfallId)
        .single()
      
      if (printing) {
        resolvedOracleId = printing.oracle_id
        resolvedCardName = printing.name
      }
    } else if (cardName) {
      // Look up by card name
      const { data: printing } = await supabase
        .from('ref_printings')
        .select('oracle_id, name')
        .ilike('name', cardName)
        .limit(1)
        .single()
      
      if (printing) {
        resolvedOracleId = printing.oracle_id
        resolvedCardName = printing.name
      }
    }
  }

  if (!resolvedOracleId) {
    return Response.json(
      { error: 'Card not found', suggestions: [], tags: [] },
      { status: 404 }
    )
  }

  // Get tags from Scryfall tags data
  const tagEntry = await getCardTags(resolvedOracleId)
  
  if (!tagEntry) {
    return Response.json({
      cardName: resolvedCardName,
      oracleId: resolvedOracleId,
      suggestions: [],
      tags: [],
      message: 'No Scryfall tags found for this card',
    })
  }

  // Get category suggestions
  const suggestions = suggestCategoriesFromTags(
    tagEntry.tags,
    tagEntry.archetypeSignals,
    tagEntry.themeSignals
  )

  return Response.json({
    cardName: resolvedCardName,
    oracleId: resolvedOracleId,
    suggestions,
    tags: tagEntry.tags,
    archetypeSignals: tagEntry.archetypeSignals,
    themeSignals: tagEntry.themeSignals,
  })
}

/**
 * POST /api/cards/suggest-categories
 * 
 * Batch endpoint for getting category suggestions for multiple cards.
 * 
 * Body:
 * - cards: Array of { cardName?, oracleId?, scryfallId? }
 * 
 * Returns:
 * - results: Map of identifier → suggestions
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const body = await request.json()
  const cards: Array<{ cardName?: string; oracleId?: string; scryfallId?: string }> = body.cards || []

  if (cards.length === 0) {
    return Response.json({ results: {} })
  }

  if (cards.length > 100) {
    return Response.json(
      { error: 'Maximum 100 cards per request' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  
  // Collect oracle IDs that need lookup
  const needsLookup: Array<{ index: number; scryfallId?: string; cardName?: string }> = []
  const oracleIds: string[] = []
  const indexToOracleId = new Map<number, string>()

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    if (card.oracleId) {
      oracleIds.push(card.oracleId)
      indexToOracleId.set(i, card.oracleId)
    } else {
      needsLookup.push({ index: i, scryfallId: card.scryfallId, cardName: card.cardName })
    }
  }

  // Batch lookup for cards without oracle_id
  if (needsLookup.length > 0) {
    const scryfallIds = needsLookup.filter(c => c.scryfallId).map(c => c.scryfallId!)
    const cardNames = needsLookup.filter(c => !c.scryfallId && c.cardName).map(c => c.cardName!)

    if (scryfallIds.length > 0) {
      const { data: printings } = await supabase
        .from('ref_printings')
        .select('scryfall_id, oracle_id')
        .in('scryfall_id', scryfallIds)

      const scryfallToOracle = new Map(
        (printings ?? []).map(p => [p.scryfall_id, p.oracle_id])
      )

      for (const item of needsLookup) {
        if (item.scryfallId) {
          const oracleId = scryfallToOracle.get(item.scryfallId)
          if (oracleId) {
            oracleIds.push(oracleId)
            indexToOracleId.set(item.index, oracleId)
          }
        }
      }
    }

    if (cardNames.length > 0) {
      const { data: printings } = await supabase
        .from('ref_printings')
        .select('name, oracle_id')
        .in('name', cardNames)

      const nameToOracle = new Map(
        (printings ?? []).map(p => [p.name.toLowerCase(), p.oracle_id])
      )

      for (const item of needsLookup) {
        if (!item.scryfallId && item.cardName) {
          const oracleId = nameToOracle.get(item.cardName.toLowerCase())
          if (oracleId) {
            oracleIds.push(oracleId)
            indexToOracleId.set(item.index, oracleId)
          }
        }
      }
    }
  }

  // Batch fetch tags
  const uniqueOracleIds = [...new Set(oracleIds)]
  const tagMap = await getCardTagsBatch(uniqueOracleIds)

  // Build results
  const results: Record<string, {
    suggestions: CategorySuggestion[]
    tags: string[]
  }> = {}

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    const oracleId = indexToOracleId.get(i)
    const key = card.cardName || card.oracleId || card.scryfallId || `card-${i}`

    if (!oracleId) {
      results[key] = { suggestions: [], tags: [] }
      continue
    }

    const tagEntry = tagMap.get(oracleId)
    if (!tagEntry) {
      results[key] = { suggestions: [], tags: [] }
      continue
    }

    const suggestions = suggestCategoriesFromTags(
      tagEntry.tags,
      tagEntry.archetypeSignals,
      tagEntry.themeSignals
    )

    results[key] = {
      suggestions,
      tags: tagEntry.tags,
    }
  }

  return Response.json({ results })
}
