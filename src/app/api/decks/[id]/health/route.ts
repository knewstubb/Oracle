import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getHealthResult, upsertHealthResult, getHealthOverrides } from '@/lib/health-store'
import { computeHealth } from '@/lib/health-engine'
import type { FunctionalCategory } from '@/lib/category-classifier'

export async function GET(
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

  // Try to load existing health data
  let result = await getHealthResult(deckId)

  // Auto-compute if no health data exists yet
  if (!result) {
    try {
      const { data: rows, error: rowsErr } = await supabase
        .from('deck_cards')
        .select('card_name, categories')
        .eq('deck_id', deckId)

      if (rowsErr) throw rowsErr

      const cards = (rows ?? []).map((row) => ({
        cardName: row.card_name,
        categories: row.categories,
        oracleText: null,
        typeLine: null,
        isLand: isLandCard(row.categories),
      }))

      const overrides = new Map<string, FunctionalCategory>()
      const healthOverrides = await getHealthOverrides(deckId)

      result = computeHealth(cards, overrides, healthOverrides)
      result.deckId = deckId

      // Persist so subsequent loads are instant
      await upsertHealthResult(result, userId)
    } catch (err) {
      // If auto-compute fails, return empty state rather than an error
      return Response.json({
        deckId,
        categories: [],
        overallStatus: 'green',
        computedAt: new Date().toISOString(),
      })
    }
  }

  return Response.json(result)
}

/**
 * Determine if a card is a land based on its Archidekt categories.
 */
function isLandCard(rawCategories: string | null): boolean {
  if (!rawCategories) return false

  const trimmed = rawCategories.trim()

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

  return trimmed
    .split(',')
    .some((cat) => {
      const c = cat.trim().toLowerCase()
      return c === 'lands' || c === 'land'
    })
}
