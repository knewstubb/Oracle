import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { name } = await params
  const cardName = decodeURIComponent(name)

  if (!cardName) {
    return Response.json({ error: 'Card name is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: rows, error } = await supabase
    .from('deck_cards')
    .select(`
      deck_id,
      tags,
      decks!inner ( name )
    `)
    .eq('card_name', cardName)
    .order('deck_id')

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const decks = (rows || []).map((r) => {
    const deckInfo = r.decks as unknown as { name: string }
    return {
      id: r.deck_id,
      name: deckInfo?.name || '',
      is_proxy: (r.tags || '').toLowerCase().includes('proxy'),
    }
  })

  // Sort by deck name
  decks.sort((a, b) => a.name.localeCompare(b.name))

  return Response.json({
    card_name: cardName,
    deck_count: decks.length,
    decks,
  })
}
