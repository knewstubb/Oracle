/**
 * Warm-Start Batch Resolution — Moxfield Variant
 *
 * Same sequential resolve pattern as the Archidekt version but uses:
 * - fetchMoxfieldDeck (string public IDs)
 * - normalizeMoxfieldDeck
 *
 * Processes decks sequentially so each deck sees the previous deck's committed results.
 */

import { createAdminClient } from '@/lib/supabase'
import { fetchMoxfieldDeck } from '@/lib/moxfield-client'
import { importDeckExistingCollection } from '@/lib/deck-import'
import { normalizeMoxfieldDeck } from '@/lib/deck-normalizer'
import { fetchEnrichedSupply, classifyTier, scoreCandidate } from '@/lib/allocation-candidates'
import type { EnrichedSupplyEntry } from '@/lib/allocation-candidates'
import type { BatchResolutionResult, DeckResolutionResult, ContentionEntry } from '@/lib/warm-start-resolve'

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Resolve a batch of Moxfield decks sequentially against the shared supply pool.
 *
 * For each deck:
 * 1. Fetch full deck data from Moxfield (fetchMoxfieldDeck)
 * 2. Normalize and import the deck (creates deck + deck_cards rows with status 'boxed')
 * 3. For each unresolved deck_cards row, find candidates via fetchEnrichedSupply
 * 4. Assign from Tiers 1–3 only
 * 5. Anything that would need Tier 4 or higher → left unresolved
 */
export async function resolveMoxfieldDeckBatch(
  publicIds: string[],
  userId: string,
  deckStatuses?: Record<string, 'brew' | 'boxed'>
): Promise<BatchResolutionResult> {
  const startTime = Date.now()
  const results: DeckResolutionResult[] = []
  let totalMatched = 0
  let totalUnresolved = 0

  for (const publicId of publicIds) {
    const status = deckStatuses?.[publicId] ?? 'boxed'
    const result = await resolveSingleMoxfieldDeck(publicId, userId, status)
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
  deckStatus: 'brew' | 'boxed' = 'boxed'
): Promise<DeckResolutionResult> {
  const errors: string[] = []
  const supabase = createAdminClient()

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

  // Step 3: Import the deck (creates deck + deck_cards rows with status 'boxed')
  let importedDeckId: number
  try {
    const importResult = await importDeckExistingCollection(normalizedDeck, userId, { status: deckStatus, skipAutoAssign: true })
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

  // Step 4: Fetch all unresolved deck_cards for this newly imported deck
  const { data: unresolvedRows, error: fetchErr } = await supabase
    .from('deck_cards')
    .select('id, card_name')
    .eq('deck_id', importedDeckId)
    .is('physical_copy_id', null)

  if (fetchErr) {
    errors.push(`Failed to fetch unresolved deck_cards: ${fetchErr.message}`)
    return {
      deckId: importedDeckId,
      deckName: normalizedDeck.name,
      totalCards: normalizedDeck.cardCount || 0,
      matched: 0,
      unresolved: 0,
      unresolvedCards: [],
      errors,
    }
  }

  const totalCards = normalizedDeck.cardCount || 0
  if (!unresolvedRows || unresolvedRows.length === 0) {
    return {
      deckId: importedDeckId,
      deckName: normalizedDeck.name,
      totalCards,
      matched: totalCards,
      unresolved: 0,
      unresolvedCards: [],
      errors,
    }
  }

  // Step 5: Group unresolved cards by name
  const cardNameGroups = new Map<string, number[]>()
  for (const row of unresolvedRows) {
    const existing = cardNameGroups.get(row.card_name)
    if (existing) existing.push(row.id)
    else cardNameGroups.set(row.card_name, [row.id])
  }

  // Step 6: For each unique card_name, fetch candidates and assign Tiers 1–3
  let matched = 0
  const unresolvedCards: string[] = []

  for (const [cardName, deckCardsIds] of cardNameGroups) {
    let candidates: EnrichedSupplyEntry[]
    try {
      candidates = await fetchEnrichedSupply(cardName, userId)
    } catch (err) {
      errors.push(`Failed to fetch candidates for "${cardName}": ${err instanceof Error ? err.message : String(err)}`)
      unresolvedCards.push(cardName)
      continue
    }

    const eligibleCandidates = candidates
      .filter(c => {
        const tier = classifyTier(c)
        return tier === 1 || tier === 2 || tier === 3
      })
      .sort((a, b) => {
        const tierA = classifyTier(a)
        const tierB = classifyTier(b)
        if (tierA !== tierB) return tierA - tierB
        return scoreCandidate(b, null) - scoreCandidate(a, null)
      })

    let candidateIdx = 0

    for (const deckCardsId of deckCardsIds) {
      if (candidateIdx >= eligibleCandidates.length) break

      const candidate = eligibleCandidates[candidateIdx]
      candidateIdx++

      const ownershipStatus = candidate.isProxy ? 'proxy' : 'original'

      // If Tier 3, clear the source assignment first
      if (candidate.assignedTo) {
        const { error: clearErr } = await supabase
          .from('deck_cards')
          .update({ physical_copy_id: null, ownership_status: null })
          .eq('id', candidate.assignedTo.deckCardsId)

        if (clearErr) {
          errors.push(`Failed to clear source assignment for "${cardName}": ${clearErr.message}`)
          continue
        }
      }

      // Assign to the target deck_cards row
      const { error: assignErr } = await supabase
        .from('deck_cards')
        .update({
          physical_copy_id: candidate.physicalCopyId,
          ownership_status: ownershipStatus,
        })
        .eq('id', deckCardsId)

      if (assignErr) {
        errors.push(`Failed to assign "${cardName}" (deck_cards ${deckCardsId}): ${assignErr.message}`)
      } else {
        matched++
      }
    }

    const resolvedForThisCard = Math.min(candidateIdx, deckCardsIds.length)
    if (resolvedForThisCard < deckCardsIds.length) {
      unresolvedCards.push(cardName)
    }
  }

  const unresolved = unresolvedRows.length - matched

  return {
    deckId: importedDeckId,
    deckName: normalizedDeck.name,
    totalCards,
    matched,
    unresolved,
    unresolvedCards,
    errors,
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
