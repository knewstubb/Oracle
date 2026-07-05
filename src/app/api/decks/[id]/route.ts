import { createServerClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  const { data: cards, error: cardsErr } = await supabase
    .from('deck_cards')
    .select('*')
    .eq('deck_id', deckId)
    .order('card_name')

  if (cardsErr) {
    return Response.json({ error: cardsErr.message }, { status: 500 })
  }

  // Get associated brew session if deck is a draft
  const { data: brewSession } = await supabase
    .from('brew_sessions')
    .select('id')
    .eq('deck_id', deckId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Include allocation data (proxy/original status per card)
  const { data: allocations } = await supabase
    .from('deck_allocations')
    .select('card_name, role')
    .eq('deck_id', deckId)

  const allocationMap: Record<string, string> = {}
  for (const a of allocations ?? []) {
    allocationMap[a.card_name] = a.role
  }

  // Merge allocation status into cards
  const cardsWithStatus = (cards ?? []).map(card => ({
    ...card,
    allocation_role: allocationMap[card.card_name] || 'original',
  }))

  return Response.json({ deck, cards: cardsWithStatus, brewSessionId: brewSession?.id ?? null })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, status')
    .eq('id', deckId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  if (deck.status === 'active') {
    return Response.json(
      { error: 'Active decks are managed in Archidekt. Remove it there and sync to remove it here.' },
      { status: 403 }
    )
  }

  // Enforce draft-only deletion at the data layer
  const { error: deleteErr, count } = await supabase
    .from('decks')
    .delete({ count: 'exact' })
    .eq('id', deckId)
    .eq('status', 'draft')

  if (deleteErr) {
    return Response.json({ error: deleteErr.message }, { status: 500 })
  }

  if (count === 0) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  return Response.json({ success: true })
}
