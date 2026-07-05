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
import { createServerClient } from '@/lib/supabase'
import { appendNote } from '@/lib/deck-documentation-store'
import { formatChangeLogEntry } from '@/lib/upgrade-changelog'

const DEFAULT_USER_ID = process.env.SUPABASE_DEFAULT_USER_ID ?? '00000000-0000-0000-0000-000000000000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deckId = parseInt(id, 10)

  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createServerClient()

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

  // DELETE the cut card from deck_cards for this deck
  await supabase
    .from('deck_cards')
    .delete()
    .eq('deck_id', deckId)
    .eq('card_name', cut)

  // INSERT the add card into deck_cards for this deck
  await supabase
    .from('deck_cards')
    .insert({ deck_id: deckId, card_name: add, quantity: 1, user_id: DEFAULT_USER_ID })

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
      user_id: DEFAULT_USER_ID,
    })
    .select('id')
    .single()

  if (logErr) {
    return Response.json({ error: logErr.message }, { status: 500 })
  }

  // Fire-and-forget: Log to local notes (don't block response)
  const formattedEntry = formatChangeLogEntry(cut, add, 'applied', '', today)
  try {
    await appendNote(deckId, formattedEntry)
  } catch (err) {
    console.error('[Note logging failed]', err)
  }

  return Response.json({ success: true, change_log_id: changeLog.id })
}
