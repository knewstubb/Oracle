import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { isBasicLand } from '@/lib/basic-lands'
import { computeUnresolvedStatuses } from '@/lib/card-status'

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
  status: 'brewing' | 'in_rotation' | 'graveyard' // Legacy, being phased out
  is_active: boolean
  folder_id: number | null
  folder: DeckFolder | null
}

// Helper to parse primary category from JSON categories string
function parsePrimaryCategory(raw: string | null | undefined): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string')
      return parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
  } catch { /* */ }
  return raw.split(',')[0]?.trim().replace(/\(top\)|\(bottom\)/gi, '') || 'Other'
}

// Check if a card should be counted toward deck size (excludes Maybeboard/Sideboard)
function isCountableCard(categories: string | null | undefined): boolean {
  const primary = parsePrimaryCategory(categories)
  return primary !== 'Maybeboard' && primary !== 'Sideboard'
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
    (supabase as any)
      .from('deck_folders')
      .select('id, name, color')
      .eq('user_id', userId),
    
    // 3. Fetch ALL deck_cards in one query (we need card_name for pip calc anyway)
    // This replaces both the completeness query and pip distribution query
    supabase
      .from('deck_cards')
      .select('deck_id, card_name, copy_id, categories')
      .eq('user_id', userId),
    
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

  const decks = decksResult.data ?? []
  const folders = foldersResult.data ?? []
  const allDeckCards = deckCardsResult.data ?? []
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
  // PROCESS DECK CARDS: Compute completeness, card counts, and collect unresolved
  // ══════════════════════════════════════════════════════════════════════════

  const deckIdSet = new Set(decks.map(d => d.id))
  const completenessMap: Record<number, { 
    resolved: number; 
    total: number; 
    availableCount: number; 
    claimedCount: number; 
    unownedCount: number 
  }> = {}
  const computedCardCounts: Record<number, number> = {}
  const unresolvedByDeck = new Map<number, string[]>()
  const cardNamesPerDeck = new Map<number, string[]>()

  for (const card of allDeckCards) {
    // Only process cards that belong to fetched decks (filter for user's decks)
    if (!deckIdSet.has(card.deck_id)) continue
    
    // Skip Maybeboard/Sideboard from all counts
    if (!isCountableCard(card.categories)) continue

    // Initialize completeness tracking
    if (!completenessMap[card.deck_id]) {
      completenessMap[card.deck_id] = { resolved: 0, total: 0, availableCount: 0, claimedCount: 0, unownedCount: 0 }
    }
    completenessMap[card.deck_id].total += 1
    computedCardCounts[card.deck_id] = (computedCardCounts[card.deck_id] ?? 0) + 1

    // Track card names for pip calculation
    if (!cardNamesPerDeck.has(card.deck_id)) cardNamesPerDeck.set(card.deck_id, [])
    cardNamesPerDeck.get(card.deck_id)!.push(card.card_name)

    if (card.copy_id != null) {
      completenessMap[card.deck_id].resolved += 1
    } else {
      if (!unresolvedByDeck.has(card.deck_id)) unresolvedByDeck.set(card.deck_id, [])
      unresolvedByDeck.get(card.deck_id)!.push(card.card_name)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PARALLEL: Compute unresolved statuses AND fetch mana costs
  // ══════════════════════════════════════════════════════════════════════════

  const allUnresolvedNames = [...new Set(Array.from(unresolvedByDeck.values()).flat())]
  const allCardNames = [...new Set(Array.from(cardNamesPerDeck.values()).flat())]

  const [statusMap, manaCostMap] = await Promise.all([
    // Unresolved status calculation (available/claimed/unowned)
    allUnresolvedNames.length > 0
      ? computeUnresolvedStatuses(allUnresolvedNames, userId)
      : Promise.resolve(new Map<string, 'available' | 'alternate' | 'claimed' | 'unowned'>()),
    
    // Mana costs for pip distribution
    allCardNames.length > 0
      ? fetchManaCosts(supabase, allCardNames)
      : Promise.resolve(new Map<string, string>()),
  ])

  // Distribute unresolved statuses back to completeness
  for (const [deckId, cardNames] of unresolvedByDeck) {
    const comp = completenessMap[deckId]
    if (!comp) continue
    for (const name of cardNames) {
      const status = statusMap.get(name) ?? 'unowned'
      if (status === 'available' || status === 'alternate') {
        comp.availableCount += 1
      } else if (status === 'claimed') {
        comp.claimedCount += 1
      } else {
        comp.unownedCount += 1
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMPUTE PIP DISTRIBUTION (in-memory, fast)
  // ══════════════════════════════════════════════════════════════════════════

  const pipMap: Record<number, Record<string, number>> = {}
  
  for (const [deckId, cardNames] of cardNamesPerDeck) {
    for (const cardName of cardNames) {
      const manaCost = manaCostMap.get(cardName)
      if (!manaCost) continue

      if (!pipMap[deckId]) pipMap[deckId] = {}
      const matches = manaCost.match(/\{([WUBRGC])\}/g) || []
      for (const m of matches) {
        const color = m.replace(/[{}]/g, '')
        if (color === 'C') continue // Skip colorless
        pipMap[deckId][color] = (pipMap[deckId][color] || 0) + 1
      }
    }
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
    pipDistribution: pipMap[deck.id] ?? null,
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

// Helper to fetch mana costs in batches
async function fetchManaCosts(
  supabase: ReturnType<typeof createAdminClient>,
  cardNames: string[]
): Promise<Map<string, string>> {
  const manaCostMap = new Map<string, string>()
  const PAGE_SIZE = 1000

  // Parallel batch fetches for large card lists
  const batches: string[][] = []
  for (let i = 0; i < cardNames.length; i += PAGE_SIZE) {
    batches.push(cardNames.slice(i, i + PAGE_SIZE))
  }

  const results = await Promise.all(
    batches.map(batch =>
      supabase
        .from('ref_cards')
        .select('name, mana_cost')
        .in('name', batch)
        .then(({ data }) => data ?? [])
    )
  )

  for (const rows of results) {
    for (const row of rows) {
      if (row.mana_cost) manaCostMap.set(row.name, row.mana_cost)
    }
  }

  return manaCostMap
}
