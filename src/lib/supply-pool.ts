/**
 * Supply Pool — In-Memory Physical Copy Pool for Batch Resolution
 *
 * Manages an in-memory pool of physical copies indexed by card_name.
 * Replaces the per-card `fetchEnrichedSupply()` calls in `resolveDeckBatch()`
 * with O(1) lookups against a pre-loaded dataset.
 *
 * The pool tracks assignment state in-memory as decks are resolved sequentially,
 * enabling contention detection without re-querying the database.
 */

import type { EnrichedSupplyEntry, CopyAssignment, CandidateTier } from '@/lib/allocation-candidates'
import { classifyTier, scoreCandidate } from '@/lib/allocation-candidates'
import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Assignment Types (for batchAssignDeck)
// ---------------------------------------------------------------------------

export interface Assignment {
  deckCardsId: number
  physicalCopyId: number
  ownershipStatus: 'original' | 'proxy'
  /** If this is a Tier 3 reassign, the source deck_cards row to clear */
  clearDeckCardsId?: number | null
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Records a contention event: two decks wanted the same card, one won, one lost. */
export interface ContentionEntry {
  cardName: string
  /** The deck that claimed the card (resolved earlier in the batch) */
  keptByDeckId: number
  keptByDeckName: string
  /** The deck that lost the card (could not resolve because supply was exhausted) */
  lostByDeckId: number
  lostByDeckName: string
}

// ---------------------------------------------------------------------------
// SupplyPool Class
// ---------------------------------------------------------------------------

/**
 * In-memory pool of physical copies for batch resolution.
 *
 * Constructed with entries grouped by card_name. Provides methods to:
 * - Query available copies for a card (filtered by tier eligibility)
 * - Mark copies as assigned (removes from available pool)
 * - Mark copies as freed (returns to available pool, used for Tier 3 reassigns)
 * - Detect contentions from in-memory state without re-querying the database
 */
export class SupplyPool {
  /** Pool indexed by card_name → array of enriched entries */
  private pool: Map<string, EnrichedSupplyEntry[]>

  /**
   * Track which copies were assigned during this batch session.
   * Maps physicalCopyId → { deckId, deckName } of the deck that claimed it.
   */
  private sessionAssignments: Map<number, { deckId: number; deckName: string }>

  constructor(entries: Map<string, EnrichedSupplyEntry[]>) {
    this.pool = entries
    this.sessionAssignments = new Map()
  }

  /**
   * Get available copies for a card, filtered to unassigned + Tier 1-3 eligible,
   * sorted by tier ascending then score descending.
   */
  getAvailableCopies(cardName: string): EnrichedSupplyEntry[] {
    const entries = this.pool.get(cardName)
    if (!entries || entries.length === 0) return []

    // Filter to entries that are eligible: unassigned (Tier 1-2) or reassignable from Brew (Tier 3)
    const eligible = entries.filter((entry) => {
      const tier = classifyTier(entry)
      // Tiers 1-3 are eligible for auto-selection in batch resolution
      return tier <= 3
    })

    // Sort by tier ascending, then score descending (higher score = better match)
    eligible.sort((a, b) => {
      const tierA = classifyTier(a)
      const tierB = classifyTier(b)
      if (tierA !== tierB) return tierA - tierB
      // Within same tier, sort by score descending (no preferred scryfall_id in batch context)
      const scoreA = scoreCandidate(a, null)
      const scoreB = scoreCandidate(b, null)
      return scoreB - scoreA
    })

    return eligible
  }

  /**
   * Mark a physical copy as assigned to a deck_cards row.
   * Updates in-memory state so subsequent deck resolutions see the assignment.
   */
  markAssigned(
    physicalCopyId: number,
    deckCardsId: number,
    deckId: number,
    deckName: string
  ): void {
    // Track this assignment in the session
    this.sessionAssignments.set(physicalCopyId, { deckId, deckName })

    // Update the in-memory pool entry to reflect the new assignment
    for (const [, entries] of this.pool) {
      const entry = entries.find((e) => e.physicalCopyId === physicalCopyId)
      if (entry) {
        entry.assignedTo = {
          deckCardsId,
          deckId,
          deckName,
          deckStatus: 'brew', // Newly assigned copies go to a deck being resolved (brew status)
        }
        break
      }
    }
  }

