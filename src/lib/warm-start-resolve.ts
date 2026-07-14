/**
 * Warm-Start Batch Resolution — Phase 2
 *
 * Sequentially resolves selected decks against the shared supply pool.
 * Uses Tiers 1–3 of the priority order (storage original, storage proxy, reassign from Brew).
 * Tier 4 (Boxed deck reassignment) is excluded entirely — no confirmation modals mid-batch.
 * Tier 5 (create proxy) is excluded — unresolved cards stay unresolved.
 *
 * MUST process decks in sequence (not parallel) — deck N's resolution must see
 * deck N-1's committed results since they draw from the same pool.
 */

import { createAdminClient } from '@/lib/supabase'
import { fetchDeck } from '@/lib/archidekt-client'
import { importDeckExistingCollection } from '@/lib/deck-import'
import { normalizeArchidektDeck } from '@/lib/deck-normalizer'
import type { EnrichedSupplyEntry } from '@/lib/allocation-candidates'
import {
  SupplyPool,
  loadSupplyPool,
  batchAssignDeck,
  type Assignment,
  type ContentionEntry,
} from '@/lib/supply-pool'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeckResolutionResult {
  deckId: number
  deckName: string
  totalCards: number
  matched: number
  unresolved: number
  unresolvedCards: string[] // card names that couldn't be matched
  errors: string[]
}

export type { ContentionEntry }

