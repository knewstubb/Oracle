/**
 * Missing Flag — Physical Copy Lifecycle
 *
 * Marks physical copies as "Missing" (lost, damaged, sold, given away).
 * A Missing copy is excluded from all candidate pools and availability counts
 * without deleting the row (preserving history).
 *
 * When a copy is marked Missing:
 *   1. physical_copies.missing = true
 *   2. Any deck_cards row linked to this copy is unlinked (physical_copy_id → null)
 *   3. The affected deck's completeness recomputes automatically on next read
 *
 * When a copy is un-marked (found):
 *   1. physical_copies.missing = false
 *   2. No auto-relink — the copy returns to the Available pool
 *   3. User resolves the vacancy via Picklist if needed
 *
 * Both operations are idempotent — safe to retry.
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarkMissingResult {
  /** Deck IDs that lost a card due to this copy being marked Missing */
  affectedDeckIds: number[]
}

export interface UnmarkMissingResult {
  /** Card name of the copy that was un-marked (for cache invalidation) */
  cardName: string | null
}

// ---------------------------------------------------------------------------
// Mark as Missing
// ---------------------------------------------------------------------------

/**
 * Mark a physical copy as Missing. Unlinks any deck_cards row pointing at it.
 *
 * Returns the list of affected deck IDs (decks that lost completeness).
 * Idempotent: calling on an already-missing copy is a no-op that returns
 * empty affectedDeckIds.
 */
export async function markCopyMissing(
  physicalCopyId: number,
  userId: string
): Promise<MarkMissingResult> {
  const supabase = createAdminClient()

  // 1. Set missing = true
  const { error: updateErr } = await supabase
    .from('physical_copies')
    .update({ missing: true })
    .eq('id', physicalCopyId)
    .eq('user_id', userId)

  if (updateErr) {
    throw new Error(`Failed to mark physical copy ${physicalCopyId} as missing: ${updateErr.message}`)
  }

  // 2. Find and unlink any deck_cards rows pointing at this copy
  const { data: linkedRows, error: findErr } = await supabase
    .from('deck_cards')
    .select('id, deck_id')
    .eq('physical_copy_id', physicalCopyId)

  if (findErr) {
    throw new Error(`Failed to find linked deck_cards for copy ${physicalCopyId}: ${findErr.message}`)
  }

  const affectedDeckIds: number[] = []

  if (linkedRows && linkedRows.length > 0) {
    // Unlink: set physical_copy_id and ownership_status to NULL
    const { error: unlinkErr } = await supabase
      .from('deck_cards')
      .update({ physical_copy_id: null, ownership_status: null })
      .eq('physical_copy_id', physicalCopyId)

    if (unlinkErr) {
      throw new Error(`Failed to unlink deck_cards for copy ${physicalCopyId}: ${unlinkErr.message}`)
    }

    // Collect unique affected deck IDs
    const deckIdSet = new Set(linkedRows.map(r => r.deck_id))
    affectedDeckIds.push(...deckIdSet)
  }

  return { affectedDeckIds }
}

// ---------------------------------------------------------------------------
// Un-mark (Mark as Found)
// ---------------------------------------------------------------------------

/**
 * Un-mark a physical copy as Missing (mark it as found).
 * The copy returns to the Available pool — no auto-relink to prior deck slot.
 *
 * Returns the card name for cache invalidation (so the client knows which
 * card's availability changed).
 * Idempotent: calling on a non-missing copy is a no-op.
 */
export async function unmarkCopyMissing(
  physicalCopyId: number,
  userId: string
): Promise<UnmarkMissingResult> {
  const supabase = createAdminClient()

  // Fetch the card name before updating (for the response)
  const { data: copy, error: fetchErr } = await supabase
    .from('physical_copies')
    .select('card_definition_id, card_definitions!physical_copies_card_definition_id_fkey(card_name)')
    .eq('id', physicalCopyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (fetchErr) {
    throw new Error(`Failed to fetch physical copy ${physicalCopyId}: ${fetchErr.message}`)
  }

  if (!copy) {
    return { cardName: null }
  }

  // Set missing = false
  const { error: updateErr } = await supabase
    .from('physical_copies')
    .update({ missing: false })
    .eq('id', physicalCopyId)
    .eq('user_id', userId)

  if (updateErr) {
    throw new Error(`Failed to un-mark physical copy ${physicalCopyId}: ${updateErr.message}`)
  }

  const cardName = (copy as any).card_definitions?.card_name ?? null

  return { cardName }
}