  /**
   * Mark a physical copy as freed (released from its current assignment).
   * Used when a Tier 3 reassign clears the source assignment.
   */
  markFreed(physicalCopyId: number): void {
    // Remove from session assignments if present
    this.sessionAssignments.delete(physicalCopyId)

    // Update the in-memory pool entry to reflect the copy is now unassigned
    for (const [, entries] of this.pool) {
      const entry = entries.find((e) => e.physicalCopyId === physicalCopyId)
      if (entry) {
        entry.assignedTo = null
        break
      }
    }
  }

  /**
   * Detect contentions from in-memory state without re-querying the database.
   *
   * A contention occurs when a card that the current deck needs was assigned to
   * another deck earlier in this batch session (i.e., the supply was exhausted
   * by a prior deck's resolution).
   */
  detectContentions(
    unresolvedCards: Array<{ cardName: string; deckId: number; deckName: string }>,
    currentDeckId: number
  ): ContentionEntry[] {
    const contentions: ContentionEntry[] = []

    for (const { cardName, deckId: lostByDeckId, deckName: lostByDeckName } of unresolvedCards) {
      // Check if any copies of this card were assigned during this batch session
      // to a different deck (meaning the current deck lost out)
      const entries = this.pool.get(cardName)
      if (!entries) continue

      for (const entry of entries) {
        if (entry.physicalCopyId < 0) continue // skip synthetic entries
        const sessionAssignment = this.sessionAssignments.get(entry.physicalCopyId)
        if (
          sessionAssignment &&
          sessionAssignment.deckId !== currentDeckId &&
          sessionAssignment.deckId !== lostByDeckId
        ) {
          contentions.push({
            cardName,
            keptByDeckId: sessionAssignment.deckId,
            keptByDeckName: sessionAssignment.deckName,
            lostByDeckId,
            lostByDeckName,
          })
          // Only report one contention per card — the first deck that claimed it
          break
        }
      }
    }

    return contentions
  }
}


// ---------------------------------------------------------------------------
// Pagination Helper
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000

/**
 * Generic paginated fetch using `.range(from, to)` to handle the PostgREST
 * hard max_rows=1000 limit. Loops until fewer than PAGE_SIZE rows are returned.
 */
async function fetchAllRows<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const allRows: T[] = []
  let offset = 0

