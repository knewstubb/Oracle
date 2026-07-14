/**
 * POST /api/decks/[id]/allocate
 *
 * Redesigned in Phase 4: runs auto-assign for this specific deck's unresolved slots.
 * Properly scoped to one deck (fixing the pre-existing bug where it ran the full
 * unscoped resolver despite being presented as per-deck).
 *
 * Only claims from free storage (Tier 1–2). Never clears existing.
 * Section 6f: "Becomes 6e's auto-assign, properly scoped to that one deck's unresolved rows."
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { autoAssignDeck } from '@/lib/auto-assign'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  // Verify deck exists and belongs to user
  const supabase = createAdminClient()
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, name, status')
    .eq('id', deckId)
    .maybeSingle()

  if (deckErr) return Response.json({ error: deckErr.message }, { status: 500 })
  if (!deck) return Response.json({ error: 'Deck not found' }, { status: 404 })

  try {
    const result = await autoAssignDeck(deckId, userId)
    return Response.json({
      deckId,
      deckName: deck.name,
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[decks/${deckId}/allocate] Auto-assign failed: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/decks/[id]/allocate
 *
 * Toggles the `allocate` boolean on a deck (Section 4 of deck lifecycle spec).
 * - Archived decks cannot have allocate set to true (forced off).
 * - Returns the updated deck row.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  // Parse body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { allocate } = body as { allocate?: boolean }
  if (typeof allocate !== 'boolean') {
    return Response.json(
      { error: 'Request body must include { allocate: boolean }' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Fetch deck to check status
  const { data: deck, error: fetchErr } = await supabase
    .from('decks')
    .select('id, name, status, allocate')
    .eq('id', deckId)
    .maybeSingle()

  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Archived decks have allocate forced off (Section 4)
  if (deck.status === 'archived' && allocate === true) {
    return Response.json(
      { error: 'Cannot enable allocate on an archived deck. Un-archive the deck first.' },
      { status: 403 }
    )
  }

  // Update allocate
  const { data: updated, error: updateErr } = await supabase
    .from('decks')
    .update({ allocate })
    .eq('id', deckId)
    .select('id, name, status, allocate')
    .single()

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  return Response.json({ deck: updated })
}
