/**
 * PUT /api/decks/[id]/command-zone
 *
 * Sets who the commander, second commander (Partner/Background) and companion are, in one
 * database call (set_deck_command_zone). Every id is a deck_cards.id of a card already in the deck.
 * It never removes a companion: remove it through DELETE /api/decks/[id]/cards/[cardId] first.
 *
 * Body: { primaryCardId, secondCardId?, secondRole?: 'partner'|'background', companionCardId? }
 * Response: { ok: true, deckId, primaryCardId, secondCardId, secondRole, companionCardId }
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { mapCommandZoneError, parseCommandZoneRequest } from '@/lib/command-zone-request'
import { lookupDeckColourIdentity } from '@/lib/deck-colour-identity'
import { checkSecondCommanderPair } from '@/lib/command-zone-pair-check'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const parsed = parseCommandZoneRequest(body)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }
  const req = parsed.value

  const supabase = createAdminClient()

  const pair = await checkSecondCommanderPair(supabase, deckId, userId, req)
  if (!pair.ok) {
    return Response.json({ error: pair.error, code: pair.code }, { status: pair.status })
  }

  const { data, error } = await supabase.rpc('set_deck_command_zone', {
    p_deck_id: deckId,
    p_user_id: userId,
    p_primary_card_id: req.primaryCardId,
    p_second_card_id: req.secondCardId,
    p_second_role: pair.secondRole,
    p_companion_card_id: req.companionCardId,
  })

  if (error) {
    const reply = mapCommandZoneError(error.message)
    return Response.json({ error: reply.error, code: reply.code }, { status: reply.status })
  }

  const result = (data ?? {}) as Record<string, unknown>
  if (result.deck_id !== deckId) {
    return Response.json({ error: 'Could not save the command zone. Nothing was changed.' }, { status: 500 })
  }

  // Keep the deck's colour identity (read by the legality check) in step with the commander(s).
  // Best effort: the command zone is already saved, so a failure here must not fail the request.
  try {
    const ids = [req.primaryCardId, req.secondCardId].filter((v): v is number => typeof v === 'number')
    if (ids.length > 0) {
      const { data: zoneRows } = await supabase
        .from('deck_cards')
        .select('card_name')
        .eq('deck_id', deckId)
        .eq('user_id', userId)
        .in('id', ids)
      const identity = await lookupDeckColourIdentity(
        supabase,
        (zoneRows ?? []).map((r: { card_name: string }) => r.card_name)
      )
      if (identity !== null) {
        await supabase.from('decks').update({ colour_identity: identity }).eq('id', deckId).eq('user_id', userId)
      }
    }
  } catch {
    // ignored on purpose
  }

  return Response.json({
    ok: true,
    deckId,
    primaryCardId: req.primaryCardId,
    secondCardId: req.secondCardId,
    secondRole: pair.secondRole,
    companionCardId: req.companionCardId,
  })
}
