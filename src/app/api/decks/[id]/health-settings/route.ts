// Deck settings > Deck health: read and change the deck's health targets (mode, per-deck ranges, custom categories).
// Before the owner applies the stored-data change, GET answers { available: false, mode: 'default' } and writes answer 503.
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { loadHealthSettings, parseAction, saveHealthSettings } from '@/lib/deck-health-settings-server'

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10)
  return Number.isNaN(n) || n <= 0 ? null : n
}

async function ownDeck(deckId: number, userId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('decks').select('id').eq('id', deckId).eq('user_id', userId).maybeSingle()
  return { supabase, found: !!data, error }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const deckId = parseId((await params).id)
  if (deckId === null) return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  const { supabase, found, error } = await ownDeck(deckId, auth.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!found) return Response.json({ error: 'Deck not found' }, { status: 404 })
  const r = await loadHealthSettings(supabase, auth.id, deckId)
  if (!r.ok) return Response.json({ error: r.error }, { status: 500 })
  return Response.json(r.settings)
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
  const parsed = parseAction(body)
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
  const { supabase, found, error } = await ownDeck(deckId, auth.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!found) return Response.json({ error: 'Deck not found' }, { status: 404 })
  const saved = await saveHealthSettings(supabase, auth.id, deckId, parsed.value, new Date())
  if (!saved.ok) return Response.json(saved.available === false ? { available: false, mode: 'default', error: saved.error } : { error: saved.error }, { status: saved.status })
  return Response.json(saved.settings)
}
