/**
 * Allocation Rollup — live data-access for the Allocation Tab.
 *
 * Reads supply + assignment state through the read-only allocation suggestion
 * engine compute layer (`fetchBatchEnrichedSupply`) instead of the frozen
 * `collection_rollup` database view. Active-deck demand is read directly from
 * `deck_cards` / `decks` (both allowed SELECTs per the suggestion-engine
 * contract §7.2).
 *
 * Contract: docs/oracle/contracts/allocation-suggestion-engine.md
 */
import { createAdminClient } from '@/lib/supabase'
import {
  fetchBatchEnrichedSupply,
  type EnrichedSupplyEntry,
} from '@/lib/allocation-candidates'

const PAGE_SIZE = 1000

export interface AllocationRollupRow {
  oracleId: string
  cardName: string
  ownedCount: number
  proxyCount: number
  allocatedCount: number
  shortfall: number
  typeLine: string
}

export interface UserCardMeta {
  cardName: string
  oracleId: string
  typeLine: string
}

/**
 * Pure aggregation: turn enriched supply (grouped by card name) plus active
 * deck demand into Allocation Tab rows. Only card names with at least one
 * physical copy appear, matching the previous `collection_rollup` view, which
 * was driven by a JOIN on physical copies.
 */
export function buildRollupRows(
  cards: readonly UserCardMeta[],
  supplyByName: Map<string, EnrichedSupplyEntry[]>,
  demandByName: Map<string, number>
): AllocationRollupRow[] {
  const rows: AllocationRollupRow[] = []
  const seen = new Set<string>()

  for (const card of cards) {
    if (seen.has(card.cardName)) continue
    const entries = supplyByName.get(card.cardName) ?? []
    if (entries.length === 0) continue
    seen.add(card.cardName)

    let ownedCount = 0
    let proxyCount = 0
    let allocatedCount = 0
    for (const entry of entries) {
      if (entry.isProxy) proxyCount += 1
      else ownedCount += 1
      if (entry.assignedTo) allocatedCount += 1
    }

    const demand = demandByName.get(card.cardName) ?? 0

    rows.push({
      oracleId: card.oracleId,
      cardName: card.cardName,
      ownedCount,
      proxyCount,
      allocatedCount,
      shortfall: Math.max(0, demand - ownedCount),
      typeLine: card.typeLine,
    })
  }

  return rows
}

async function fetchUserCards(userId: string): Promise<UserCardMeta[]> {
  const supabase = createAdminClient()
  const cards: UserCardMeta[] = []
  let offset = 0

  for (;;) {
    const { data, error } = await supabase
      .from('user_cards')
      .select('card_name, oracle_id, type_line')
      .eq('user_id', userId)
      .order('card_name', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Failed to fetch user_cards: ${error.message}`)

    const page = data ?? []
    for (const row of page) {
      cards.push({
        cardName: row.card_name,
        oracleId: row.oracle_id,
        typeLine: row.type_line ?? '',
      })
    }

    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return cards
}

async function fetchActiveDemand(userId: string): Promise<Map<string, number>> {
  const supabase = createAdminClient()
  const demand = new Map<string, number>()

  const { data: activeDecks, error: deckErr } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (deckErr) throw new Error(`Failed to fetch active decks: ${deckErr.message}`)

  const activeDeckIds = (activeDecks ?? []).map((deck) => deck.id)
  if (activeDeckIds.length === 0) return demand

  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from('deck_cards')
      .select('card_name')
      .eq('user_id', userId)
      .in('deck_id', activeDeckIds)
      .order('card_name', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Failed to fetch deck demand: ${error.message}`)

    const page = data ?? []
    for (const row of page) {
      demand.set(row.card_name, (demand.get(row.card_name) ?? 0) + 1)
    }

    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return demand
}

/**
 * Build the Allocation Tab rollup from live data, using the suggestion engine's
 * enriched supply compute rather than the `collection_rollup` view.
 */
export async function fetchAllocationRollup(userId: string): Promise<AllocationRollupRow[]> {
  const cards = await fetchUserCards(userId)
  const cardNames = Array.from(new Set(cards.map((card) => card.cardName)))
  const supplyByName = await fetchBatchEnrichedSupply(cardNames, userId)
  const demandByName = await fetchActiveDemand(userId)

  return buildRollupRows(cards, supplyByName, demandByName)
}
