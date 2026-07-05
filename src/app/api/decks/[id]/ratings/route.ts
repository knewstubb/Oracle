import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId) || deckId <= 0 || String(deckId) !== id) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createServerClient()

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

  const { data: row } = await supabase
    .from('deck_ratings')
    .select('content')
    .eq('deck_id', deckId)
    .maybeSingle()

  if (row) {
    try {
      return Response.json(JSON.parse(row.content))
    } catch {
      // Malformed JSON — treat as missing
    }
  }

  return Response.json(
    { error: 'No ratings generated for this deck' },
    { status: 404 }
  )
}
