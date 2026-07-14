/**
 * Allocation Resolver V2 — Instance-Level Card Tracking
 *
 * Computes assignments of individual physical card copies to deck slots.
 * Unlike V1 which worked at quantity/card_name level, V2 operates on:
 *   - oracle_id (fungibility boundary — same oracle_id means interchangeable)
 *   - physical_copy_id (individual card instances)
 *   - deck_cards row IDs (individual demand slots)
 *
 * This module handles:
 *   - Demand/supply map building (task 9.1)
 *   - Pure allocation assignment algorithm (task 9.3)
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Pagination Helper
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000

/**
 * Fetch all rows from a Supabase query using pagination.
 * Supabase's PostgREST has a max_rows limit (typically 1000).
 * This function fetches pages until all rows are retrieved.
 */
async function fetchAllRows<T>(
  queryFn: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>
): Promise<{ data: T[]; error: any }> {
  const allRows: T[] = []
  let offset = 0

  while (true) {
    const { data, error } = await queryFn(offset, offset + PAGE_SIZE - 1)
    if (error) return { data: allRows, error }
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < PAGE_SIZE) break // Last page
    offset += PAGE_SIZE
  }

  return { data: allRows, error: null }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AllocationInputV2 {
  /** deck_cards demand grouped by oracle_id → list of demand entries */
  demandMap: Map<string, DemandEntry[]>
  /** physical_copies supply grouped by oracle_id → list of supply entries */
  supplyMap: Map<string, SupplyEntry[]>
  /** Deck priority (deck_id → priority number, lower = higher priority) */
  deckPriority: Map<number, number>
  /** Optional lookup for oracle_id → card_name (used in shortfall reporting) */
  oracleIdToCardName?: Map<string, string>
}

export interface DemandEntry {
  deckCardsId: number
  deckId: number
  scryfallId: string | null // preferred printing from deck_cards
}

export interface SupplyEntry {
  physicalCopyId: number
  scryfallPrintingId: string | null
  isFoil: boolean
}

// ---------------------------------------------------------------------------
// Output Types
// ---------------------------------------------------------------------------

export interface AllocationOutputV2 {
  assignments: Assignment[]
  shortfalls: ShortfallEntry[]
}

export interface Assignment {
  deckCardsId: number
  physicalCopyId: number
  ownershipStatus: 'original'
}

export interface ShortfallEntry {
  oracleId: string
  cardName: string
  totalDemand: number
  totalSupply: number
  deficit: number
  unassignedDeckCardsIds: number[]
}

// ---------------------------------------------------------------------------
// Allocation Algorithm (Pure Function)
// ---------------------------------------------------------------------------

/**
 * Compute allocation assignments for all demand entries against available supply.
 *
 * This is a PURE function — no database access — for testability.
 *
 * For each oracle_id in the demand map:
 * 1. Sort demand by deck priority (lower value = higher priority), tie-break deck_id ASC.
 *    Decks not in deckPriority get a default priority of Infinity (lowest).
 * 2. For each demand entry (in priority order), select the best available supply copy:
 *    a. First preference: copy whose scryfallPrintingId matches demand's scryfallId
 *    b. Second preference: non-foil over foil
 *    c. If multiple copies tie, pick the first one
 * 3. If a copy is found: create Assignment, remove from available supply
 * 4. If supply exhausted: add to shortfall list
 *
 * Validates: Requirements 5.3, 5.4, 5.5, 5.7
 */
export function computeAllocationV2(input: AllocationInputV2): AllocationOutputV2 {
  const { demandMap, supplyMap, deckPriority, oracleIdToCardName } = input
  const assignments: Assignment[] = []
  const shortfalls: ShortfallEntry[] = []

  for (const [oracleId, demandEntries] of demandMap) {
    // 1. Sort demand by deck priority (lower = higher priority), tie-break deck_id ASC
    const sortedDemand = [...demandEntries].sort((a, b) => {
      const priorityA = deckPriority.get(a.deckId) ?? Infinity
      const priorityB = deckPriority.get(b.deckId) ?? Infinity
      if (priorityA !== priorityB) return priorityA - priorityB
      return a.deckId - b.deckId
    })

    // 2. Get available supply copies for this oracle_id (mutable copy)
    const availableSupply = [...(supplyMap.get(oracleId) || [])]

    // Track unassigned deck_cards IDs for shortfall reporting
    const unassignedDeckCardsIds: number[] = []

    for (const demand of sortedDemand) {
      // 3. Find best available supply copy
      const bestIdx = findBestSupplyCopy(availableSupply, demand.scryfallId)

      if (bestIdx !== -1) {
        // Assign: create assignment and remove copy from available supply
        const copy = availableSupply[bestIdx]
        assignments.push({
          deckCardsId: demand.deckCardsId,
          physicalCopyId: copy.physicalCopyId,
          ownershipStatus: 'original',
        })
        availableSupply.splice(bestIdx, 1)
      } else {
        // Supply exhausted: track for shortfall
        unassignedDeckCardsIds.push(demand.deckCardsId)
      }
    }

    // Build shortfall entry if any demand went unmet
    if (unassignedDeckCardsIds.length > 0) {
      const totalDemand = demandEntries.length
      const totalSupply = (supplyMap.get(oracleId) || []).length
      shortfalls.push({
        oracleId,
        cardName: oracleIdToCardName?.get(oracleId) ?? oracleId,
        totalDemand,
        totalSupply,
        deficit: totalDemand - totalSupply,
        unassignedDeckCardsIds,
      })
    }
  }

  return { assignments, shortfalls }
}

