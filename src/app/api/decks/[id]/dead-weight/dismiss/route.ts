import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

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

  const { error: insertErr } = await supabase
    .from('dead_weight_dismissals')
    .insert({ deck_id: deckId, card_name: cardName, user_id: userId })

  if (insertErr) {
    if (insertErr.code === '23505') {
      return Response.json({ error: 'Card already dismissed' }, { status: 409 })
    }
    return Response.json({ error: insertErr.message }, { status: 500 })
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

  await supabase
    .from('dead_weight_dismissals')
    .delete()
    .eq('deck_id', deckId)
    .eq('card_name', cardName)

  return Response.json({ dismissed: false, card_name: cardName })
}
