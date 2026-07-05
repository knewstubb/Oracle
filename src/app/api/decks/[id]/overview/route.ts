import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

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
    .select('id')
    .eq('id', deckId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Check for cached overview content
  const { data: row } = await supabase
    .from('deck_overview_content')
    .select('content')
    .eq('deck_id', deckId)
    .maybeSingle()

  if (row) {
    try {
      return Response.json(JSON.parse(row.content))
    } catch {
      // Invalid JSON — treat as missing
    }
  }

  // No content yet — return 404 so the UI shows empty state
  return Response.json({ error: 'No overview generated' }, { status: 404 })
}
