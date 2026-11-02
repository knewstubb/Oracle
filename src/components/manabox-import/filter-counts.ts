/**
 * Counts on the review's filter chips. They count cards (copies), the same unit as the
 * summary: a precon of 100 cards in 87 different printings says "All 100", not "All 87".
 */
import type { ImportCopyType } from '../../../docs/oracle/contracts/import-row-editing.types'

interface CountRow {
  rowKey: string
  qty: number
}

export interface FilterChipCounts {
  /** Every card (copies), not rows. */
  all: number
  proxy: number
  unsleeved: number
  basic: number
  /** Distinct printings (rows). Shown secondarily, only when it differs from `all`. */
  printings: number
}

export function filterChipCounts(
  rows: CountRow[],
  resolvedByKey: Map<string, Array<{ type: ImportCopyType }>>,
  isBasic: (row: never) => boolean
): FilterChipCounts {
  const counts: FilterChipCounts = { all: 0, proxy: 0, unsleeved: 0, basic: 0, printings: rows.length }
  for (const row of rows) {
    counts.all += row.qty
    if (isBasic(row as never)) counts.basic += row.qty
    for (const copy of resolvedByKey.get(row.rowKey) ?? []) {
      if (copy.type === 'proxy') counts.proxy++
      else if (copy.type === 'unsleeved') counts.unsleeved++
    }
  }
  return counts
}
