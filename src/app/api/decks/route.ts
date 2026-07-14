import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export interface DeckRow {
  id: number
  name: string
  commander_name: string | null
  commander_scryfall_id: string | null
  colour_identity: string | null
  card_count: number | null
  last_synced_at: string | null
  deck_type: string | null
  status: 'brew' | 'boxed' | 'archived'
  allocate: boolean
}

export interface DraftSession {
  session_id: number
  commander_name: string | null
  status: string
  updated_at: string
  colour_identity: string | null
}

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const supabase = createAdminClient()

  const { data: decks, error: decksErr } = await supabase
    .from('decks')
    .select('id, name, commander_name, commander_scryfall_id, colour_identity, card_count, last_synced_at, deck_type, status, allocate')
    .order('name')

  if (decksErr) {
    return Response.json({ error: decksErr.message }, { status: 500 })
  }

  // Compute completeness for Boxed decks — count deck_cards with non-null physical_copy_id
  const boxedDeckIds = (decks ?? [])
    .filter((d) => d.status === 'boxed')
    .map((d) => d.id)

  let completenessMap: Record<number, { resolved: number; total: number }> = {}

  if (boxedDeckIds.length > 0) {
    // Fetch deck_cards for boxed decks, counting resolved (physical_copy_id IS NOT NULL) vs total
    const { data: deckCards, error: cardsErr } = await supabase
      .from('deck_cards')
      .select('deck_id, physical_copy_id')
      .in('deck_id', boxedDeckIds)

    if (!cardsErr && deckCards) {
      for (const card of deckCards) {
        if (!completenessMap[card.deck_id]) {
          completenessMap[card.deck_id] = { resolved: 0, total: 0 }
        }
        completenessMap[card.deck_id].total += 1
        if (card.physical_copy_id != null) {
          completenessMap[card.deck_id].resolved += 1
        }
      }
    }
  }

  // Merge completeness into deck response
  const decksWithCompleteness = (decks ?? []).map((deck) => ({
    ...deck,
    completeness: completenessMap[deck.id] ?? null,
  }))

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

  return Response.json({ decks: decksWithCompleteness, draftSessions })
}
