'use client'

import { useState, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Tri-state for rollup-level checkbox:
 * - 'checked' → all instances for an oracle_id are selected
 * - 'indeterminate' → some (but not all) instances are selected
 * - 'unchecked' → no instances are selected
 */
export type TriState = 'checked' | 'indeterminate' | 'unchecked'

export interface SelectionState {
  /** oracle_id → Set<physical_copy_id> */
  selected: Map<string, Set<number>>
}

// ---------------------------------------------------------------------------
// Hook: useSelectionModel
// ---------------------------------------------------------------------------

/**
 * Pure React hook for managing instance-level selection state.
 *
 * State is held in React memory — cleared on page reload, persisted across
 * panel open/close within the same session.
 *
 * Validates: Requirements 11.1, 11.5, 12.1, 12.4, 12.5
 */
export function useSelectionModel() {
  const [selected, setSelected] = useState<Map<string, Set<number>>>(
    () => new Map()
  )

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /** Toggle a single physical copy's selection state. */
  const toggleInstance = useCallback(
    (oracleId: string, physicalCopyId: number): void => {
      setSelected((prev) => {
        const next = new Map(prev)
        const existing = next.get(oracleId)

        if (existing) {
          const updated = new Set(existing)
          if (updated.has(physicalCopyId)) {
            updated.delete(physicalCopyId)
          } else {
            updated.add(physicalCopyId)
          }
          if (updated.size === 0) {
            next.delete(oracleId)
          } else {
            next.set(oracleId, updated)
          }
        } else {
          next.set(oracleId, new Set([physicalCopyId]))
        }

        return next
      })
    },
    []
  )

  /** Select all instances for a given oracle_id. */
  const selectAllInstances = useCallback(
    (oracleId: string, physicalCopyIds: number[]): void => {
      setSelected((prev) => {
        const next = new Map(prev)
        if (physicalCopyIds.length === 0) {
          next.delete(oracleId)
        } else {
          next.set(oracleId, new Set(physicalCopyIds))
        }
        return next
      })
    },
    []
  )

  /** Deselect all instances for a given oracle_id. */
  const deselectAllInstances = useCallback((oracleId: string): void => {
    setSelected((prev) => {
      const next = new Map(prev)
      next.delete(oracleId)
      return next
    })
  }, [])

  /**
   * Toggle all rollup rows: if ALL rows are fully selected, deselect all;
   * otherwise select all instances across all provided rows.
   */
  const toggleAllRollupRows = useCallback(
    (rows: Array<{ oracleId: string; physicalCopyIds: number[] }>): void => {
      setSelected((prev) => {
        // Check if all rows are fully selected
        const allFullySelected = rows.every((row) => {
          const existing = prev.get(row.oracleId)
          if (!existing) return row.physicalCopyIds.length === 0
          return row.physicalCopyIds.every((id) => existing.has(id))
        })

        if (allFullySelected) {
          // Deselect all provided rows
          const next = new Map(prev)
          for (const row of rows) {
            next.delete(row.oracleId)
          }
          return next
        } else {
          // Select all instances in all provided rows
          const next = new Map(prev)
          for (const row of rows) {
            if (row.physicalCopyIds.length > 0) {
              next.set(row.oracleId, new Set(row.physicalCopyIds))
            }
          }
          return next
        }
      })
    },
    []
  )

  /** Clear all selections. */
  const clearAll = useCallback((): void => {
    setSelected(new Map())
  }, [])

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** Check if a specific physical copy is selected. */
  const isSelected = useCallback(
    (oracleId: string, physicalCopyId: number): boolean => {
      const set = selected.get(oracleId)
      return set ? set.has(physicalCopyId) : false
    },
    [selected]
  )

  /**
   * Get the tri-state checkbox value for a rollup row.
   * - If all `totalInstances` for the oracle_id are in the Set → 'checked'
   * - If some (but not all) are in the Set → 'indeterminate'
   * - If none (or the oracle_id has no entry) → 'unchecked'
   */
  const getTriState = useCallback(
    (oracleId: string, totalInstances: number): TriState => {
      const set = selected.get(oracleId)
      if (!set || set.size === 0) return 'unchecked'
      if (totalInstances <= 0) return 'unchecked'
      if (set.size >= totalInstances) return 'checked'
      return 'indeterminate'
    },
    [selected]
  )

  /** Get the total number of selected physical copies across all oracle_ids. */
  const getSelectedCount = useCallback((): number => {
    let count = 0
    for (const set of selected.values()) {
      count += set.size
    }
    return count
  }, [selected])

  /** Get the selected physical copy IDs for a specific oracle_id. */
  const getSelectedInstanceIds = useCallback(
    (oracleId: string): number[] => {
      const set = selected.get(oracleId)
      return set ? Array.from(set) : []
    },
    [selected]
  )

  /** Get all selected IDs as a Map<string, number[]>. */
  const getAllSelectedIds = useCallback((): Map<string, number[]> => {
    const result = new Map<string, number[]>()
    for (const [oracleId, set] of selected) {
      result.set(oracleId, Array.from(set))
    }
    return result
  }, [selected])

  return {
    selected,
    toggleInstance,
    selectAllInstances,
    deselectAllInstances,
    toggleAllRollupRows,
    clearAll,
    isSelected,
    getTriState,
    getSelectedCount,
    getSelectedInstanceIds,
    getAllSelectedIds,
  }
}
