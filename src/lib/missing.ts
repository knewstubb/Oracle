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
 *
 * Uses atomic RPC (mark_copy_missing) to ensure the missing flag and
 * deck_cards unlink happen in a single transaction with advisory lock.
 */
export async function markCopyMissing(
  physicalCopyId: number,
  userId: string
): Promise<MarkMissingResult> {
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('mark_copy_missing', {
    p_physical_copy_id: physicalCopyId,
    p_user_id: userId,
  })

  if (error) {
    if (error.message?.includes('not_found')) {
      throw new Error(`Physical copy ${physicalCopyId} not found for user`)
    }
    throw new Error(`Failed to mark physical copy ${physicalCopyId} as missing: ${error.message}`)
  }

  const result = data as { success: boolean; affected_deck_ids: number[] | null }
  return { affectedDeckIds: result.affected_deck_ids ?? [] }
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
