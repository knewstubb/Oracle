import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { isBasicLand } from '@/lib/basic-lands'
import { fetchAllDeckCardRows, isCountableCard } from '@/lib/deck-list-data'

export interface DeckFolder {
  id: number
  name: string
  color: string | null
}

export interface DeckRow {
  id: number
  name: string
  commander_name: string | null
  commander_scryfall_id: string | null
  colour_identity: string | null
  card_count: number | null
  last_synced_at: string | null
  deck_type: string | null
  status: 'brewing' | 'in_rotation' // Legacy, being phased out
  is_active: boolean
  folder_id: number | null
  folder: DeckFolder | null
}

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const userId = authResult.id
  const supabase = createAdminClient()

  // ══════════════════════════════════════════════════════════════════════════
  // PARALLEL FETCH: Get decks, folders, deck_cards, brew sessions, collection count
  // This reduces ~7 sequential DB calls to 1 parallel batch
  // ══════════════════════════════════════════════════════════════════════════
  
  const [
    decksResult,
    foldersResult,
    deckCardsResult,
    brewSessionsResult,
    collectionCountResult,
    conflictCountsResult,
  ] = await Promise.all([
    // 1. Fetch decks
    supabase
      .from('decks')
      .select('id, name, commander_name, commander_scryfall_id, colour_identity, card_count, last_synced_at, deck_type, status, is_active, folder_id')
      .eq('user_id', userId)
      .order('is_active', { ascending: false })
      .order('name'),
    
    // 2. Fetch folders
    supabase
      .from('deck_folders')
      .select('id, name, color')
      .eq('user_id', userId),
    
    // 3. Fetch ALL deck_cards (reads past the database's 1,000-row cap)
    fetchAllDeckCardRows(supabase, userId),
    // 4. Fetch active brew sessions
    supabase
      .from('brew_sessions')
      .select('deck_id')
      .eq('user_id', userId)
      .in('status', ['exploring', 'building', 'investigating', 'confirming', 'generating', 'refining'])
      .not('deck_id', 'is', null),
    
    // 5. Check if user has any collection
    supabase
      .from('user_copies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),

    // 6. Per-deck unresolved import conflicts (claims the user chose to leave
    // unresolved on Go to Decks). Feeds the amber deck-tile badge. If the RPC
    // has not been applied to the database yet, data is null → count 0.
    supabase.rpc('get_deck_conflict_counts', { p_user_id: userId }),
  ])

  if (decksResult.error) {
    return Response.json({ error: decksResult.error.message }, { status: 500 })
  }
  if (deckCardsResult.error) {
    return Response.json({ error: deckCardsResult.error }, { status: 500 })
  }

  const decks = decksResult.data ?? []
  const folders = foldersResult.data ?? []
  const allDeckCards = deckCardsResult.rows
  const activeSessions = brewSessionsResult.data ?? []
  const hasCollection = (collectionCountResult.count ?? 0) > 0

  // Build folder map
  const folderMap = new Map<number, DeckFolder>()
  for (const f of folders) {
    folderMap.set(f.id, { id: f.id, name: f.name, color: f.color })
  }

  // Build brewing deck IDs set
  const brewingDeckIds = new Set(
    activeSessions.map((s: { deck_id: number | null }) => s.deck_id).filter((id): id is number => id !== null)
  )

  // ══════════════════════════════════════════════════════════════════════════
  // PROCESS DECK CARDS: Compute completeness and card counts
  // ══════════════════════════════════════════════════════════════════════════

  const deckIdSet = new Set(decks.map(d => d.id))
  // How many unresolved cards are available / claimed / unowned comes from
  // /api/decks/details, which fills it in after the tiles are on screen.
  const completenessMap: Record<number, { resolved: number; total: number }> = {}
  const computedCardCounts: Record<number, number> = {}

  for (const card of allDeckCards) {
    // Only process cards that belong to fetched decks (filter for user's decks)
    if (!deckIdSet.has(card.deck_id)) continue
    
    // Skip Maybeboard/Sideboard from all counts
    if (!isCountableCard(card.categories)) continue

    // Initialize completeness tracking
    if (!completenessMap[card.deck_id]) {
      completenessMap[card.deck_id] = { resolved: 0, total: 0 }
    }
    completenessMap[card.deck_id].total += 1
    computedCardCounts[card.deck_id] = (computedCardCounts[card.deck_id] ?? 0) + 1

    if (card.copy_id != null) completenessMap[card.deck_id].resolved += 1
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BUILD RESPONSE
  // ══════════════════════════════════════════════════════════════════════════

  // Per-deck unresolved import conflicts (RPC payload {success, decks:[{deckId,count,cards}]}).
  const conflictCountsMap = new Map<number, number>()
  for (const entry of
    ((conflictCountsResult.data as { decks?: { deckId: number; count: number }[] } | null)?.decks ?? [])
  ) {
    conflictCountsMap.set(entry.deckId, entry.count)
  }

  const decksWithCompleteness = decks.map((deck) => ({
    ...deck,
    card_count: computedCardCounts[deck.id] ?? deck.card_count ?? 0,
    completeness: completenessMap[deck.id] ?? null,
    folder: deck.folder_id ? folderMap.get(deck.folder_id) ?? null : null,
    hasBrew: brewingDeckIds.has(deck.id),
    conflictCount: conflictCountsMap.get(deck.id) ?? 0,
  }))

  return Response.json({ 
    decks: decksWithCompleteness, 
    folders: folders ?? [],
    hasCollection 
  })
}
