import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { computeHealth } from '@/lib/health-engine'
import { upsertHealthResult, getHealthOverrides } from '@/lib/health-store'
import type { FunctionalCategory } from '@/lib/category-classifier'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Fetch deck cards with categories
  const { data: rows, error: rowsErr } = await supabase
    .from('deck_cards')
    .select('card_name, categories')
    .eq('deck_id', deckId)

  if (rowsErr) {
    return Response.json({ error: rowsErr.message }, { status: 500 })
  }

  // Transform cards for the health engine
  const cards = (rows ?? []).map((row) => ({
    cardName: row.card_name,
    categories: row.categories,
    oracleText: null,
    typeLine: null,
    isLand: isLandCard(row.categories),
  }))

  // Load manual card-level category overrides (currently no override table exists — use empty map)
  const overrides = new Map<string, FunctionalCategory>()

  // Load per-deck health threshold overrides
  const healthOverrides = await getHealthOverrides(deckId)

  // Compute health
  const result = computeHealth(cards, overrides, healthOverrides)
  result.deckId = deckId

  // Persist
  await upsertHealthResult(result, userId)

  return Response.json(result)
}

/**
 * Determine if a card is a land based on its Archidekt categories.
 * Archidekt users typically categorise lands under "Lands" or "Land".
 */
function isLandCard(rawCategories: string | null): boolean {
  if (!rawCategories) return false

  const trimmed = rawCategories.trim()

  // Try JSON array parse
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.some(
          (cat: string) => cat.toLowerCase() === 'lands' || cat.toLowerCase() === 'land'
        )
      }
    } catch {
      // Fall through to comma-separated
    }
  }

  // Comma-separated string
  return trimmed
    .split(',')
    .some((cat) => {
      const c = cat.trim().toLowerCase()
      return c === 'lands' || c === 'land'
    })
}
