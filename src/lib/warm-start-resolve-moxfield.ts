/**
 * Warm-Start Batch Resolution — Moxfield Variant
 *
 * Same import model as the Archidekt version: Active decks are imported as
 * planned rows plus one sleeve claim per non-basic slot (nothing physical is
 * assigned during import — the finalize pass on "Go to Decks" is the only
 * authority on real copies), and Brew decks stay fully planned.
 *
 * Processes decks sequentially so each deck sees the previous deck's committed results.
 */

import { fetchMoxfieldDeck } from '@/lib/moxfield-client'
import { importDeckTheorycrafted } from '@/lib/deck-import'
import { createSleeveClaimsForDeck } from '@/lib/import-sleeve-claims'
import { normalizeMoxfieldDeck } from '@/lib/deck-normalizer'
import { fetchEnrichedSupply } from '@/lib/allocation-candidates'
import type { BatchResolutionResult, DeckResolutionResult, ContentionEntry } from '@/lib/warm-start-resolve'

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Resolve a batch of Moxfield decks sequentially.
 *
 * For each deck:
 * 1. Fetch full deck data from Moxfield (fetchMoxfieldDeck)
 * 2. Normalize and import the deck (creates deck + deck_cards rows)
 * 3. Active: create sleeve claims for non-basic slots (batch-scoped)
 *    Brew: leave everything planned
 */
export async function resolveMoxfieldDeckBatch(
  publicIds: string[],
  userId: string,
  deckActiveStates?: Record<string, boolean>,
  batchId?: string | null
): Promise<BatchResolutionResult> {
  const startTime = Date.now()
  const results: DeckResolutionResult[] = []
  let totalMatched = 0
  let totalUnresolved = 0

  for (const publicId of publicIds) {
    const isActive = deckActiveStates?.[publicId] ?? true
    const result = await resolveSingleMoxfieldDeck(publicId, userId, isActive, batchId)
    results.push(result)
    totalMatched += result.matched
    totalUnresolved += result.unresolved
  }

  // Detect contentions: for each deck with unresolved cards, check if another deck
  // in this batch holds the only available copy.
  const contentions: ContentionEntry[] = []

  for (const result of results) {
    if (result.unresolvedCards.length === 0) continue

    for (const cardName of result.unresolvedCards) {
      try {
        const candidates = await fetchEnrichedSupply(cardName, userId)
        for (const candidate of candidates) {
          if (candidate.assignedTo) {
            const winnerInBatch = results.find(r => r.deckId === candidate.assignedTo!.deckId && r.deckId !== result.deckId)
            if (winnerInBatch) {
              const alreadyRecorded = contentions.some(
                c => c.cardName === cardName && c.keptByDeckId === winnerInBatch.deckId && c.lostByDeckId === result.deckId
              )
              if (!alreadyRecorded) {
                contentions.push({
                  cardName,
                  keptByDeckId: winnerInBatch.deckId,
                  keptByDeckName: winnerInBatch.deckName,
                  lostByDeckId: result.deckId,
                  lostByDeckName: result.deckName,
                })
              }
              break
            }
          }
        }
      } catch {
        // Non-blocking
      }
    }
  }

  return {
    decksProcessed: publicIds.length,
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

async function resolveSingleMoxfieldDeck(
  publicId: string,
  userId: string,
  isActive: boolean = true,
  batchId?: string | null
): Promise<DeckResolutionResult> {
  const errors: string[] = []

  // Step 1: Fetch deck from Moxfield
  let deckData: Awaited<ReturnType<typeof fetchMoxfieldDeck>>
  try {
    deckData = await fetchMoxfieldDeck(publicId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      deckId: hashMoxfieldId(publicId),
      deckName: `Deck ${publicId}`,
      totalCards: 0,
      matched: 0,
      unresolved: 0,
      unresolvedCards: [],
      errors: [`Failed to fetch deck: ${message}`],
    }
  }

  // Step 2: Normalize the Moxfield deck data
  const sourceUrl = `https://moxfield.com/decks/${publicId}`
  let normalizedDeck: ReturnType<typeof normalizeMoxfieldDeck>
  try {
    normalizedDeck = normalizeMoxfieldDeck(deckData, sourceUrl)
  } catch (err) {
    return {
      deckId: hashMoxfieldId(publicId),
      deckName: deckData.name || `Deck ${publicId}`,
      totalCards: 0,
      matched: 0,
      unresolved: 0,
      unresolvedCards: [],
      errors: [`Failed to normalize deck: ${err instanceof Error ? err.message : String(err)}`],
    }
  }

  // Step 3: Import the deck (creates deck + deck_cards rows)
  let importedDeckId: number
  try {
    const importResult = await importDeckTheorycrafted(normalizedDeck, userId, { isActive })
    importedDeckId = importResult.deckId
  } catch (err) {
    return {
      deckId: hashMoxfieldId(publicId),
      deckName: normalizedDeck.name || `Deck ${publicId}`,
      totalCards: normalizedDeck.cardCount || 0,
      matched: 0,
      unresolved: 0,
      unresolvedCards: [],
      errors: [`Failed to import deck: ${err instanceof Error ? err.message : String(err)}`],
    }
  }

  // Claims model: Active decks reconcile exactly like Archidekt imports — one
  // claim per non-basic slot, intents editable on the import summary, physical
  // copies materialized by the finalize pass on "Go to Decks". The supply-pool
  // path below remains only for Brew decks (pre-existing behaviour).
  if (isActive) {
    const { claimsCreated, error } = await createSleeveClaimsForDeck(
      importedDeckId,
      userId,
      batchId
    )
    if (error) errors.push(error)
    return {
      deckId: importedDeckId,
      deckName: normalizedDeck.name,
      totalCards: normalizedDeck.cardCount || 0,
      matched: claimsCreated,
      unresolved: 0,
      unresolvedCards: [],
      errors,
    }
  }

  // Step 4: claims, not assignments — matching the Archidekt import model.
  // Active decks assert every non-basic slot as a sleeve claim; nothing physical
  // is assigned during import, so every deck stays equally editable on the
  // reconciliation summary, and the single finalize pass on "Go to Decks" is the
  // only authority on real assignment. Brew decks stay fully planned.
  const totalCards = normalizedDeck.cardCount || 0

  if (!isActive) {
    return {
      deckId: importedDeckId,
      deckName: normalizedDeck.name,
      totalCards,
      matched: 0,
      unresolved: 0,
      unresolvedCards: [],
      errors,
    }
  }

  const { claimsCreated, error: claimsError } = await createSleeveClaimsForDeck(
    importedDeckId,
    userId,
    batchId
  )
  if (claimsError) errors.push(claimsError)

  return {
    deckId: importedDeckId,
    deckName: normalizedDeck.name,
    totalCards,
    matched: claimsCreated,
    unresolved: 0,
    unresolvedCards: [],
    errors,
    lifecycle: isActive ? 'active' : 'brew',
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Hash a Moxfield public ID string into a stable numeric ID.
 * Used for the DeckResolutionResult.deckId field before we have a DB deck ID.
 */
function hashMoxfieldId(publicId: string): number {
  let hash = 0
  for (let i = 0; i < publicId.length; i++) {
    const char = publicId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}
