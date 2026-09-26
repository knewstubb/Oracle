/**
 * Import Sleeve Claims — initial-import reconciliation
 *
 * When an Active deck is imported, every non-basic main-deck slot asserts a
 * physical "sleeved" intent for its exact printing. Because the user may own
 * fewer copies of a printing than the number of Active decks that list it,
 * we cannot assign the same `user_copies` row to multiple `deck_cards.copy_id`
 * slots (that breaks the one-copy-one-slot invariant).
 *
 * Instead we record a durable, provisional CLAIM per slot, grouped by the
 * import run's batch id. Claims may overlap on a printing. During
 * reconciliation a claim carries an INTENT (`resolution`): 'sleeve' (default),
 * 'release' (slot stays Planned) or 'proxy' (printing-matched proxy). Changing
 * intent is instant and reversible; nothing physical is touched. A single
 * finalization pass on "Go to Decks" materializes the decisions for cards fully
 * within supply, and settles (stamps `settled_at` on) claims the run leaves
 * unresolved — the durable record behind the cross-page conflict badge.
 *
 * See `.kiro/specs/deck-import-conflicts/design.md`.
 */

import { createAdminClient } from '@/lib/supabase'
import { isBasicLand } from '@/lib/basic-lands'
import type { ImportAllocationState } from '@/lib/import-allocation-state'

/** The three-way per-deck intent. 'sleeve' is the default and re-introduces
 *  demand; 'release' and 'proxy' remove the deck from the supply competition. */
export type ClaimResolution = 'sleeve' | 'release' | 'proxy'

/**
 * Create sleeve claims for all non-basic main-deck slots of an imported Active
 * deck. Nothing is sleeved during import — claims are the single source of
 * truth during reconciliation so every deck keeps equal, editable footing. Real
 * copies are assigned by finalizeImportClaims() when the user finishes (Go to
 * Decks). UNIQUE(deck_cards_id) makes re-runs idempotent.
 *
 * Basic lands are excluded (they are generic/untracked and never contended).
 * Slots without a scryfall_id (no specific printing) are excluded — an exact
 * printing is required to reason about printing-keyed conflicts.
 */
export async function createSleeveClaimsForDeck(
  deckId: number,
  userId: string,
  batchId?: string | null
): Promise<{ claimsCreated: number; error?: string }> {
  const supabase = createAdminClient()

  // Fetch the deck's slots. We claim every non-basic slot that has an exact
  // printing, regardless of whether a copy_id was already assigned during
  // import — the finalization pass is the single authority on real assignment.
  const { data: rows, error: fetchErr } = await supabase
    .from('deck_cards')
    .select('id, card_name, scryfall_id, is_commander')
    .eq('deck_id', deckId)
    .eq('user_id', userId)

  if (fetchErr) {
    return { claimsCreated: 0, error: `Failed to read deck slots: ${fetchErr.message}` }
  }
  if (!rows || rows.length === 0) {
    return { claimsCreated: 0 }
  }

  const claimRows = rows
    .filter((r) => !isBasicLand(r.card_name))
    .filter((r) => r.scryfall_id != null && String(r.scryfall_id).trim() !== '')
    .map((r) => ({
      user_id: userId,
      deck_id: deckId,
      deck_cards_id: r.id,
      card_name: r.card_name,
      printing_id: r.scryfall_id,
      // Scope the claim to its import run so reconciliation and finalize only
      // ever see the current batch. A reset upsert keeps the fresh intent.
      // T-22 default state is 'planned' — the user chooses sleeve/proxy explicitly.
      batch_id: batchId ?? null,
      resolution: 'planned' as const,
      settled_at: null,
    }))

  if (claimRows.length === 0) {
    return { claimsCreated: 0 }
  }

  // Upsert on deck_cards_id so a re-imported slot replaces any stale claim
  // (e.g. one left settled by an earlier run) instead of colliding.
  const { error: insertErr } = await supabase
    .from('import_sleeve_claims')
    .upsert(claimRows, { onConflict: 'deck_cards_id' })

  if (insertErr) {
    return { claimsCreated: 0, error: `Failed to create sleeve claims: ${insertErr.message}` }
  }

  return { claimsCreated: claimRows.length }
}

