/**
 * Import Reconciliation — small client-side helpers.
 *
 * All domain state is server-side per the T-22 contract. This module only
 * contains presentation helpers that operate on the contract view.
 */

import { createAdminClient } from '@/lib/supabase'
import {
  INSTANCE_STATES,
  LEGACY_STATE_MAP,
  RECONCILIATION_ERROR_STATUS,
  type ConflictPrintingRow,
  type InstanceState,
  type ReconciliationView,
  type ReconciliationErrorToken,
} from '@/types/import-reconciliation'

/** A row is unresolved if it is not fully resolved. */
export function isRowUnresolved(row: ConflictPrintingRow): boolean {
  return !row.resolved
}

/** Groups rows by ownership for the Owned/Unowned tabs. */
export function partitionRowsByOwnership(rows: ConflictPrintingRow[]) {
  const owned: ConflictPrintingRow[] = []
  const unowned: ConflictPrintingRow[] = []
  for (const row of rows) {
    if (row.ownership === 'owned') owned.push(row)
    else unowned.push(row)
  }
  return { owned, unowned }
}

/** Maps a legacy/old resolution to the canonical instance state. */
export function normalizeInstanceState(value: string | null | undefined): InstanceState {
  if (value === 'sleeved' || value === 'sleeve') return 'sleeved'
  if (value === 'proxy') return 'proxy'
  return 'planned'
}

/** Summarise a view for quick stats when counts are not yet loaded. */
export function countRowsFromView(view: ReconciliationView | null): {
  unresolvedTotal: number
  unresolvedOwned: number
  unresolvedUnowned: number
  rowsTotal: number
} {
  if (!view) {
    return { unresolvedTotal: 0, unresolvedOwned: 0, unresolvedUnowned: 0, rowsTotal: 0 }
  }
  return {
    unresolvedTotal: view.counts.unresolvedTotal,
    unresolvedOwned: view.counts.unresolvedOwned,
    unresolvedUnowned: view.counts.unresolvedUnowned,
    rowsTotal: view.counts.rowsTotal,
  }
}

// ---------------------------------------------------------------------------
// Server RPC wrappers (T-22)
// ---------------------------------------------------------------------------

/** Map a stable RPC error token to the HTTP status the route should return. */
export function mapReconciliationError(err: unknown): {
  status: number
  token?: ReconciliationErrorToken
  message: string
} {
  const message = err instanceof Error ? err.message : String(err)
  const token = (Object.keys(RECONCILIATION_ERROR_STATUS) as ReconciliationErrorToken[]).find(
    (t) => message === t || message.startsWith(`${t}:`)
  )
  if (token) {
    return { status: RECONCILIATION_ERROR_STATUS[token], token, message }
  }
  return { status: 500, message }
}

interface GetImportReconciliationPayload {
  success: boolean
  batchId: string | null
  counts: ReconciliationView['counts']
  decks: ReconciliationView['decks']
  rows: ReconciliationView['rows']
}

/**
 * Read the whole reconciliation view for a batch.
 * `includeResolved: false` is the reload default and omits resolved rows.
 */
export async function getImportReconciliation(
  userId: string,
  options: { batchId?: string | null; includeResolved?: boolean } = {}
): Promise<ReconciliationView> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_import_reconciliation', {
    p_user_id: userId,
    p_batch_id: options.batchId ?? undefined,
    p_include_resolved: options.includeResolved ?? false,
  })
  if (error) {
    throw new Error(error.message)
  }
  const payload = data as GetImportReconciliationPayload | null
  if (!payload?.success) {
    throw new Error('get_import_reconciliation returned an unsuccessful payload')
  }
  return {
    batchId: payload.batchId,
    counts: payload.counts,
    decks: payload.decks,
    rows: payload.rows,
  }
}

/** Set one instance's state. Fail-closed on supply for `sleeved`. */
export async function setClaimState(
  userId: string,
  claimId: number,
  state: InstanceState
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.rpc('set_import_claim_state', {
    p_user_id: userId,
    p_claim_id: claimId,
    p_state: state,
  })
  if (error) {
    throw new Error(error.message)
  }
}

interface SetClaimPrintingPayload {
  success: boolean
  demoted?: boolean
}

/**
 * Set or clear one instance's alternate printing.
 * Returns `demoted: true` when a `sleeved` instance had to drop to `planned`
 * because the newly selected printing has no room.
 */
export async function setClaimPrinting(
  userId: string,
  claimId: number,
  printingId: string | null
): Promise<{ demoted: boolean }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('set_import_claim_printing', {
    p_user_id: userId,
    p_claim_id: claimId,
    p_printing_id: printingId ?? undefined,
  })
  if (error) {
    throw new Error(error.message)
  }
  const payload = data as SetClaimPrintingPayload | null
  if (!payload?.success) {
    throw new Error('set_import_claim_printing returned an unsuccessful payload')
  }
  return { demoted: !!payload.demoted }
}

/** Set one instance's wishlist toggle. Affects no count or resolution. */
export async function setClaimWishlist(
  userId: string,
  claimId: number,
  wishlisted: boolean
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.rpc('set_import_claim_wishlist', {
    p_user_id: userId,
    p_claim_id: claimId,
    p_wishlisted: wishlisted,
  })
  if (error) {
    throw new Error(error.message)
  }
}