  while (true) {
    const { data, error } = await queryFn(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`Paginated fetch failed at offset ${offset}: ${error.message}`)
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return allRows
}

// ---------------------------------------------------------------------------
// Load Supply Pool
// ---------------------------------------------------------------------------

/**
 * Load the user's full physical_copies pool with assignment status into memory.
 *
 * Implementation:
 * 1. Fetch ALL `card_definitions` for the user (paginated) → build `defIdToCardName` map
 * 2. Fetch ALL `physical_copies` for the user (paginated) with nested joins:
 *    - `deck_cards!deck_cards_physical_copy_id_fkey` (left join) → `decks!deck_cards_deck_id_fkey(name, status)`
 *    - `storage_locations(name)`
 * 3. Map each physical_copy to an `EnrichedSupplyEntry`
 * 4. Group by `card_name` (from the `defIdToCardName` map)
 * 5. Construct and return `new SupplyPool(groupedEntries)`
 *
 * Handles PostgREST's hard 1000-row limit via pagination for both queries.
 */
export async function loadSupplyPool(userId: string): Promise<SupplyPool> {
  const supabase = createAdminClient()

  // Step 1: Fetch ALL card_definitions for the user (paginated) → build defId → card_name map
  const defs = await fetchAllRows<{ id: number; card_name: string }>(
    (from, to) =>
      supabase
        .from('card_definitions')
        .select('id, card_name')
        .eq('user_id', userId)
        .range(from, to)
  )

  const defIdToCardName = new Map<number, string>()
  for (const def of defs) {
    defIdToCardName.set(def.id, def.card_name)
  }

  // Step 2: Fetch ALL physical_copies for the user (paginated) with nested joins
  const copies = await fetchAllRows<any>(
    (from, to) =>
      supabase
        .from('physical_copies')
        .select(`
          id,
          card_definition_id,
          scryfall_printing_id,
          is_foil,
          is_proxy,
          condition,
          storage_location_id,
          storage_locations(name),
          deck_cards!deck_cards_physical_copy_id_fkey(
            id,
            deck_id,
            decks!deck_cards_deck_id_fkey(name, status)
          )
        `)
        .eq('user_id', userId)
        .range(from, to)
  )

  // Step 3: Map each physical_copy to an EnrichedSupplyEntry and group by card_name
  const grouped = new Map<string, EnrichedSupplyEntry[]>()

  for (const copy of copies) {
    const cardName = defIdToCardName.get(copy.card_definition_id)
    if (!cardName) continue // orphan physical_copy with no matching definition — skip

    // deck_cards is an array (left join) — empty if unassigned
    const deckCardsArr = copy.deck_cards || []
    let assignedTo: CopyAssignment | null = null

    if (deckCardsArr.length > 0) {
      const dc = deckCardsArr[0]
      const deck = dc.decks
      assignedTo = {
        deckCardsId: dc.id,
        deckId: dc.deck_id,
        deckName: deck?.name ?? `Deck ${dc.deck_id}`,
        deckStatus: deck?.status ?? 'unknown',
      }
    }

    const entry: EnrichedSupplyEntry = {
      physicalCopyId: copy.id,
      cardDefinitionId: copy.card_definition_id,
      scryfallPrintingId: copy.scryfall_printing_id ?? null,
      isFoil: copy.is_foil,
      isProxy: copy.is_proxy,
      condition: copy.condition ?? null,
      storageLocationId: copy.storage_location_id ?? null,
      storageLocationName: copy.storage_locations?.name ?? null,
      assignedTo,
    }

    const existing = grouped.get(cardName)
    if (existing) {
      existing.push(entry)
    } else {
      grouped.set(cardName, [entry])
    }
  }

  // Step 4: Construct and return SupplyPool
  return new SupplyPool(grouped)
}

// ---------------------------------------------------------------------------
// Batch Assign Deck — Atomic Batch Upsert
// ---------------------------------------------------------------------------

/**
 * Atomically apply all physical_copy_id + ownership_status assignments for a
 * single deck's resolution pass.
 *
 * Uses the `batch_assign_deck` Supabase RPC which wraps all updates in a single
 * Postgres transaction. If the RPC is unavailable (migration not yet applied),
 * falls back to sequential client-side UPDATE operations with a warning.
 *
 * On failure: throws so the caller knows not to update pool state or proceed.
 */
export async function batchAssignDeck(
  deckId: number,
  assignments: Assignment[]
): Promise<void> {
  if (assignments.length === 0) return

  const supabase = createAdminClient()

  // Attempt transactional RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('batch_assign_deck', {
    p_assignments: JSON.stringify(
      assignments.map((a) => ({
        deck_cards_id: a.deckCardsId,
        physical_copy_id: a.physicalCopyId,
        ownership_status: a.ownershipStatus,
        clear_deck_cards_id: a.clearDeckCardsId ?? null,
      }))
    ),
  })

  if (!error) {
    return
  }

  // Check if the error indicates the RPC function doesn't exist
  // Same detection pattern as deck-cards-diff.ts
  const isRpcNotFound =
    error.code === '42883' || // PG: undefined_function
    error.message?.includes('not found') ||
    error.message?.includes('does not exist') ||
    error.message?.includes('Could not find the function')

  if (!isRpcNotFound) {
    // Real error from the RPC — rethrow
    throw new Error(
      `[supply-pool] RPC batch_assign_deck failed for deck ${deckId}: ${error.message}`
    )
  }

  // ─── Fallback: non-atomic sequential operations ─────────────────────────
  console.warn('[supply-pool] RPC unavailable, using non-atomic fallback')

  // 1. Clear source assignments (Tier 3 reassigns)
  const toClear = assignments.filter((a) => a.clearDeckCardsId != null)
  for (const assignment of toClear) {
    const { error: clearError } = await supabase
      .from('deck_cards')
      .update({ physical_copy_id: null, ownership_status: null })
      .eq('id', assignment.clearDeckCardsId!)

    if (clearError) {
      throw new Error(
        `[supply-pool] Fallback clear failed for deck_cards ${assignment.clearDeckCardsId}: ${clearError.message}`
      )
    }
  }

  // 2. Apply new assignments
  for (const assignment of assignments) {
    const { error: assignError } = await supabase
      .from('deck_cards')
      .update({
        physical_copy_id: assignment.physicalCopyId,
        ownership_status: assignment.ownershipStatus,
      })
      .eq('id', assignment.deckCardsId)

    if (assignError) {
      throw new Error(
        `[supply-pool] Fallback assign failed for deck_cards ${assignment.deckCardsId}: ${assignError.message}`
      )
    }
  }
}
