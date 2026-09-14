// ---------------------------------------------------------------------------
// POST /api/decks/[id]/upgrade/apply
// Apply a single card swap (cut one, add one) to a deck.
//
// GUARD: This route modifies deck_cards for LOCAL upgrades only.
// It does NOT fetch from Archidekt or trigger any auto-sync.
// The write is user-initiated (explicit cut/add via UI).
// See: deck-authority-split spec, Requirements 6.1, 6.2.
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { assertAtomicRpcCount, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'
import { formatChangeLogEntry } from '@/lib/upgrade-changelog'

async function appendNote(deckId: number, content: string, userId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('deck_notes')
    .insert({ deck_id: deckId, content, user_id: userId })
}

export async function POST(
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

  const supabase = createAdminClient()

  // Validate deck exists
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

  // Parse and validate request body
  let body: { cut?: string; add?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { cut, add } = body
  if (!cut || typeof cut !== 'string' || !add || typeof add !== 'string') {
    return Response.json(
      { error: 'Request body must include "cut" and "add" as non-empty strings' },
      { status: 400 }
    )
  }

  // Replace the cut/add composition through the atomic delta RPC. If any cut
  // slot is sleeved, its copy returns to storage in the same transaction.
  const { data: cutRows, error: cutErr } = await supabase
    .from('deck_cards')
    .select('id')
    .eq('deck_id', deckId)
    .eq('user_id', userId)
    .eq('card_name', cut)

  if (cutErr) {
    return Response.json({ error: cutErr.message }, { status: 500 })
  }

  const { data: deltaResult, error: deltaErr } = await (supabase.rpc as any)('apply_ai_deck_delta', {
    p_deck_id: deckId,
    p_user_id: userId,
    p_additions: [{
      card_name: add,
      scryfall_id: null,
      set_code: null,
      categories: null,
      quantity: 1,
      is_commander: false,
    }],
    p_remove_deck_card_ids: (cutRows ?? []).map((row) => row.id),
  })

  if (deltaErr) {
    return Response.json({ error: `Failed to apply upgrade: ${deltaErr.message}` }, { status: 500 })
  }

  try {
    const result = assertAtomicRpcSuccess(deltaResult, 'apply_ai_deck_delta')
    assertAtomicRpcCount(result, 'added_count', 'apply_ai_deck_delta', 1)
    assertAtomicRpcCount(result, 'removed_count', 'apply_ai_deck_delta', (cutRows ?? []).length)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }

  // INSERT into upgrade_change_log with skipped = false
  const today = new Date().toISOString().split('T')[0]
  const { data: changeLog, error: logErr } = await supabase
    .from('upgrade_change_log')
    .insert({
      deck_id: deckId,
      cut_card: cut,
      add_card: add,
      reason: '',
      skipped: false,
      date: today,
      user_id: userId,
    })
    .select('id')
    .single()

  if (logErr) {
    return Response.json({ error: logErr.message }, { status: 500 })
  }

  // Fire-and-forget: Log to local notes (don't block response)
  const formattedEntry = formatChangeLogEntry(cut, add, 'applied', '', today)
  try {
    await appendNote(deckId, formattedEntry, userId)
  } catch (err) {
    console.error('[Note logging failed]', err)
  }

  return Response.json({ success: true, change_log_id: changeLog.id })
}
