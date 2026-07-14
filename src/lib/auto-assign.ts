/**
 * Auto-Assign from Storage (Section 6e)
 *
 * Assigns unresolved deck_cards rows to free Tier 1–2 physical copies only.
 * NEVER reaches into another deck's deck_cards (no Tier 3/4).
 * NEVER creates new proxies (no Tier 5).
 * NEVER needs a confirmation dialog.
 *
 * Scoped to a single deck's unresolved rows.
 * Works incrementally — does not clear existing assignments.
 *
 * Returns a summary of what was auto-assigned.
 */

import { createAdminClient } from '@/lib/supabase'
import { fetchEnrichedSupply, classifyTier, scoreCandidate } from '@/lib/allocation-candidates'
import type { EnrichedSupplyEntry } from '@/lib/allocation-candidates'
import { isBasicLand } from '@/lib/basic-lands'

export interface AutoAssignResult {
  assigned: number
  skipped: number
  errors: string[]
  assignments: Array<{
    deckCardsId: number
    cardName: string
    physicalCopyId: number
    tier: 1 | 2
  }>
}

/**
 * Run auto-assign for a single deck's unresolved card slots.
 * Only claims from free storage (Tier 1–2). Incremental — never clears existing.
 */
export async function autoAssignDeck(
  deckId: number,
  userId: string
): Promise<AutoAssignResult> {
  const supabase = createAdminClient()
  const result: AutoAssignResult = { assigned: 0, skipped: 0, errors: [], assignments: [] }

  // 1. Fetch unresolved deck_cards for this deck
  const { data: unresolvedRows, error: fetchErr } = await supabase
    .from('deck_cards')
    .select('id, card_name')
    .eq('deck_id', deckId)
    .is('physical_copy_id', null)

  if (fetchErr) {
    result.errors.push(`Failed to fetch unresolved deck_cards: ${fetchErr.message}`)
    return result
  }

  if (!unresolvedRows || unresolvedRows.length === 0) return result

  // 2. Deduplicate card names for candidate lookup
  const cardNameGroups = new Map<string, number[]>() // card_name → [deckCardsId, ...]
  for (const row of unresolvedRows) {
    const existing = cardNameGroups.get(row.card_name)
    if (existing) existing.push(row.id)
    else cardNameGroups.set(row.card_name, [row.id])
  }

  // 3. For each unique card_name, fetch candidates and assign Tier 1–2 only
  for (const [cardName, deckCardsIds] of cardNameGroups) {
    // Skip basic lands — they're generic by default, no resolution needed (Chunk 11)
    if (isBasicLand(cardName)) {
      continue
    }

    let candidates: EnrichedSupplyEntry[]
    try {
      candidates = await fetchEnrichedSupply(cardName, userId)
    } catch (err) {
      result.errors.push(`Failed to fetch candidates for "${cardName}": ${err instanceof Error ? err.message : String(err)}`)
      result.skipped += deckCardsIds.length
      continue
    }

    // Filter to Tier 1–2 only (free, unallocated copies in storage)
    const freeCandidates = candidates
      .filter(c => {
        const tier = classifyTier(c)
        return tier === 1 || tier === 2
      })
      .sort((a, b) => {
        // Tier 1 before Tier 2
        const tierA = classifyTier(a)
        const tierB = classifyTier(b)
        if (tierA !== tierB) return tierA - tierB
        // Within tier, use scoreCandidate (higher = better)
        return scoreCandidate(b, null) - scoreCandidate(a, null)
      })

    // Assign one candidate per deck_cards row (first-come basis)
    let candidateIdx = 0
    for (const deckCardsId of deckCardsIds) {
      if (candidateIdx >= freeCandidates.length) {
        result.skipped++
        continue
      }

      const candidate = freeCandidates[candidateIdx]
      candidateIdx++

      // Determine ownership_status
      const ownershipStatus = candidate.isProxy ? 'proxy' : 'original'

      // Atomic write — set physical_copy_id on the deck_cards row
      const { error: assignErr } = await supabase
        .from('deck_cards')
        .update({
          physical_copy_id: candidate.physicalCopyId,
          ownership_status: ownershipStatus,
        })
        .eq('id', deckCardsId)

      if (assignErr) {
        result.errors.push(`Failed to assign ${cardName} (deck_cards ${deckCardsId}): ${assignErr.message}`)
        result.skipped++
      } else {
        result.assigned++
        result.assignments.push({
          deckCardsId,
          cardName,
          physicalCopyId: candidate.physicalCopyId,
          tier: classifyTier(candidate) as 1 | 2,
        })
      }
    }
  }

  return result
}

/**
 * Run auto-assign across ALL Brew-status decks for a user.
 * Only claims from free storage (Tier 1–2). Never clears existing.
 */
export async function autoAssignAllBrewDecks(
  userId: string
): Promise<{ decksProcessed: number; totalAssigned: number; totalSkipped: number; errors: string[] }> {
  const supabase = createAdminClient()

  // Get all Brew-status deck IDs for this user
  const { data: brewDecks, error: deckErr } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'brew')

  if (deckErr) {
    return { decksProcessed: 0, totalAssigned: 0, totalSkipped: 0, errors: [`Failed to fetch brew decks: ${deckErr.message}`] }
  }

  if (!brewDecks || brewDecks.length === 0) {
    return { decksProcessed: 0, totalAssigned: 0, totalSkipped: 0, errors: [] }
  }

  let totalAssigned = 0
  let totalSkipped = 0
  const errors: string[] = []

  for (const deck of brewDecks) {
    const result = await autoAssignDeck(deck.id, userId)
    totalAssigned += result.assigned
    totalSkipped += result.skipped
    errors.push(...result.errors)
  }

  return { decksProcessed: brewDecks.length, totalAssigned, totalSkipped, errors }
}
