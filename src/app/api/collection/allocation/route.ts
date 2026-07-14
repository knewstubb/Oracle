/**
 * GET /api/collection/allocation
 *
 * Returns cards with their deck assignments and ownership status for the
 * Collection allocation matrix view.
 *
 * Query params:
 *   ?deckFilter=X       — optional deck ID to filter sidebar selection
 *   ?conflictsOnly=true — show only cards where supply < demand
 *   ?search=text        — filter by card name
 *
 * Response: { cards: AllocationRow[], stats: CollectionStats, decks: DeckInfo[] }
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export interface AllocationRow {
  cardName: string
  typeLine: string | null
  isConflict: boolean
  decks: Array<{ deckId: number; deckName: string; status: 'original' | 'proxy' | null }>
  ownedCopies: number
  totalDemand: number
}

export interface CollectionStats {
  totalOwned: number
  inADeck: number
  notInDeck: number
  conflicts: number
  proxiesRunning: number
}

export interface DeckInfo {
  id: number
  name: string
  cardCount: number
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const supabase = createAdminClient()

    const searchParams = request.nextUrl.searchParams
    const deckFilter = searchParams.get('deckFilter')
    const conflictsOnly = searchParams.get('conflictsOnly') === 'true'
    const search = searchParams.get('search')

    // Get all decks with card counts
    const { data: decksData, error: decksErr } = await supabase
      .from('decks')
      .select('id, name, card_count')
      .order('name')

    if (decksErr) throw decksErr

    const decks: DeckInfo[] = (decksData || []).map((d) => ({
      id: d.id,
      name: d.name,
      cardCount: d.card_count ?? 0,
    }))

    // Get all cards in deck_cards with their per-deck ownership status
    const { data: deckCardsData, error: dcErr } = await supabase
      .from('deck_cards')
      .select(`
        card_name,
        deck_id,
        ownership_status,
        decks!deck_cards_deck_id_fkey!inner ( name )
      `)
      .order('card_name')

    if (dcErr) throw dcErr

    // Get owned copies count from physical_copies (non-proxy) grouped by card name
    // via card_definitions join — replaces frozen collection.quantity
    const { data: physicalData, error: physErr } = await supabase
      .from('physical_copies')
      .select('card_definition_id, card_definitions!physical_copies_card_definition_id_fkey ( card_name, type_line )')
      .eq('is_proxy', false)

    if (physErr) throw physErr

    // Build ownership lookup from physical_copies count
    const ownershipMap = new Map<string, { count: number; typeLine: string | null }>()
    for (const pc of physicalData || []) {
      const cdInfo = pc.card_definitions as unknown as { card_name: string; type_line: string | null }
      const cardName = cdInfo?.card_name
      if (!cardName) continue
      const key = cardName.toLowerCase()
      const existing = ownershipMap.get(key)
      if (existing) {
        existing.count += 1
      } else {
        ownershipMap.set(key, {
          count: 1,
          typeLine: cdInfo.type_line ?? null,
        })
      }
    }

    // Group deck_cards by card name
    const cardMap = new Map<
      string,
      {
        typeLine: string | null
        ownedCopies: number
        decks: Array<{ deckId: number; deckName: string; status: 'original' | 'proxy' | null }>
      }
    >()

    const allDeckCards = deckCardsData || []

    for (const row of allDeckCards) {
      const deckInfo = row.decks as unknown as { name: string }
      const deckName = deckInfo?.name || ''
      const ownerEntry = ownershipMap.get(row.card_name.toLowerCase())

      if (!cardMap.has(row.card_name)) {
        cardMap.set(row.card_name, {
          typeLine: ownerEntry?.typeLine ?? null,
          ownedCopies: ownerEntry?.count ?? 0,
          decks: [],
        })
      }
      const card = cardMap.get(row.card_name)!
      const status =
        row.ownership_status === 'original' || row.ownership_status === 'proxy'
          ? row.ownership_status
          : null
      card.decks.push({
        deckId: row.deck_id,
        deckName,
        status,
      })
    }

    // Build allocation rows
    let cards: AllocationRow[] = []

    for (const [cardName, data] of cardMap) {
      const totalDemand = data.decks.length
      const proxies = data.decks.filter((d) => d.status === 'proxy').length
      const originals = data.decks.filter((d) => d.status === 'original').length
      const isConflict = proxies > 0 || originals > 1

      cards.push({
        cardName,
        typeLine: data.typeLine,
        isConflict,
        decks: data.decks,
        ownedCopies: data.ownedCopies,
        totalDemand,
      })
    }

    // Apply filters
    if (search) {
      const q = search.toLowerCase()
      cards = cards.filter((c) => c.cardName.toLowerCase().includes(q))
    }

    if (deckFilter) {
      const deckId = parseInt(deckFilter, 10)
      if (!isNaN(deckId) && deckId > 0) {
        cards = cards.filter((c) => c.decks.some((d) => d.deckId === deckId))
      }
    }

    if (conflictsOnly) {
      cards = cards.filter((c) => c.isConflict)
    }

    // Sort: conflicts first, then alphabetical
    cards.sort((a, b) => {
      if (a.isConflict && !b.isConflict) return -1
      if (!a.isConflict && b.isConflict) return 1
      return a.cardName.localeCompare(b.cardName)
    })

    // Compute stats — totalOwned now derived from physical_copies count
    let totalOwned = 0
    for (const [, entry] of ownershipMap) {
      totalOwned += entry.count
    }
    const inADeckNames = new Set(allDeckCards.map((r) => r.card_name))
    const inADeck = inADeckNames.size
    const notInDeck = Math.max(0, totalOwned - inADeck)

    const allCardEntries = Array.from(cardMap.entries())
    const conflicts = allCardEntries.filter(([, data]) => {
      const proxies = data.decks.filter((d) => d.status === 'proxy').length
      const originals = data.decks.filter((d) => d.status === 'original').length
      return proxies > 0 || originals > 1
    }).length

    const proxiesRunning = allDeckCards.filter(
      (r) => r.ownership_status === 'proxy'
    ).length

    const stats: CollectionStats = {
      totalOwned,
      inADeck,
      notInDeck,
      conflicts,
      proxiesRunning,
    }

    return Response.json({ cards, stats, decks })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[collection/allocation] Unexpected error: ${message}`)
    return Response.json(
      { error: `Unexpected error: ${message}` },
      { status: 500 }
    )
  }
}
