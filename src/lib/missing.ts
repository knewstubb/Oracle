/**
 * Missing Flag — Collection Copy Lifecycle
 *
 * Marks collection copies as "Missing" (lost, damaged, sold, given away).
 * A Missing copy is excluded from all candidate pools and availability counts
 * without deleting the row (preserving history).
 *
 * When a copy is marked Missing:
 *   1. collection.missing = true
 *   2. Any deck_cards row linked to this copy is unlinked (copy_id → null)
 *   3. The affected deck's completeness recomputes automatically on next read
 *
 * When a copy is un-marked (found):
 *   1. collection.missing = false
 *   2. No auto-relink — the copy returns to the Available pool
 *   3. User resolves the vacancy via Picklist if needed
 *
 * Both operations are idempotent — safe to retry.
 */

import { createAdminClient } from '@/lib/supabase'
import { assertAtomicRpcIdList, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'

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
 * Mark a collection copy as Missing. Unlinks any deck_cards row pointing at it.
 *
 * Returns the list of affected deck IDs (decks that lost completeness).
 * Idempotent: calling on an already-missing copy is a no-op that returns
 * empty affectedDeckIds.
 *
 * Uses atomic RPC (mark_copy_missing) to ensure the missing flag and
 * deck_cards unlink happen in a single transaction with advisory lock.
 */
export async function markCopyMissing(
  copyId: number,
  userId: string
): Promise<MarkMissingResult> {
  const supabase = createAdminClient()

  const { data, error } = await (supabase.rpc as any)('mark_copy_missing', {
    p_copy_id: copyId,
    p_user_id: userId,
  })

  if (error) {
    if (error.message?.includes('not_found')) {
      throw new Error(`Copy ${copyId} not found for user`)
    }
    throw new Error(`Failed to mark copy ${copyId} as missing: ${error.message}`)
  }

  const result = assertAtomicRpcSuccess(data, 'mark_copy_missing')
  const affectedDeckIds = assertAtomicRpcIdList(
    result,
    'affected_deck_ids',
    'mark_copy_missing'
  )
  return { affectedDeckIds }
}

// ---------------------------------------------------------------------------
// Un-mark (Mark as Found)
// ---------------------------------------------------------------------------

/**
 * Un-mark a collection copy as Missing (mark it as found).
 * The atomic RPC restores the copy to the user's default storage location;
 * it never leaves a found copy in neither storage nor a deck slot.
 *
 * Returns the card name for cache invalidation (so the client knows which
 * card's availability changed).
 * Idempotent: calling on a non-missing copy is a no-op.
 */
export async function unmarkCopyMissing(
  copyId: number,
  userId: string
): Promise<UnmarkMissingResult> {
  const supabase = createAdminClient()

  const { data, error } = await (supabase.rpc as any)('unmark_copy_missing', {
    p_copy_id: copyId,
    p_user_id: userId,
  })

  if (error) {
    if (error.message?.includes('not_found')) {
      throw new Error(`Copy ${copyId} not found for user`)
    }
    throw new Error(`Failed to un-mark copy ${copyId}: ${error.message}`)
  }

  const result = assertAtomicRpcSuccess(data, 'unmark_copy_missing')
  if (typeof result.card_name !== 'string') {
    throw new Error(`Failed to un-mark copy ${copyId}: invalid card_name`)
  }

  return { cardName: result.card_name }
}
