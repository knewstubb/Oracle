import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * PATCH /api/decks/[id]/active
 * 
 * Toggles or sets the is_active flag on a deck.
 * Active decks appear at the top of the decks page.
 * 
 * Request body: { is_active: boolean }
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

  // Parse request body
  let body: { is_active?: boolean }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (typeof body.is_active !== 'boolean') {
    return Response.json({ error: 'is_active must be a boolean' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify deck exists and belongs to user
  const { data: deck, error: fetchErr } = await supabase
    .from('decks')
    .select('id, name, is_active')
    .eq('id', deckId)
    .eq('user_id', authResult.id)
    .maybeSingle()

  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Update is_active
  const { data: updated, error: updateErr } = await supabase
    .from('decks')
    .update({ is_active: body.is_active })
    .eq('id', deckId)
    .eq('user_id', authResult.id)
    .select('id, name, is_active')
    .single()

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  return Response.json({
    deck: {
      id: updated.id,
      name: updated.name,
      is_active: updated.is_active,
    },
  })
}
