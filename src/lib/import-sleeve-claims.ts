/**
 * Import Sleeve Claims — initial-import reconciliation
 *
 * When an Active deck is imported, every non-basic main-deck slot asserts a
 * physical "sleeved" intent for its exact printing. Because the user may own
 * fewer copies of a printing than the number of Active decks that list it,
 * we cannot assign the same `user_copies` row to multiple `deck_cards.copy_id`
 * slots (that breaks the one-copy-one-slot invariant).
 *
 * Instead we record a durable, provisional CLAIM per slot. Claims may overlap
 * on a printing. A finalization pass then assigns real copies to claims for any
 * printing where supply is sufficient (clearing those claims), leaving only the
 * genuinely over-committed printings as open conflicts for the user to resolve.
 *
 * See `.kiro/specs/deck-import-conflicts/design.md`.
 */

import { createAdminClient } from '@/lib/supabase'
import { isBasicLand } from '@/lib/basic-lands'

/**
 * Create sleeve claims for all non-basic main-deck slots of an imported Active
 * deck, then run the finalization pass so any printing with sufficient supply
 * is immediately assigned real copies (and its claims cleared).
 *
 * Basic lands are excluded (they are generic/untracked and never contended).
 * Slots without a scryfall_id (no specific printing) are excluded — an exact
 * printing is required to reason about printing-keyed conflicts.
 */
export async function createSleeveClaimsForDeck(
  deckId: number,
  userId: string
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
    }))

  if (claimRows.length === 0) {
    return { claimsCreated: 0 }
  }

  // Insert claims only. Nothing is sleeved during import — claims are the
  // single source of truth during reconciliation so every deck keeps equal,
  // editable footing. Real copies are assigned by finalizeImportClaims() when
  // the user finishes (Go to Decks). UNIQUE(deck_cards_id) is idempotent.
  const { error: insertErr } = await supabase
    .from('import_sleeve_claims')
    .upsert(claimRows, { onConflict: 'deck_cards_id' })

  if (insertErr) {
    return { claimsCreated: 0, error: `Failed to create sleeve claims: ${insertErr.message}` }
  }

  return { claimsCreated: claimRows.length }
}

/**
 * Finalize all balanced cards: for every card where owned real copies cover the
 * sleeved demand, assign distinct owned copies to the claimed slots (retagging
 * printing to the owned copy) and clear those claims. Over-allocated cards keep
 * their claims. Called when the user finishes the import (Go to Decks).
 */
export async function finalizeImportClaims(userId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.rpc('finalize_import_claims', { p_user_id: userId })
  if (error) throw new Error(`finalize_import_claims failed: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Conflict querying + resolution wrappers
// ---------------------------------------------------------------------------

export interface ImportConflictDeckRef {
  deckId: number
  deckName: string
  source: 'claim' | 'sleeved'
  /** The claim to Release/Convert; null for already-finalized real sleeves. */
  claimId: number | null
  deckCardsId: number
}

export interface ImportAllocation {
  cardName: string
  owned: number
  sleeved: number
  /** True when sleeved demand exceeds owned copies (a genuine conflict). */
  overAllocated: boolean
  decks: ImportConflictDeckRef[]
}

/**
 * Read the user's full import allocation view: every card with open sleeve
 * claims, whether over-allocated or balanced. Balanced cards remain editable
 * (all decks show Release/Proxy) — no deck is pre-assigned the real copy.
 */
export async function getImportAllocations(userId: string): Promise<ImportAllocation[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_import_allocations', {
    p_user_id: userId,
  })
  if (error) throw new Error(`get_import_allocations failed: ${error.message}`)
  const payload = data as { success?: boolean; allocations?: ImportAllocation[] } | null
  return payload?.allocations ?? []
}

/** Release an excess sleeve claim — slot stays Planned. */
export async function releaseSleeveClaim(userId: string, claimId: number): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.rpc('resolve_import_conflict_release', {
    p_user_id: userId,
    p_claim_id: claimId,
  })
  if (error) throw new Error(`resolve_import_conflict_release failed: ${error.message}`)
}

/** Convert an excess sleeve claim to a printing-matched proxy copy. */
export async function proxySleeveClaim(userId: string, claimId: number): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.rpc('resolve_import_conflict_proxy', {
    p_user_id: userId,
    p_claim_id: claimId,
  })
  if (error) throw new Error(`resolve_import_conflict_proxy failed: ${error.message}`)
}
