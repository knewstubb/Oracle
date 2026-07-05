import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

interface RawCandidate {
  priority: number
  impact: number
  source?: 'debrief' | 'analysis'
  cut: { card_name: string; reason: string }
  add: { card_name: string; reason: string; edhrec_percent?: number; price?: number }
  conflict?: { deck_name: string }
}

interface ChangeLogEntry {
  id: number
  date: string
  cut_card: string
  add_card: string
  reason: string
  skipped: boolean
}

interface UpgradeCandidate {
  priority: number
  impact: number
  source: 'debrief' | 'analysis'
  cut: {
    card_name: string
    reason: string
    ownership_status: string
    holder_deck_name?: string
  }
  add: {
    card_name: string
    reason: string
    ownership_status: string
    holder_deck_name?: string
    edhrec_percent?: number
    price?: number
  }
  conflict?: { deck_name: string }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createServerClient()

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

  // Fetch upgrade candidates from deck_upgrades
  const { data: row } = await supabase
    .from('deck_upgrades')
    .select('content')
    .eq('deck_id', deckId)
    .maybeSingle()

  let candidates: UpgradeCandidate[] = []

  if (row) {
    const rawCandidates: RawCandidate[] = JSON.parse(row.content)

    // Ensure it's an array (content could be wrapped in an object)
    const candidateArray = Array.isArray(rawCandidates) ? rawCandidates : []

    candidates = await Promise.all(
      candidateArray.map(async (raw) => {
        const source: 'debrief' | 'analysis' = raw.source === 'debrief' ? 'debrief' : 'analysis'

        // Enrich cut card with ownership status
        const cutOwnership = await resolveOwnershipStatus(supabase, raw.cut.card_name, deckId)

        // Enrich add card with ownership status
        const addOwnership = await resolveOwnershipStatus(supabase, raw.add.card_name, deckId)

        // Detect proxy conflict for the add card
        const conflict = raw.conflict || await detectProxyConflict(supabase, raw.add.card_name, deckId)

        return {
          priority: raw.priority,
          impact: raw.impact,
          source,
          cut: {
            card_name: raw.cut.card_name,
            reason: raw.cut.reason,
            ownership_status: cutOwnership.ownership_status,
            ...(cutOwnership.holder_deck_name && { holder_deck_name: cutOwnership.holder_deck_name }),
          },
          add: {
            card_name: raw.add.card_name,
            reason: raw.add.reason,
            ownership_status: addOwnership.ownership_status,
            ...(addOwnership.holder_deck_name && { holder_deck_name: addOwnership.holder_deck_name }),
            ...(raw.add.edhrec_percent !== undefined && { edhrec_percent: raw.add.edhrec_percent }),
            ...(raw.add.price !== undefined && { price: raw.add.price }),
          },
          ...(conflict && { conflict }),
        }
      })
    )
  }

  // Fetch change log entries ordered by date DESC
  const { data: changeLogRows } = await supabase
    .from('upgrade_change_log')
    .select('id, date, cut_card, add_card, reason, skipped')
    .eq('deck_id', deckId)
    .order('date', { ascending: false })
    .order('id', { ascending: false })

  const change_log: ChangeLogEntry[] = (changeLogRows ?? []).map((entry) => ({
    id: entry.id,
    date: entry.date,
    cut_card: entry.cut_card,
    add_card: entry.add_card,
    reason: entry.reason,
    skipped: Boolean(entry.skipped),
  }))

  return Response.json({ candidates, change_log })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SupabaseClient = ReturnType<typeof createServerClient>

/**
 * Determine ownership status for a card relative to a given deck.
 */
async function resolveOwnershipStatus(
  supabase: SupabaseClient,
  cardName: string,
  currentDeckId: number
): Promise<{ ownership_status: string; holder_deck_name?: string }> {
  // Check if card is in collection
  const { data: collectionRows } = await supabase
    .from('collection')
    .select('quantity')
    .eq('card_name', cardName)

  const totalQty = (collectionRows ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0)

  if (totalQty <= 0) {
    return { ownership_status: 'not_owned' }
  }

  // Card is owned — check if it's allocated as original in another deck
  const { data: allocationRow } = await supabase
    .from('deck_allocations')
    .select('deck_id, decks(name)')
    .eq('card_name', cardName)
    .eq('role', 'original')
    .neq('deck_id', currentDeckId)
    .limit(1)
    .maybeSingle()

  if (allocationRow) {
    const deckName = (allocationRow as any).decks?.name
    return {
      ownership_status: 'proxy',
      holder_deck_name: deckName ?? undefined,
    }
  }

  return { ownership_status: 'original' }
}

/**
 * Detect if adding a card to a deck would create a proxy conflict.
 */
async function detectProxyConflict(
  supabase: SupabaseClient,
  cardName: string,
  currentDeckId: number
): Promise<{ deck_name: string } | undefined> {
  // Check if the card is allocated as original in another deck
  const { data: conflictRow } = await supabase
    .from('deck_allocations')
    .select('deck_id, decks(name)')
    .eq('card_name', cardName)
    .eq('role', 'original')
    .neq('deck_id', currentDeckId)
    .limit(1)
    .maybeSingle()

  if (!conflictRow) return undefined

  // Check collection quantity
  const { data: collectionRows } = await supabase
    .from('collection')
    .select('quantity')
    .eq('card_name', cardName)

  const totalQty = (collectionRows ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0)

  // Count how many decks currently have this card
  const { count: deckCount } = await supabase
    .from('deck_cards')
    .select('deck_id', { count: 'exact', head: true })
    .eq('card_name', cardName)

  // If owned copies <= total deck demand, there's a conflict
  if (totalQty <= (deckCount ?? 0)) {
    const deckName = (conflictRow as any).decks?.name
    return { deck_name: deckName ?? 'Unknown' }
  }

  return undefined
}
