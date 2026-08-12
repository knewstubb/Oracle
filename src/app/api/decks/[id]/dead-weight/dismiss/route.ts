import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function POST(
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

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'card_name is required' }, { status: 400 })
  }

  if (!body.card_name || typeof body.card_name !== 'string') {
    return Response.json({ error: 'card_name is required' }, { status: 400 })
  }

  const cardName = body.card_name as string

  // Dismissal is now tracked via deck_cards.dead_weight_flag = 'dismissed'
  const { data, error: updateErr } = await supabase
    .from('deck_cards')
    .update({ dead_weight_flag: 'dismissed' })
    .eq('deck_id', deckId)
    .eq('card_name', cardName)
    .select('id')

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  if (!data || data.length === 0) {
    return Response.json({ error: 'Card not found in deck' }, { status: 404 })
  }

  return Response.json(
    { dismissed: true, card_name: cardName },
    { status: 201 }
  )
}

export async function DELETE(
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

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'card_name is required' }, { status: 400 })
  }

  if (!body.card_name || typeof body.card_name !== 'string') {
    return Response.json({ error: 'card_name is required' }, { status: 400 })
  }

  const cardName = body.card_name as string

  // Clear the dead weight flag
  await supabase
    .from('deck_cards')
    .update({ dead_weight_flag: null, dead_weight_reason: null })
    .eq('deck_id', deckId)
    .eq('card_name', cardName)

  return Response.json({ dismissed: false, card_name: cardName })
}