// Log is called from runAllocationResolver after compute
export function logAllocationOutput(output: AllocationOutputV2): void {
  console.log(`[allocation-resolver-v2] Compute result: ${output.assignments.length} assignments, ${output.shortfalls.length} shortfall entries`)
  if (output.shortfalls.length > 0) {
    const totalUnassigned = output.shortfalls.reduce((s, sf) => s + sf.unassignedDeckCardsIds.length, 0)
    console.log(`[allocation-resolver-v2] Total unassigned deck_cards: ${totalUnassigned}`)
  }
}

/**
 * Find the best available supply copy for a demand entry.
 *
 * Preference order:
 * 1. Matching scryfallPrintingId (exact printing match)
 * 2. Non-foil over foil
 * 3. First available (stable order)
 *
 * Returns the index of the best copy, or -1 if supply is empty.
 */
function findBestSupplyCopy(
  available: SupplyEntry[],
  preferredScryfallId: string | null
): number {
  if (available.length === 0) return -1

  let bestIdx = 0
  let bestScore = scoreCopy(available[0], preferredScryfallId)

  for (let i = 1; i < available.length; i++) {
    const score = scoreCopy(available[i], preferredScryfallId)
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }

  return bestIdx
}

/**
 * Score a supply copy for selection priority.
 * Higher score = better match.
 *
 * Scoring:
 * - +2 if scryfallPrintingId matches the demand's preferred scryfallId
 * - +1 if non-foil
 */
function scoreCopy(copy: SupplyEntry, preferredScryfallId: string | null): number {
  let score = 0
  if (
    preferredScryfallId &&
    copy.scryfallPrintingId &&
    copy.scryfallPrintingId === preferredScryfallId
  ) {
    score += 2
  }
  if (!copy.isFoil) {
    score += 1
  }
  return score
}

// ---------------------------------------------------------------------------
// Build Allocation Input
// ---------------------------------------------------------------------------

/**
 * Build the demand map, supply map, and deck priority map for a user.
 *
 * Demand: deck_cards rows for active decks, grouped by oracle_id via card_definitions.
 * Supply: non-proxy physical_copies, grouped by oracle_id via card_definitions.
 * Priority: deck_priority table entries for the user.
 *
 * deck_cards rows whose card_name has no matching card_definitions entry are skipped
 * and logged for diagnostics.
 */
