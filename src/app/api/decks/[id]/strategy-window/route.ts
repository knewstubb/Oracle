// DV-02: the Strategy window's read and save. Separate from ../strategy (the old Deck Intent form), which writes the
// whole row; this one writes only the fields the window owns, so win condition, budget and the rest stay as they are.
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { validateWindowInput } from '@/lib/deck-strategy-window'
import { loadStrategyWindow, saveStrategyWindow } from '@/lib/deck-strategy-window-server'
async function ownDeck(deckId: number, userId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('decks').select('id').eq('id', deckId).eq('user_id', userId).maybeSingle()
  return { supabase, found: !!data, error }
}
function parseId(raw: string): number | null {
  const n = parseInt(raw, 10)
  return Number.isNaN(n) || n <= 0 ? null : n
}
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const deckId = parseId((await params).id)
  if (deckId === null) return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  const { supabase, found, error } = await ownDeck(deckId, auth.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!found) return Response.json({ error: 'Deck not found' }, { status: 404 })
  const r = await loadStrategyWindow(supabase, auth.id, deckId)
  if (!r.ok) return Response.json({ error: r.error }, { status: 500 })
  return Response.json(r.data)
}
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const deckId = parseId((await params).id)
  if (deckId === null) return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Nothing to save.' }, { status: 400 })
  }
  const v = validateWindowInput(body)
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 })
  const { supabase, found, error } = await ownDeck(deckId, auth.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!found) return Response.json({ error: 'Deck not found' }, { status: 404 })
  const saved = await saveStrategyWindow(supabase, auth.id, deckId, v.values, new Date())
  if (!saved.ok) return Response.json({ error: saved.error, code: saved.code }, { status: saved.code === 'failed' ? 500 : 422 })
  const r = await loadStrategyWindow(supabase, auth.id, deckId)
  if (!r.ok) return Response.json({ error: r.error }, { status: 500 })
  return Response.json({ ...r.data, notSaved: saved.notSaved })
}
