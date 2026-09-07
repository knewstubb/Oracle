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

  const { data: decks, error: decksErr } = await supabase
    .from('decks')
    .select('id, name, commander_name, commander_scryfall_id, colour_identity, card_count, last_synced_at, deck_type, status, is_active, folder_id')
    .eq('user_id', userId)
    .order('is_active', { ascending: false }) // Active decks first
    .order('name')

  if (decksErr) {
    return Response.json({ error: decksErr.message }, { status: 500 })
  }

  // Fetch folders for this user to join with decks
  const { data: folders } = await (supabase as any)
    .from('deck_folders')
    .select('id, name, color')
    .eq('user_id', userId)

  const folderMap = new Map<number, DeckFolder>()
  for (const f of folders ?? []) {
    folderMap.set(f.id, { id: f.id, name: f.name, color: f.color })
  }

  // Compute completeness for all decks — count deck_cards with non-null copy_id
  // (Previously only computed for in_rotation decks, but now all decks claim cards equally)
  const allDeckIds = (decks ?? []).map((d) => d.id)

  let completenessMap: Record<number, { resolved: number; total: number; availableCount: number; claimedCount: number; unownedCount: number }> = {}
  let pipMap: Record<number, Record<string, number>> = {}
  // Track computed card counts per deck (excluding Maybeboard/Sideboard)
  let computedCardCounts: Record<number, number> = {}

  if (allDeckIds.length > 0) {
    // Fetch deck_cards for all decks, counting resolved (copy_id IS NOT NULL) vs total
    // Include categories to filter out Maybeboard/Sideboard from counts
    const { data: deckCards, error: cardsErr } = await supabase
      .from('deck_cards')
      .select('deck_id, card_name, copy_id, categories')
      .in('deck_id', allDeckIds)

    // Collect unresolved card names per deck for status breakdown
    const unresolvedByDeck = new Map<number, string[]>()

    if (!cardsErr && deckCards) {
      for (const card of deckCards) {
        // Skip Maybeboard/Sideboard from all counts
        if (!isCountableCard(card.categories)) continue

        if (!completenessMap[card.deck_id]) {
          completenessMap[card.deck_id] = { resolved: 0, total: 0, availableCount: 0, claimedCount: 0, unownedCount: 0 }
        }
        completenessMap[card.deck_id].total += 1
        
        // Track computed card count
        computedCardCounts[card.deck_id] = (computedCardCounts[card.deck_id] ?? 0) + 1

        if (card.copy_id != null) {
          completenessMap[card.deck_id].resolved += 1
        } else {
          // Track unresolved card names for status breakdown
          if (!unresolvedByDeck.has(card.deck_id)) unresolvedByDeck.set(card.deck_id, [])
          unresolvedByDeck.get(card.deck_id)!.push(card.card_name)
        }
      }
    }

    // Compute unresolved status breakdown (available/claimed/unowned) for all decks
    // Collect ALL unresolved card names across all decks in one batch
    const allUnresolvedNames = [...new Set(Array.from(unresolvedByDeck.values()).flat())]
    if (allUnresolvedNames.length > 0) {
      const statusMap = await computeUnresolvedStatuses(allUnresolvedNames, userId)

      // Distribute results back to each deck's completeness
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
    }
  }

  // Compute pip distribution for all decks (for proportional color bar)
  if (allDeckIds.length > 0) {
    // Get card names per deck, then look up mana costs from card_metadata
    // Include categories to filter out Maybeboard/Sideboard
    const PAGE_SIZE = 1000
    const allDeckCards: Array<{ deck_id: number; card_name: string; categories: string | null }> = []
    let offset = 0

    while (true) {
      const { data, error } = await supabase
        .from('deck_cards')
        .select('deck_id, card_name, categories')
        .in('deck_id', allDeckIds)
        .range(offset, offset + PAGE_SIZE - 1)

      if (error || !data || data.length === 0) break
      allDeckCards.push(...data)
      if (data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    // Filter to only countable cards (exclude Maybeboard/Sideboard)
    const countableDeckCards = allDeckCards.filter(c => isCountableCard(c.categories))

    // Get unique card names and fetch mana costs
    const uniqueNames = [...new Set(countableDeckCards.map(c => c.card_name))]
    const manaCostMap = new Map<string, string>()

    for (let i = 0; i < uniqueNames.length; i += PAGE_SIZE) {
      const batch = uniqueNames.slice(i, i + PAGE_SIZE)
      const { data: metaRows } = await supabase
        .from('ref_cards')
        .select('name, mana_cost')
        .in('name', batch)

      for (const row of metaRows ?? []) {
        if (row.mana_cost) manaCostMap.set(row.name, row.mana_cost)
      }
    }

    // Count pips per deck
    for (const dc of countableDeckCards) {
      const manaCost = manaCostMap.get(dc.card_name)
      if (!manaCost) continue

      if (!pipMap[dc.deck_id]) pipMap[dc.deck_id] = {}
      const matches = manaCost.match(/\{([WUBRGC])\}/g) || []
      for (const m of matches) {
        const color = m.replace(/[{}]/g, '')
        if (color === 'C') continue // Skip colorless
        pipMap[dc.deck_id][color] = (pipMap[dc.deck_id][color] || 0) + 1
      }
    }
  }

  // Merge completeness, pip distribution, and folder into deck response
  // Override card_count with computed value (excludes Maybeboard/Sideboard)
  const decksWithCompleteness = (decks ?? []).map((deck) => ({
    ...deck,
    card_count: computedCardCounts[deck.id] ?? deck.card_count ?? 0,
    completeness: completenessMap[deck.id] ?? null,
    pipDistribution: pipMap[deck.id] ?? null,
    folder: deck.folder_id ? folderMap.get(deck.folder_id) ?? null : null,
  }))

  // Find decks with active brew sessions (not complete/abandoned)
  const { data: activeSessions } = await supabase
    .from('brew_sessions')
    .select('deck_id')
    .eq('user_id', userId)
    .in('status', ['exploring', 'building', 'investigating', 'confirming', 'generating', 'refining'])
    .not('deck_id', 'is', null)

  const brewingDeckIds = new Set((activeSessions ?? []).map(s => s.deck_id).filter((id): id is number => id !== null))

  // Add hasBrew flag to decks
  const decksWithBrewStatus = decksWithCompleteness.map((deck) => ({
    ...deck,
    hasBrew: brewingDeckIds.has(deck.id),
  }))

  // Check if user has any collection (used for empty state messaging)
  const { count: collectionCount } = await supabase
    .from('user_copies')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  const hasCollection = (collectionCount ?? 0) > 0

  return Response.json({ 
    decks: decksWithBrewStatus, 
    folders: folders ?? [],
    hasCollection 
  })
}
