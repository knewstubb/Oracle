import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(
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

  // Parse optional limit query param — ignore if not a positive integer
  const limitParam = request.nextUrl.searchParams.get('limit')
  let limit: number | undefined
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10)
    if (!isNaN(parsed) && parsed > 0 && Number.isInteger(parsed)) {
      limit = parsed
    }
  }

  const supabase = createAdminClient()

  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', userId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: 'Failed to fetch notes' }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  let query = supabase
    .from('deck_notes')
    .select('id, deck_id, content, created_at')
    .eq('deck_id', deckId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (limit) {
    query = query.limit(limit)
  }

  const { data: notes, error } = await query

  if (error) {
    console.error('Failed to fetch deck notes:', error)
    return Response.json({ error: 'Failed to fetch notes' }, { status: 500 })
  }

  return Response.json({ notes: notes ?? [] })
}
