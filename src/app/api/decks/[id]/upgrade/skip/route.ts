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

  // Insert into upgrade_change_log with skipped = true
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  await supabase
    .from('upgrade_change_log')
    .insert({
      deck_id: deckId,
      cut_card: cut,
      add_card: add,
      reason: '',
      skipped: true,
      date: today,
      user_id: DEFAULT_USER_ID,
    })

  // Remove candidate from active deck_upgrades content
  const { data: row } = await supabase
    .from('deck_upgrades')
    .select('content')
    .eq('deck_id', deckId)
    .maybeSingle()

  if (row) {
    try {
      const candidates = JSON.parse(row.content) as Array<{
        cut?: { card_name?: string }
        add?: { card_name?: string }
      }>
      const filtered = candidates.filter(
        (c) =>
          !(
            c.cut?.card_name === cut &&
            c.add?.card_name === add
          )
      )
      await supabase
        .from('deck_upgrades')
        .update({ content: JSON.stringify(filtered) })
        .eq('deck_id', deckId)
    } catch {
      // If content is malformed, log and continue — skip still recorded in change log
      console.error(`[upgrade/skip] Failed to parse deck_upgrades content for deck ${deckId}`)
    }
  }

  // Fire-and-forget: Log to local notes (don't block response)
  const formattedEntry = formatChangeLogEntry(cut, add, 'skipped', '', today)
  try {
    await appendNote(deckId, formattedEntry)
  } catch (err) {
    console.error('[Note logging failed]', err)
  }

  return Response.json({ success: true })
}
