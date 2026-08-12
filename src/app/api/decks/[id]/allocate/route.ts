/**
 * POST /api/decks/[id]/allocate
 *
 * Runs auto-assign for this specific deck's unresolved slots.
 * Only claims from free storage (Tier 1–2). Never clears existing.
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
