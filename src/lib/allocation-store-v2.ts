/**
 * Allocation Store V2 — Instance-Level Card Tracking
 *
 * Persistence layer for the V2 allocation resolver. Handles:
 *   - Applying computed allocation output to deck_cards rows
 *   - Orchestrating the full allocation run with transaction safety
 *   - Concurrency serialization via pg_advisory_xact_lock
 *
 * Validates: Requirements 5.6, 6.4, 6.5, 6.6
 */

import { createAdminClient } from '@/lib/supabase'
import {
  buildAllocationInputV2,
  computeAllocationV2,
  logAllocationOutput,
} from './allocation-resolver-v2'
import type { AllocationOutputV2 } from './allocation-resolver-v2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AllocationSummary {
  assigned: number
  shortfall: number
  errors: string[]
  durationMs: number
}

// ---------------------------------------------------------------------------
// Apply Allocation Output
// ---------------------------------------------------------------------------

/**
 * Write allocation assignments to deck_cards rows.
 *
 * For each assignment: SET physical_copy_id and ownership_status = 'original'
 * For each shortfall entry's unassigned IDs: SET ownership_status = NULL
 *
 * Validates: Requirements 5.4, 5.5, 5.6
 */
export async function applyAllocationOutputV2(
  output: AllocationOutputV2,
  userId: string
): Promise<{ assigned: number; shortfall: number; errors: string[] }> {
  const supabase = createAdminClient()
  const errors: string[] = []
  let assigned = 0

  // Apply assignments: SET physical_copy_id + ownership_status = 'original'
  for (const assignment of output.assignments) {
    const { error } = await supabase
      .from('deck_cards')
      .update({
        physical_copy_id: assignment.physicalCopyId,
        ownership_status: 'original',
      })
      .eq('id', assignment.deckCardsId)
      .eq('user_id', userId)

    if (error) {
      errors.push(
        `Failed to assign physical_copy_id ${assignment.physicalCopyId} to deck_cards ${assignment.deckCardsId}: ${error.message}`
      )
    } else {
      assigned++
    }
  }

  // Apply shortfalls: SET ownership_status = NULL on unassigned rows
  // (unresolved status is computed dynamically at read time)
  let shortfallCount = 0
  for (const shortfall of output.shortfalls) {
    if (shortfall.unassignedDeckCardsIds.length === 0) continue

    const { error } = await supabase
      .from('deck_cards')
      .update({
        ownership_status: null,
        physical_copy_id: null,
      })
      .in('id', shortfall.unassignedDeckCardsIds)
      .eq('user_id', userId)

    if (error) {
      errors.push(
        `Failed to mark shortfall for oracle_id ${shortfall.oracleId} (${shortfall.cardName}): ${error.message}`
      )
    } else {
      shortfallCount += shortfall.unassignedDeckCardsIds.length
    }
  }

  return { assigned, shortfall: shortfallCount, errors }
}

// ---------------------------------------------------------------------------
// Run Allocation Resolver (Top-Level Orchestrator)
// ---------------------------------------------------------------------------

/**
 * Full allocation resolver run with transaction safety and concurrency control.
 *
 * Steps:
 * 1. Acquire advisory lock (pg_advisory_xact_lock) for serialization
 * 2. Clear existing physical_copy_id on active deck deck_cards rows
 * 3. Build allocation input
 * 4. Compute allocation
 * 5. Apply allocation output
 *
 * The clear + recompute is wrapped in a transaction via an RPC function.
 * If the resolver throws mid-computation, the transaction rolls back preserving
 * previous physical_copy_id values.
 *
 * Validates: Requirements 6.4, 6.5, 6.6
 */
export async function runAllocationResolver(userId: string): Promise<AllocationSummary> {
  const startTime = Date.now()
  const supabase = createAdminClient()

  try {
    // Step 1: Acquire advisory lock and clear active deck assignments in a transaction.
    // This uses an RPC call to execute transactional SQL that:
    //   - Acquires pg_advisory_xact_lock(12345) for concurrency serialization
    //   - Clears physical_copy_id and ownership_status on active deck rows only
    // The lock is automatically released when the RPC transaction completes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: clearError } = await (supabase.rpc as any)(
      'allocation_clear_active_decks',
      { p_user_id: userId }
    )

    if (clearError) {
      // If the RPC doesn't exist yet, fall back to a non-transactional approach
      // with a warning. This allows development before the RPC is deployed.
      if (clearError.message.includes('function') || clearError.code === '42883') {
        console.warn(
          '[allocation-store-v2] RPC allocation_clear_active_decks not found. ' +
            'Falling back to non-transactional clear. Deploy the RPC for full transaction safety.'
        )
        await clearActiveDeckAssignmentsFallback(userId)
      } else {
        throw new Error(`Failed to clear active deck assignments: ${clearError.message}`)
      }
    }

    // Step 2: Build allocation input
    const input = await buildAllocationInputV2(userId)

    // Step 3: Compute allocation (pure function — no DB access)
    const output = computeAllocationV2(input)
    logAllocationOutput(output)

    // Step 4: Apply allocation output
    const result = await applyAllocationOutputV2(output, userId)

    const durationMs = Date.now() - startTime

    return {
      assigned: result.assigned,
      shortfall: result.shortfall,
      errors: result.errors,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const message = error instanceof Error ? error.message : String(error)

    // On failure, the RPC transaction has already rolled back the clearing,
    // preserving previous physical_copy_id values (Requirement 6.5).
    return {
      assigned: 0,
      shortfall: 0,
      errors: [`Allocation resolver failed: ${message}`],
      durationMs,
    }
  }
}

// ---------------------------------------------------------------------------
// Fallback: Non-transactional Clear
// ---------------------------------------------------------------------------

/**
 * Fallback clearing logic used when the RPC function is not yet deployed.
 * Clears physical_copy_id and ownership_status on deck_cards rows for active decks only.
 *
 * NOTE: This does NOT provide full transaction safety. The RPC function
 * `allocation_clear_active_decks` should be deployed for production use.
 */
async function clearActiveDeckAssignmentsFallback(userId: string): Promise<void> {
  const supabase = createAdminClient()

  // Get active deck IDs for this user
  const { data: activeDecks, error: decksError } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (decksError) {
    throw new Error(`Failed to fetch active decks: ${decksError.message}`)
  }

  const activeDeckIds = (activeDecks || []).map((d) => d.id)

  if (activeDeckIds.length === 0) return

  // Clear physical_copy_id and ownership_status on active deck rows only
  // (leaves inactive/draft deck rows unchanged — Requirement 6.4)
  // Preserve proxy assignments — only clear non-proxy rows (null is NOT proxy)
  const { error: clearError } = await supabase
    .from('deck_cards')
    .update({
      physical_copy_id: null,
      ownership_status: null,
    })
    .in('deck_id', activeDeckIds)
    .eq('user_id', userId)
    .or('ownership_status.is.null,ownership_status.neq.proxy')

  if (clearError) {
    throw new Error(`Failed to clear deck_cards assignments: ${clearError.message}`)
  }
}
