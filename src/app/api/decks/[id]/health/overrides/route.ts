import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import {
  getHealthOverrides,
  saveHealthOverrides,
  clearHealthOverrides,
} from '@/lib/health-store'
import type { OverrideMap } from '@/lib/health-store'

// ---------------------------------------------------------------------------
// GET — Return current overrides for the deck
// ---------------------------------------------------------------------------

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
    .eq('user_id', userId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  try {
    const overrides = await getHealthOverrides(deckId)
    return Response.json({ overrides })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Could not read overrides' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PUT — Validate and save overrides
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
    .eq('user_id', userId)
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

  // Save overrides. Deck health is computed on request and does not use these in Phase 2 (slice 1).
  try {
    await saveHealthOverrides(deckId, overrides)
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Could not save overrides' }, { status: 500 })
  }

  return Response.json({ overrides })
}

// ---------------------------------------------------------------------------
// DELETE — Clear overrides
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
    .eq('user_id', userId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  try {
    await clearHealthOverrides(deckId)
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Could not clear overrides' }, { status: 500 })
  }

  return Response.json({ overrides: null })
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
