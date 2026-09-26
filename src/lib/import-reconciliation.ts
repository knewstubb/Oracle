/**
 * Import Reconciliation — small client-side helpers.
 *
 * All domain state is server-side per the T-22 contract. This module only
 * contains presentation helpers that operate on the contract view.
 */

import type {
  ConflictPrintingRow,
  ReconciliationView,
  InstanceState,
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