export async function buildAllocationInputV2(userId: string): Promise<AllocationInputV2> {
  const supabase = createAdminClient()

  // -------------------------------------------------------------------------
  // 1. Build demand map
  //    JOIN deck_cards → decks (active only) → card_definitions (on card_name)
  //    to resolve oracle_id for grouping.
  // -------------------------------------------------------------------------

  const demandMap = new Map<string, DemandEntry[]>()

  // Fetch deck_cards for active decks belonging to this user
  // Exclude proxy rows — they're already assigned and shouldn't be reallocated

  // First get active deck IDs
  const { data: activeDecksForDemand, error: activeDecksFetchErr } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (activeDecksFetchErr) {
    throw new Error(`Failed to fetch active decks for demand: ${activeDecksFetchErr.message}`)
  }

  const activeDeckIdsForDemand = (activeDecksForDemand || []).map((d) => d.id)

  console.log(`[allocation-resolver-v2] Active deck IDs: [${activeDeckIdsForDemand.join(', ')}]`)

  let deckCardsRows: any[] = []
  let deckCardsErr: any = null

  if (activeDeckIdsForDemand.length > 0) {
    const result = await supabase
      .from('deck_cards')
      .select('id, deck_id, card_name, scryfall_id, ownership_status')
      .eq('user_id', userId)
      .in('deck_id', activeDeckIdsForDemand)
      .limit(10000)

    deckCardsRows = result.data || []
    deckCardsErr = result.error
  }

  if (deckCardsErr) {
    throw new Error(`Failed to fetch deck_cards for demand map: ${deckCardsErr.message}`)
  }

  console.log(`[allocation-resolver-v2] Fetched ${deckCardsRows.length} deck_cards rows for demand`)

  // Fetch all card_definitions for this user to build a card_name → oracle_id lookup
  const { data: cardDefRows, error: cardDefErr } = await fetchAllRows(
    (from, to) => supabase
      .from('card_definitions')
      .select('id, card_name, oracle_id')
      .eq('user_id', userId)
      .range(from, to)
  )

  if (cardDefErr) {
    throw new Error(`Failed to fetch card_definitions: ${cardDefErr.message}`)
  }

  console.log(`[allocation-resolver-v2] Fetched ${(cardDefRows || []).length} card_definitions`)

  // Build card_name → oracle_id lookup (first match wins — card_name should be unique per user)
  const cardNameToOracleId = new Map<string, string>()
  for (const def of cardDefRows || []) {
    if (!cardNameToOracleId.has(def.card_name)) {
      cardNameToOracleId.set(def.card_name, def.oracle_id)
    }
  }

  // Group deck_cards by oracle_id
  const skippedDemand: string[] = []
  for (const row of deckCardsRows || []) {
    // Skip proxy rows — they're already assigned and shouldn't be reallocated
    if (row.ownership_status === 'proxy') continue

    const oracleId = cardNameToOracleId.get(row.card_name)
    if (!oracleId) {
      skippedDemand.push(row.card_name)
      continue
    }

    const entry: DemandEntry = {
      deckCardsId: row.id,
      deckId: row.deck_id,
      scryfallId: row.scryfall_id ?? null,
    }

    const existing = demandMap.get(oracleId)
    if (existing) {
      existing.push(entry)
    } else {
      demandMap.set(oracleId, [entry])
    }
  }

  // Log skipped cards for diagnostics
  if (skippedDemand.length > 0) {
    const uniqueSkipped = Array.from(new Set(skippedDemand))
    console.warn(
      `[allocation-resolver-v2] Skipped ${uniqueSkipped.length} card name(s) with no card_definitions match:`,
      uniqueSkipped.slice(0, 20) // limit log output
    )
  }

  console.log(`[allocation-resolver-v2] Demand map: ${demandMap.size} unique oracle_ids, ${Array.from(demandMap.values()).reduce((s, arr) => s + arr.length, 0)} total demand entries`)

  // -------------------------------------------------------------------------
  // 2. Build supply map
  //    GROUP physical_copies by card_definition_id → oracle_id
  //    WHERE is_proxy = false
  // -------------------------------------------------------------------------

  const supplyMap = new Map<string, SupplyEntry[]>()

  const { data: physicalCopyRows, error: physicalCopyErr } = await fetchAllRows(
    (from, to) => supabase
      .from('physical_copies')
      .select('id, card_definition_id, scryfall_printing_id, is_foil')
      .eq('user_id', userId)
      .eq('is_proxy', false)
      .range(from, to)
  )

  if (physicalCopyErr) {
    throw new Error(`Failed to fetch physical_copies for supply map: ${physicalCopyErr.message}`)
  }

  console.log(`[allocation-resolver-v2] Fetched ${(physicalCopyRows || []).length} physical_copies for supply`)

  // Build card_definition_id → oracle_id lookup
  const defIdToOracleId = new Map<number, string>()
  for (const def of cardDefRows || []) {
    defIdToOracleId.set(def.id, def.oracle_id)
  }

  for (const copy of physicalCopyRows || []) {
    const oracleId = defIdToOracleId.get(copy.card_definition_id)
    if (!oracleId) {
      // Physical copy references a card_definition_id not in our lookup — skip
      continue
    }

    const entry: SupplyEntry = {
      physicalCopyId: copy.id,
      scryfallPrintingId: copy.scryfall_printing_id ?? null,
      isFoil: copy.is_foil,
    }

    const existing = supplyMap.get(oracleId)
    if (existing) {
      existing.push(entry)
    } else {
      supplyMap.set(oracleId, [entry])
    }
  }

  // -------------------------------------------------------------------------
  // 3. Build deck priority map
  // -------------------------------------------------------------------------

  console.log(`[allocation-resolver-v2] Supply map: ${supplyMap.size} unique oracle_ids, ${Array.from(supplyMap.values()).reduce((s, arr) => s + arr.length, 0)} total supply entries`)

  // Check overlap between demand and supply
  let matchingOracleIds = 0
  for (const oracleId of demandMap.keys()) {
    if (supplyMap.has(oracleId)) matchingOracleIds++
  }
  console.log(`[allocation-resolver-v2] Demand oracle_ids with supply: ${matchingOracleIds} / ${demandMap.size}`)

  const deckPriority = new Map<number, number>()

  const { data: priorityRows, error: priorityErr } = await supabase
    .from('deck_priority')
    .select('deck_id, priority')
    .eq('user_id', userId)

  if (priorityErr) {
    throw new Error(`Failed to fetch deck_priority: ${priorityErr.message}`)
  }

  for (const row of priorityRows || []) {
    deckPriority.set(row.deck_id, row.priority)
  }

  // -------------------------------------------------------------------------
  // 4. Build oracle_id → card_name lookup (for shortfall reporting)
  // -------------------------------------------------------------------------

  const oracleIdToCardName = new Map<string, string>()
  for (const def of cardDefRows || []) {
    if (!oracleIdToCardName.has(def.oracle_id)) {
      oracleIdToCardName.set(def.oracle_id, def.card_name)
    }
  }

  return { demandMap, supplyMap, deckPriority, oracleIdToCardName }
}
