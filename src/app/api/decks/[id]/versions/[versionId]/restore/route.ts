/**
 * POST /api/decks/[id]/versions/[versionId]/restore
 *
 * Restore a deck to a previous version by replacing deck_cards with the snapshot.
 * Creates a "manual" snapshot of the current state before restoring.
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { assertAtomicRpcCount, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'
import { createVersionSnapshot, type CardSnapshot } from '@/lib/deck-versions'

interface RouteParams {
  params: Promise<{ id: string; versionId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id, versionId } = await params
  const deckId = parseInt(id, 10)
  const vId = parseInt(versionId, 10)

  if (isNaN(deckId) || isNaN(vId)) {
    return Response.json({ error: 'Invalid deck or version ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify deck ownership
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, user_id, name')
    .eq('id', deckId)
    .single()

  if (deckErr || !deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  if (deck.user_id !== userId) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Fetch the version to restore
  const { data: version, error: versionErr } = await supabase
    .from('deck_versions')
    .select('*')
    .eq('id', vId)
    .eq('deck_id', deckId)
    .single()

  if (versionErr || !version) {
    return Response.json({ error: 'Version not found' }, { status: 404 })
  }

  // Create a snapshot of current state before restoring
  await createVersionSnapshot(
    deckId,
    userId,
    'manual',
    `Pre-restore snapshot (before reverting to v${version.version_number})`
  )

  // Replace the composition through the atomic delta RPC. Assigned copies are
  // returned to the default storage location before their slots are removed.
  const { data: currentCards, error: currentCardsErr } = await supabase
    .from('deck_cards')
    .select('id')
    .eq('deck_id', deckId)
    .eq('user_id', userId)

  if (currentCardsErr) {
    return Response.json(
      { error: `Failed to read current deck cards: ${currentCardsErr.message}` },
      { status: 500 }
    )
  }

  const snapshot = version.cards_snapshot as CardSnapshot[]
  const additions = (snapshot ?? []).map((card) => ({
    card_name: card.card_name,
    scryfall_id: card.scryfall_id,
    set_code: card.set_code,
    categories: card.categories,
    quantity: card.quantity ?? 1,
    is_commander: card.is_commander,
  }))

  const { data: restoreResult, error: restoreErr } = await (supabase.rpc as any)('apply_ai_deck_delta', {
    p_deck_id: deckId,
    p_user_id: userId,
    p_additions: additions,
    p_remove_deck_card_ids: (currentCards ?? []).map((card) => card.id),
  })

  if (restoreErr) {
    if (restoreErr.message?.includes('deck_not_found') || restoreErr.message?.includes('deck_card_not_found')) {
      return Response.json({ error: 'Deck cards could not be restored' }, { status: 404 })
    }
    return Response.json(
      { error: `Failed to restore cards: ${restoreErr.message}` },
      { status: 500 }
    )
  }

  try {
    const result = assertAtomicRpcSuccess(restoreResult, 'apply_ai_deck_delta')
    assertAtomicRpcCount(
      result,
      'added_count',
      'apply_ai_deck_delta',
      additions.reduce((total, addition) => total + addition.quantity, 0)
    )
    assertAtomicRpcCount(result, 'removed_count', 'apply_ai_deck_delta', (currentCards ?? []).length)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }

  // Create a snapshot marking the restore
  await createVersionSnapshot(
    deckId,
    userId,
    'manual',
    `Restored from v${version.version_number}`
  )

  return Response.json({
    success: true,
    restoredFromVersion: version.version_number,
    cardsRestored: snapshot?.length ?? 0,
  })
}