/**
 * The single materializer, run on "Allocate Cards". Applies each instance's
 * decision independently: 'sleeved' assigns a distinct owned copy of the
 * effective printing, 'proxy' reuses or creates a printing-matched proxy, and
 * 'planned' keeps the claim and stamps settled_at. Unsatisfiable 'sleeved'
 * instances are settled rather than discarded (T-22 per-instance
 * materialisation).
 *
 * Scoped to p_batch_id when provided, so a run can never materialize another
 * run's leftover claims.
 */
export interface FinalizeResult {
  finalizedCount: number
  proxiedCount: number
  releasedCount: number
  leftOpenCount: number
  /** T-22: claims stamped settled_at during this pass. */
  settledCount: number
}

export async function finalizeImportClaims(
  userId: string,
  batchId?: string | null
): Promise<FinalizeResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('finalize_import_claims', {
    p_user_id: userId,
    p_batch_id: batchId ?? undefined,
  })
  if (error) throw new Error(`finalize_import_claims failed: ${error.message}`)

  const payload = data as
    | {
        success?: boolean
        finalized_count?: number
        proxied_count?: number
        released_count?: number
        left_open_count?: number
        settled_count?: number
      }
    | null
  const finalizedCount = payload?.finalized_count
  if (typeof finalizedCount !== 'number') {
    throw new Error('finalize_import_claims returned an invalid finalized_count')
  }
  return {
    finalizedCount,
    proxiedCount: payload?.proxied_count ?? 0,
    releasedCount: payload?.released_count ?? 0,
    leftOpenCount: payload?.left_open_count ?? 0,
    settledCount: payload?.settled_count ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Allocation querying + resolution
// ---------------------------------------------------------------------------

export interface ImportConflictDeckRef {
  deckId: number
  deckName: string
  source: 'claim' | 'sleeved'
  /** The claim whose intent can be changed; null for already-finalized real sleeves. */
  claimId: number | null
  deckCardsId: number
  /** Recorded intent for claim rows; 'sleeve' for finalized physical sleeves. */
  resolution?: ClaimResolution
}

export interface ImportAllocation {
  cardName: string
  owned: number
  /** Slots demanding a REAL copy: sleeve-intent claims + finalized real sleeves. */
  sleeved: number
  /** True when real-copy demand exceeds owned copies (a genuine conflict). */
  overAllocated: boolean
  /**
   * Server-derived state: 'over' | 'unowned' | 'resolved'. Absent on payloads
   * from an older database — use `resolveAllocationState()` from
   * `@/lib/import-allocation-state` rather than reading `overAllocated` directly.
   */
  state?: ImportAllocationState
  /** Slots with a recorded non-sleeve decision; drives list visibility. */
  decidedCount?: number
  decks: ImportConflictDeckRef[]
}

/**
 * Read the import allocation view for one batch: every card with claims in that
 * batch (or, with no batch id, every unsettled claim), with per-deck intents.
 * The client decides visibility via `shouldDisplayAllocation()`.
 */
export async function getImportAllocations(
  userId: string,
  batchId?: string | null
): Promise<ImportAllocation[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_import_allocations', {
    p_user_id: userId,
    p_batch_id: batchId ?? undefined,
  })
  if (error) throw new Error(`get_import_allocations failed: ${error.message}`)
  const payload = data as { success?: boolean; allocations?: ImportAllocation[] } | null
  return payload?.allocations ?? []
}

/**
 * Record (or change) a deck's intent for one claimed card. Pure intent write —
 * nothing physical is touched, so Sleeve ↔ Release ↔ Proxy stay freely
 * reversible until the finalize pass runs.
 */
export async function setClaimResolution(
  userId: string,
  claimId: number,
  resolution: ClaimResolution
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.rpc('set_import_claim_resolution', {
    p_user_id: userId,
    p_claim_id: claimId,
    p_resolution: resolution,
  })
  if (error) throw new Error(`set_import_claim_resolution failed: ${error.message}`)
}
