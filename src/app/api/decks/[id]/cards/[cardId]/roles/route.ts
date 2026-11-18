import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { fetchRefTextByName } from '@/lib/ref-card-text'
import { cardWindowRoles, cardWindowTypes } from '@/lib/card-window-roles'

/**
 * GET /api/decks/[id]/cards/[cardId]/roles
 * Read-only. The roles the app works out today for one card of the signed-in user's deck, from the card text
 * (the same function Deck health uses). Nothing is stored. Another user's deck or card is a 404; a failed
 * lookup is a real error (500), never an empty answer (D-030).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id, cardId } = await params
  const deckId = parseInt(id, 10)
  const deckCardId = parseInt(cardId, 10)
  if (isNaN(deckId) || isNaN(deckCardId)) {
    return Response.json({ error: 'Invalid deck ID or card ID' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', authResult.id)
    .maybeSingle()
  if (deckErr) return Response.json({ error: deckErr.message }, { status: 500 })
  if (!deck) return Response.json({ error: 'Deck not found' }, { status: 404 })
  const { data: row, error: rowErr } = await supabase
    .from('deck_cards')
    .select('card_name')
    .eq('id', deckCardId)
    .eq('deck_id', deckId)
    .maybeSingle()
  if (rowErr) return Response.json({ error: rowErr.message }, { status: 500 })
  if (!row) return Response.json({ error: 'Card not found in this deck' }, { status: 404 })
  const cardName = (row as { card_name: string }).card_name
  const { map, error: refErr } = await fetchRefTextByName(supabase, [cardName])
  if (refErr) return Response.json({ error: refErr }, { status: 500 })
  const ref = map.get(cardName)
  // One lookup answers both the roles and the type groups the card window shows.
  return Response.json({
    ...cardWindowRoles({ name: cardName, typeLine: ref?.type_line ?? null, oracleText: ref?.oracle_text ?? null }),
    types: cardWindowTypes(ref?.type_line ?? null),
  })
}
