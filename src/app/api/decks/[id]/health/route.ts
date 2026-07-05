import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getHealthResult } from '@/lib/health-store'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId) || deckId <= 0) {
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

  const result = await getHealthResult(deckId)
  if (!result) {
    return Response.json({ error: 'No health data. Run a recheck.' }, { status: 404 })
  }

  return Response.json(result)
}
