import { createServerClient } from '@/lib/supabase'

export interface DeckRow {
  id: number
  name: string
  commander_name: string | null
  commander_scryfall_id: string | null
  colour_identity: string | null
  card_count: number | null
  last_synced_at: string | null
  deck_type: string | null
  status: 'active' | 'draft'
}

export interface DraftSession {
  session_id: number
  commander_name: string | null
  status: string
  updated_at: string
  colour_identity: string | null
}

export async function GET() {
  const supabase = createServerClient()

  const { data: decks, error: decksErr } = await supabase
    .from('decks')
    .select('id, name, commander_name, commander_scryfall_id, colour_identity, card_count, last_synced_at, deck_type, status')
    .order('name')

  if (decksErr) {
    return Response.json({ error: decksErr.message }, { status: 500 })
  }

  const { data: draftSessionsRaw, error: sessionsErr } = await supabase
    .from('brew_sessions')
    .select('id, commander_name, status, updated_at, colour_identity, conversation_json')
    .in('status', ['investigating', 'confirming', 'generating', 'refining', 'exploring', 'building'])
    .order('updated_at', { ascending: false })

  if (sessionsErr) {
    return Response.json({ error: sessionsErr.message }, { status: 500 })
  }

  // Filter out empty sessions (no conversation and no commander — just freshly created)
  const draftSessions: DraftSession[] = (draftSessionsRaw ?? [])
    .filter((bs) => {
      // Show if it has a commander (building phase)
      if (bs.commander_name) return true
      // Show if it has any conversation content
      if (bs.conversation_json && bs.conversation_json !== '[]' && bs.conversation_json !== 'null') return true
      // Hide empty sessions with no activity
      return false
    })
    .map((bs) => ({
      session_id: bs.id,
      commander_name: bs.commander_name,
      status: bs.status,
      updated_at: bs.updated_at,
      colour_identity: bs.colour_identity,
    }))

  return Response.json({ decks: decks ?? [], draftSessions })
}