export interface BatchResolutionResult {
  decksProcessed: number
  results: DeckResolutionResult[]
  totalMatched: number
  totalUnresolved: number
  /** Cards that were contested between decks in this batch */
  contentions: ContentionEntry[]
  durationMs: number
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Resolve a batch of decks sequentially against the shared supply pool.
 *
 * For each deck:
 * 1. Fetch full deck data from Archidekt (fetchDeck)
 * 2. Normalize and import the deck (creates deck + deck_cards rows)
 * 3. For each unresolved deck_cards row, find candidates via pool.getAvailableCopies
 * 4. Assign from Tiers 1–3 only (free original, free proxy, or reassign from Brew deck)
 * 5. Anything that would need Tier 4 or higher → left unresolved
 *
 * Sequential processing ensures deck N sees deck N-1's committed assignments
 * reflected in pool state.
 */
export async function resolveDeckBatch(
  deckIds: number[],
  userId: string,
  deckStatuses?: Record<number, 'brew' | 'boxed'>
): Promise<BatchResolutionResult> {
  const startTime = Date.now()
  const results: DeckResolutionResult[] = []
  let totalMatched = 0
  let totalUnresolved = 0

  // Load the supply pool ONCE for the entire batch
  const pool = await loadSupplyPool(userId)

  for (const archidektDeckId of deckIds) {
    const status = deckStatuses?.[archidektDeckId] ?? 'boxed'
    const { result, assignments } = await resolveSingleDeck(archidektDeckId, userId, status, pool)
    results.push(result)

    // Attempt batch assignment write for this deck
    if (assignments.length > 0) {
      try {
        await batchAssignDeck(result.deckId, assignments)

        // On success: update pool state so subsequent decks see these assignments
        for (const assignment of assignments) {
          // Mark the physical copy as assigned in the pool
          pool.markAssigned(
            assignment.physicalCopyId,
            assignment.deckCardsId,
            result.deckId,
            result.deckName
          )

          // If this was a Tier 3 reassign, mark the freed copy in the pool
          // (markFreed was already called during resolution to make the copy
          // available, but that's handled inside resolveSingleDeck when collecting
          // assignments — the pool.markAssigned above is what matters for
          // subsequent decks)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[warm-start-resolve] batchAssignDeck failed for deck ${result.deckId}: ${message}`)
        result.errors.push(`Assignment batch failed: ${message}`)
        // DO NOT proceed to subsequent decks — pool state is now unreliable
        // Adjust matched/unresolved counts since the write didn't commit
        totalMatched += 0
        totalUnresolved += result.matched + result.unresolved
        // Override the result counts since nothing was actually written
        result.unresolved = result.matched + result.unresolved
        result.matched = 0
        break
      }
    }

    totalMatched += result.matched
    totalUnresolved += result.unresolved
  }

  // Detect contentions from in-memory pool state (no re-querying needed)
  const allUnresolvedCards: Array<{ cardName: string; deckId: number; deckName: string }> = []
  for (const result of results) {
    for (const cardName of result.unresolvedCards) {
      allUnresolvedCards.push({
        cardName,
        deckId: result.deckId,
        deckName: result.deckName,
      })
    }
  }

  // For contention detection, we check each deck's unresolved cards against
  // all other decks in the batch. Use the first deck as the "current" perspective
  // since detectContentions needs a currentDeckId to exclude self-assignments.
  const contentions: ContentionEntry[] = []
  for (const result of results) {
    if (result.unresolvedCards.length === 0) continue

    const unresolvedForThisDeck = result.unresolvedCards.map((cardName) => ({
      cardName,
      deckId: result.deckId,
      deckName: result.deckName,
    }))

    const deckContentions = pool.detectContentions(unresolvedForThisDeck, result.deckId)

    // Deduplicate: only add contentions we haven't already recorded
    for (const c of deckContentions) {
      const alreadyRecorded = contentions.some(
        (existing) =>
          existing.cardName === c.cardName &&
          existing.keptByDeckId === c.keptByDeckId &&
          existing.lostByDeckId === c.lostByDeckId
      )
      if (!alreadyRecorded) {
        contentions.push(c)
      }
    }
  }

  return {
    decksProcessed: deckIds.length,
    results,
    totalMatched,
    totalUnresolved,
    contentions,
    durationMs: Date.now() - startTime,
  }
}

// ---------------------------------------------------------------------------
// Per-Deck Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a single deck against the shared supply pool.
 *
 * Accepts `pool: SupplyPool` as parameter — does NOT create queries internally
 * for candidate lookups. Still uses createAdminClient() for the one remaining
 * DB read: fetching unresolved deck_cards after import.
 *
 * Returns an assignment list alongside the result summary rather than writing
 * directly — the caller batches the write via batchAssignDeck().
 */
async function resolveSingleDeck(
  archidektDeckId: number,
  userId: string,
  deckStatus: 'brew' | 'boxed' = 'boxed',
  pool: SupplyPool
): Promise<{ result: DeckResolutionResult; assignments: Assignment[] }> {
  const errors: string[] = []
  const assignments: Assignment[] = []
  const supabase = createAdminClient()

  // Step 1: Fetch deck from Archidekt
  let deckData: Awaited<ReturnType<typeof fetchDeck>>
  try {
    deckData = await fetchDeck(archidektDeckId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('403')) {
      return {
        result: {
          deckId: archidektDeckId,
          deckName: `Deck ${archidektDeckId}`,
          totalCards: 0,
          matched: 0,
          unresolved: 0,
          unresolvedCards: [],
          errors: [`Deck is private — set it to Public in Archidekt first.`],
        },
        assignments: [],
      }
    }
    return {
      result: {
        deckId: archidektDeckId,
        deckName: `Deck ${archidektDeckId}`,
        totalCards: 0,
        matched: 0,
        unresolved: 0,
        unresolvedCards: [],
        errors: [`Failed to fetch deck: ${message}`],
      },
      assignments: [],
    }
  }

  // Step 2: Normalize the Archidekt deck data
  const sourceUrl = `https://archidekt.com/decks/${archidektDeckId}`
  let normalizedDeck: ReturnType<typeof normalizeArchidektDeck>
  try {
    normalizedDeck = normalizeArchidektDeck(deckData, sourceUrl)
  } catch (err) {
    return {
      result: {
        deckId: archidektDeckId,
        deckName: deckData.name || `Deck ${archidektDeckId}`,
        totalCards: 0,
        matched: 0,
        unresolved: 0,
        unresolvedCards: [],
        errors: [`Failed to normalize deck: ${err instanceof Error ? err.message : String(err)}`],
      },
      assignments: [],
    }
  }

  // Step 3: Import the deck (creates deck + deck_cards rows)
  // skipAutoAssign: true — batch resolver handles assignment itself, avoiding race conditions
  // with the fire-and-forget auto-assign that would otherwise run.
  let importedDeckId: number
  try {
    const importResult = await importDeckExistingCollection(normalizedDeck, userId, { status: deckStatus, skipAutoAssign: true })
    importedDeckId = importResult.deckId
  } catch (err) {
    return {
      result: {
        deckId: archidektDeckId,
        deckName: normalizedDeck.name || `Deck ${archidektDeckId}`,
        totalCards: normalizedDeck.cardCount || 0,
        matched: 0,
        unresolved: 0,
        unresolvedCards: [],
        errors: [`Failed to import deck: ${err instanceof Error ? err.message : String(err)}`],
      },
      assignments: [],
    }
  }

  // Step 4: Fetch all unresolved deck_cards for this newly imported deck
  // This is the ONE remaining direct DB read in this function
  const { data: unresolvedRows, error: fetchErr } = await supabase
    .from('deck_cards')
    .select('id, card_name')
    .eq('deck_id', importedDeckId)
    .is('physical_copy_id', null)

  if (fetchErr) {
    errors.push(`Failed to fetch unresolved deck_cards: ${fetchErr.message}`)
    return {
      result: {
        deckId: importedDeckId,
        deckName: normalizedDeck.name,
        totalCards: normalizedDeck.cardCount || 0,
        matched: 0,
        unresolved: 0,
        unresolvedCards: [],
        errors,
      },
      assignments: [],
    }
  }

  const totalCards = normalizedDeck.cardCount || 0
  if (!unresolvedRows || unresolvedRows.length === 0) {
    // All cards were already resolved (e.g. auto-assign completed first)
    return {
      result: {
        deckId: importedDeckId,
        deckName: normalizedDeck.name,
        totalCards,
        matched: totalCards,
        unresolved: 0,
        unresolvedCards: [],
        errors,
      },
      assignments: [],
    }
  }

  // Step 5: Group unresolved cards by name for efficient candidate lookup
  const cardNameGroups = new Map<string, number[]>() // card_name → [deckCardsId, ...]
  for (const row of unresolvedRows) {
    const existing = cardNameGroups.get(row.card_name)
    if (existing) existing.push(row.id)
    else cardNameGroups.set(row.card_name, [row.id])
  }

  // Step 6: For each unique card_name, get candidates from pool and assign Tiers 1–3 only
  let matched = 0
  const unresolvedCards: string[] = []

  for (const [cardName, deckCardsIds] of cardNameGroups) {
    // Use the pool instead of fetchEnrichedSupply — O(1) lookup
    const candidates: EnrichedSupplyEntry[] = pool.getAvailableCopies(cardName)

    // Pool already filters to Tier 1-3 eligible and sorts by tier/score
    // Assign one candidate per deck_cards row
    let candidateIdx = 0

    for (const deckCardsId of deckCardsIds) {
      if (candidateIdx >= candidates.length) {
        // No more eligible candidates for remaining copies of this card
        break
      }

      const candidate = candidates[candidateIdx]
      candidateIdx++

      const ownershipStatus: 'original' | 'proxy' = candidate.isProxy ? 'proxy' : 'original'

      // If Tier 3 (reassign from Brew deck), capture the clear operation
      // and update pool state immediately so subsequent cards in this deck see it
      let clearDeckCardsId: number | null = null
      if (candidate.assignedTo) {
        clearDeckCardsId = candidate.assignedTo.deckCardsId
        // Mark the copy as freed in the pool so it's recognized as available
        // (the actual DB write happens in batchAssignDeck)
        pool.markFreed(candidate.physicalCopyId)
      }

      // Collect the assignment (no direct DB write)
      assignments.push({
        deckCardsId,
        physicalCopyId: candidate.physicalCopyId,
        ownershipStatus,
        clearDeckCardsId,
      })

      matched++
    }

    // Track cards that have at least one unresolved copy
    const resolvedForThisCard = Math.min(candidateIdx, deckCardsIds.length)
    if (resolvedForThisCard < deckCardsIds.length) {
      unresolvedCards.push(cardName)
    }
  }

  const unresolved = unresolvedRows.length - matched

  return {
    result: {
      deckId: importedDeckId,
      deckName: normalizedDeck.name,
      totalCards,
      matched,
      unresolved,
      unresolvedCards,
      errors,
    },
    assignments,
  }
}
