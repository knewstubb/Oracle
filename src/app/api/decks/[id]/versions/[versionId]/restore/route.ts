/**
 * POST /api/decks/[id]/versions/[versionId]/restore
 *
 * Restore a deck to a previous version by replacing deck_cards with the snapshot.
 * Creates a "manual" snapshot of the current state before restoring.
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
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

  // Delete all existing deck_cards
  const { error: deleteErr } = await supabase
    .from('deck_cards')
    .delete()
    .eq('deck_id', deckId)

  if (deleteErr) {
    return Response.json(
      { error: `Failed to clear deck: ${deleteErr.message}` },
      { status: 500 }
    )
  }

  // Restore cards from snapshot
  const snapshot = version.cards_snapshot as CardSnapshot[]

  if (snapshot && snapshot.length > 0) {
    const rows = snapshot.map((card) => ({
      deck_id: deckId,
      card_name: card.card_name,
      scryfall_id: card.scryfall_id,
      set_code: card.set_code,
      quantity: card.quantity,
      categories: card.categories,
      is_commander: card.is_commander,
      user_id: userId,
      // Note: allocation state (copy_id, ownership_status) is NOT restored
      // User will need to re-allocate after restore
    }))

    const { error: insertErr } = await supabase.from('deck_cards').insert(rows)

    if (insertErr) {
      return Response.json(
        { error: `Failed to restore cards: ${insertErr.message}` },
        { status: 500 }
      )
    }
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
