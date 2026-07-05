import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { computeHealth } from '@/lib/health-engine'
import {
  getHealthOverrides,
  saveHealthOverrides,
  clearHealthOverrides,
  upsertHealthResult,
} from '@/lib/health-store'
import type { OverrideMap } from '@/lib/health-store'
import type { FunctionalCategory } from '@/lib/category-classifier'

// ---------------------------------------------------------------------------
// GET — Return current overrides for the deck
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

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

  const overrides = await getHealthOverrides(deckId)
  return Response.json({ overrides })
}

// ---------------------------------------------------------------------------
// PUT — Validate and save overrides, trigger health recomputation
// ---------------------------------------------------------------------------

export async function PUT(
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

  // Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const validationError = validateOverrideMap(body)
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 })
  }

  const overrides = body as OverrideMap

  // Save overrides
  await saveHealthOverrides(deckId, overrides)

  // Recompute health
  const result = await recomputeHealth(supabase, deckId, userId)

  return Response.json(result)
}

// ---------------------------------------------------------------------------
// DELETE — Clear overrides, recompute with global defaults
// ---------------------------------------------------------------------------

export async function DELETE(
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

  // Clear overrides
  await clearHealthOverrides(deckId)

  // Recompute health with null overrides (global defaults)
  const result = await recomputeHealth(supabase, deckId, userId)

  return Response.json(result)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate the override map shape.
 * Returns an error string if invalid, null if valid.
 */
function validateOverrideMap(body: unknown): string | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return 'Body must be an object'
  }

  const obj = body as Record<string, unknown>

  // Validate thresholds if present
  if ('thresholds' in obj && obj.thresholds !== undefined) {
    if (
      obj.thresholds === null ||
      typeof obj.thresholds !== 'object' ||
      Array.isArray(obj.thresholds)
    ) {
      return 'thresholds must be an object'
    }

    const thresholds = obj.thresholds as Record<string, unknown>
    for (const [category, entry] of Object.entries(thresholds)) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        return `thresholds.${category} must be an object with min and max`
      }

      const e = entry as Record<string, unknown>
      if (typeof e.min !== 'number' || typeof e.max !== 'number') {
        return `thresholds.${category} must have numeric min and max`
      }

      if (e.min > e.max) {
        return `thresholds.${category}: min (${e.min}) must be <= max (${e.max})`
      }
    }
  }

  // Validate amber_margin if present
  if ('amber_margin' in obj && obj.amber_margin !== undefined) {
    if (typeof obj.amber_margin !== 'number' || obj.amber_margin < 0) {
      return 'amber_margin must be a non-negative number'
    }
  }

  return null
}

/**
 * Recompute health for a deck and persist the result.
 */
async function recomputeHealth(supabase: ReturnType<typeof createAdminClient>, deckId: number, userId: string) {
  const { data: rows } = await supabase
    .from('deck_cards')
    .select('card_name, categories')
    .eq('deck_id', deckId)

  const cards = (rows ?? []).map((row) => ({
    cardName: row.card_name,
    categories: row.categories,
    oracleText: null,
    typeLine: null,
    isLand: isLandCard(row.categories),
  }))

  // No card-level classification overrides (empty map)
  const overrides = new Map<string, FunctionalCategory>()

  // Load per-deck health threshold overrides
  const healthOverrides = await getHealthOverrides(deckId)

  // Compute health
  const result = computeHealth(cards, overrides, healthOverrides)
  result.deckId = deckId

  // Persist
  await upsertHealthResult(result, userId)

  return result
}

/**
 * Determine if a card is a land based on its Archidekt categories.
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
          (cat: string) =>
            cat.toLowerCase() === 'lands' || cat.toLowerCase() === 'land'
        )
      }
    } catch {
      // Fall through to comma-separated
    }
  }

  // Comma-separated string
  return trimmed.split(',').some((cat) => {
    const c = cat.trim().toLowerCase()
    return c === 'lands' || c === 'land'
  })
}
