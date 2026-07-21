import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { isValidStatus, VALID_STATUSES } from '@/lib/deck-status'
import type { StatusUpdateResponse } from '@/lib/deck-status'

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

  // Parse and validate request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const { status } = body as { status?: string }

  if (!status || !isValidStatus(status)) {
    return Response.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Verify deck exists and capture previous status
  const { data: deck, error: fetchErr } = await supabase
    .from('decks')
    .select('id, name, status')
    .eq('id', deckId)
    .maybeSingle()

  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  const previousStatus = deck.status

  // Update deck status
  const { data: updated, error: updateErr } = await supabase
    .from('decks')
    .update({ status })
    .eq('id', deckId)
    .select('id, name, status')
    .single()

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  // Unarchiving returns Allocate to off (Section 4) — never silently restore to prior on-state
  if (previousStatus === 'graveyard' && status === 'in_rotation') {
    const { error: allocateErr } = await supabase
      .from('decks')
      .update({ allocate: false })
      .eq('id', deckId)

    if (allocateErr) {
      console.error(`[decks/${deckId}/status] Failed to reset allocate on unarchive: ${allocateErr.message}`)
    }
  }

  // --- Allocation side effects ---
  // [Phase 4] Status-change allocation trigger retired outright, no replacement.
  // Under Section 3, a deck can't reach Boxed until its picklist already shows
  // 100/100 — resolution has already happened incrementally by the time a
  // status transition fires. See spec Section 6f.
  let allocationRerun = false

  const response: StatusUpdateResponse = {
    deck: {
      id: updated.id,
      name: updated.name,
      status: updated.status as StatusUpdateResponse['deck']['status'],
    },
    allocationRerun,
  }

  return Response.json(response)
}
