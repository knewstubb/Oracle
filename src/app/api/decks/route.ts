import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { isBasicLand } from '@/lib/basic-lands'
import { computeUnresolvedStatuses } from '@/lib/card-status'

export interface DeckRow {
  id: number
  name: string
  commander_name: string | null
  commander_scryfall_id: string | null
  colour_identity: string | null
  card_count: number | null
  last_synced_at: string | null
  deck_type: string | null
  status: 'brewing' | 'in_rotation' | 'graveyard'
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

  const userId = authResult.id

  const supabase = createAdminClient()

  const { data: decks, error: decksErr } = await supabase
    .from('decks')
    .select('id, name, commander_name, commander_scryfall_id, colour_identity, card_count, last_synced_at, deck_type, status, allocate')
    .eq('user_id', userId)
    .order('name')

  if (decksErr) {
    return Response.json({ error: decksErr.message }, { status: 500 })
  }

  // Compute completeness for Boxed decks — count deck_cards with non-null physical_copy_id
  const boxedDeckIds = (decks ?? [])
    .filter((d) => d.status === 'in_rotation')
    .map((d) => d.id)

  let completenessMap: Record<number, { resolved: number; total: number; availableCount: number; claimedCount: number; unownedCount: number }> = {}
  let pipMap: Record<number, Record<string, number>> = {}

  if (boxedDeckIds.length > 0) {
    // Fetch deck_cards for boxed decks, counting resolved (physical_copy_id IS NOT NULL) vs total
    // Basic lands are exempt from allocation — don't count them
    const { data: deckCards, error: cardsErr } = await supabase
      .from('deck_cards')
      .select('deck_id, card_name, physical_copy_id')
      .in('deck_id', boxedDeckIds)

    // Collect unresolved card names per deck for status breakdown
    const unresolvedByDeck = new Map<number, string[]>()

    if (!cardsErr && deckCards) {
      for (const card of deckCards) {
        // Skip basic lands — they never get physical_copy_id assigned
        if (isBasicLand(card.card_name)) continue

        if (!completenessMap[card.deck_id]) {
          completenessMap[card.deck_id] = { resolved: 0, total: 0, availableCount: 0, claimedCount: 0, unownedCount: 0 }
        }
        completenessMap[card.deck_id].total += 1
        if (card.physical_copy_id != null) {
          completenessMap[card.deck_id].resolved += 1
        } else {
          // Track unresolved card names for status breakdown
          if (!unresolvedByDeck.has(card.deck_id)) unresolvedByDeck.set(card.deck_id, [])
          unresolvedByDeck.get(card.deck_id)!.push(card.card_name)
        }
      }
    }

    // Compute unresolved status breakdown (available/claimed/unowned) for Active decks
    // Collect ALL unresolved card names across all Active decks in one batch
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
  const allDeckIds = (decks ?? []).map((d) => d.id)
  if (allDeckIds.length > 0) {
    // Get card names per deck, then look up mana costs from card_metadata
    const PAGE_SIZE = 1000
    const allDeckCards: Array<{ deck_id: number; card_name: string }> = []
    let offset = 0

    while (true) {
      const { data, error } = await supabase
        .from('deck_cards')
        .select('deck_id, card_name')
        .in('deck_id', allDeckIds)
        .range(offset, offset + PAGE_SIZE - 1)

      if (error || !data || data.length === 0) break
      allDeckCards.push(...data)
      if (data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    // Get unique card names and fetch mana costs
    const uniqueNames = [...new Set(allDeckCards.map(c => c.card_name))]
    const manaCostMap = new Map<string, string>()

    for (let i = 0; i < uniqueNames.length; i += PAGE_SIZE) {
      const batch = uniqueNames.slice(i, i + PAGE_SIZE)
      const { data: metaRows } = await supabase
        .from('card_metadata')
        .select('card_name, mana_cost')
        .in('card_name', batch)

      for (const row of metaRows ?? []) {
        if (row.mana_cost) manaCostMap.set(row.card_name, row.mana_cost)
      }
    }

    // Count pips per deck
    for (const dc of allDeckCards) {
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

  // Merge completeness and pip distribution into deck response
  const decksWithCompleteness = (decks ?? []).map((deck) => ({
    ...deck,
    completeness: completenessMap[deck.id] ?? null,
    pipDistribution: pipMap[deck.id] ?? null,
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
