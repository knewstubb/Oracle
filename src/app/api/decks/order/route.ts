import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import type { DeckOrderError } from '../../../../../docs/oracle/contracts/deck-rename-and-reorder.types'

// PUT /api/decks/order { deckIds } saves the owner's WHOLE deck list in a new order, all or nothing (move_decks).
const KNOWN: readonly DeckOrderError[] = ['deck_order_empty', 'deck_order_duplicate', 'deck_order_mismatch']

export async function PUT(request: Request) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const body = await request.json().catch(() => null)
  const ids: unknown = body?.deckIds
  if (!Array.isArray(ids) || ids.length === 0) return Response.json({ error: 'deck_order_empty' satisfies DeckOrderError }, { status: 400 })
  if (!ids.every((n) => Number.isInteger(n) && n > 0)) return Response.json({ error: 'deck_order_mismatch' satisfies DeckOrderError }, { status: 400 })
  const supabase = createAdminClient()
  // move_decks is not in the generated database types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('move_decks', { p_user_id: authResult.id, p_deck_ids: ids as number[] })
  if (error) {
    const known = KNOWN.find((k) => error.message?.includes(k))
    if (known) return Response.json({ error: known }, { status: 409 })
    console.error('[deck order] move_decks failed', error.message)
    return Response.json({ error: 'save_failed' satisfies DeckOrderError }, { status: 500 })
  }
  const count = (data as { count?: number } | null)?.count ?? ids.length
  return Response.json({ ok: true, count })
}
