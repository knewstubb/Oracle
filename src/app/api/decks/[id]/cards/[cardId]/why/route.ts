import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { normaliseWhy, whyColumnAvailable } from '@/lib/card-details/why-column'

/**
 * PUT /api/decks/[id]/cards/[cardId]/why   body { why: string | null }
 * Saves the one-line "Why it's here" for a deck card. Trims; empty means cleared; at most 200 characters.
 * 409 { code: 'why_not_available' } while the deck_cards.why_here column has not been added to the database.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; cardId: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id, cardId } = await params
  const deckId = parseInt(id, 10)
  const deckCardId = parseInt(cardId, 10)
  if (isNaN(deckId) || isNaN(deckCardId)) {
    return Response.json({ error: 'Invalid deck ID or card ID' }, { status: 400 })
  }
  let body: { why?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!('why' in body)) return Response.json({ error: 'why is required' }, { status: 400 })
  const parsed = normaliseWhy(body.why)
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })

  const supabase = createAdminClient()
  const { data: deck, error: deckErr } = await supabase.from('decks').select('id').eq('id', deckId).eq('user_id', authResult.id).maybeSingle()
  if (deckErr) return Response.json({ error: deckErr.message }, { status: 500 })
  if (!deck) return Response.json({ error: 'Deck not found' }, { status: 404 })

  if (!(await whyColumnAvailable(supabase))) {
    return Response.json({ error: "This note isn't available yet.", code: 'why_not_available' }, { status: 409 })
  }
  const { data, error } = await supabase
    .from('deck_cards')
    // why_here is not in the generated types until its migration is applied.
    .update({ why_here: parsed.value } as never)
    .eq('id', deckCardId)
    .eq('deck_id', deckId)
    .select('id')
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === '42703') {
      return Response.json({ error: "This note isn't available yet.", code: 'why_not_available' }, { status: 409 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }
  if (!data) return Response.json({ error: 'Card not found in this deck' }, { status: 404 })
  return Response.json({ why: parsed.value })
}
