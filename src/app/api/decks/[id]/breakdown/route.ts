/**
 * POST /api/decks/[id]/breakdown
 *
 * Releases all claimed cards from a deck by clearing physical_copy_id
 * and ownership_status on every deck_cards row. Does NOT delete physical_copies
 * or touch the collection — just frees the claims so other decks can use them.
 *
 * This is the "break down" / "disassemble" action.
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { assertAtomicRpcCount, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'
import { requireAuth } from '@/lib/auth'

export async function POST(
  _request: NextRequest,
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

  const supabase = createAdminClient()

  // Verify deck exists and belongs to user
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, user_id')
    .eq('id', deckId)
    .maybeSingle()

  if (deckErr) return Response.json({ error: deckErr.message }, { status: 500 })
  if (!deck || deck.user_id !== userId) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  const { data, error: releaseErr } = await (supabase.rpc as any)('release_deck_copies', {
    p_deck_id: deckId,
    p_user_id: userId,
  })

  if (releaseErr) {
    if (releaseErr.message?.includes('deck_not_found')) {
      return Response.json({ error: 'Deck not found' }, { status: 404 })
    }
    return Response.json({ error: releaseErr.message }, { status: 500 })
  }

  const result = assertAtomicRpcSuccess(data, 'release_deck_copies')
  const released = assertAtomicRpcCount(result, 'released_count', 'release_deck_copies')
  return Response.json({ released })
}
