import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

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

  const { data: rows, error: rowsErr } = await supabase
    .from('deck_cards')
    .select('card_name, dead_weight_flag, dead_weight_reason')
    .eq('deck_id', deckId)
    .not('dead_weight_flag', 'is', null)

  if (rowsErr) {
    return Response.json({ error: rowsErr.message }, { status: 500 })
  }

  const cards = (rows ?? []).map((row) => ({
    cardName: row.card_name,
    flag: row.dead_weight_flag,
    reason: row.dead_weight_reason,
  }))

  return Response.json({ cards })
}
