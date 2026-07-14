import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useSelectionModel } from './useSelectionModel'

describe('useSelectionModel', () => {
  // -------------------------------------------------------------------------
  // toggleInstance
  // -------------------------------------------------------------------------

  describe('toggleInstance', () => {
    it('selects a single instance', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.toggleInstance('oracle-1', 10)
      })

      expect(result.current.isSelected('oracle-1', 10)).toBe(true)
      expect(result.current.getSelectedCount()).toBe(1)
    })

    it('deselects a previously selected instance', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.toggleInstance('oracle-1', 10)
      })
      act(() => {
        result.current.toggleInstance('oracle-1', 10)
      })

      expect(result.current.isSelected('oracle-1', 10)).toBe(false)
      expect(result.current.getSelectedCount()).toBe(0)
    })

    it('removes oracle_id entry when last instance is deselected', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.toggleInstance('oracle-1', 10)
      })
      act(() => {
        result.current.toggleInstance('oracle-1', 10)
      })

      expect(result.current.selected.has('oracle-1')).toBe(false)
    })

    it('handles multiple instances under the same oracle_id', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.toggleInstance('oracle-1', 10)
        result.current.toggleInstance('oracle-1', 20)
        result.current.toggleInstance('oracle-1', 30)
      })

      expect(result.current.isSelected('oracle-1', 10)).toBe(true)
      expect(result.current.isSelected('oracle-1', 20)).toBe(true)
      expect(result.current.isSelected('oracle-1', 30)).toBe(true)
      expect(result.current.getSelectedCount()).toBe(3)
    })
  })

  // -------------------------------------------------------------------------
  // selectAllInstances / deselectAllInstances
  // -------------------------------------------------------------------------

  describe('selectAllInstances', () => {
    it('selects all provided instance IDs', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.selectAllInstances('oracle-1', [1, 2, 3, 4])
      })

      expect(result.current.isSelected('oracle-1', 1)).toBe(true)
      expect(result.current.isSelected('oracle-1', 4)).toBe(true)
      expect(result.current.getSelectedCount()).toBe(4)
    })

    it('replaces existing selection for the oracle_id', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.selectAllInstances('oracle-1', [1, 2, 3])
      })
      act(() => {
        result.current.selectAllInstances('oracle-1', [4, 5])
      })

      expect(result.current.isSelected('oracle-1', 1)).toBe(false)
      expect(result.current.isSelected('oracle-1', 4)).toBe(true)
      expect(result.current.getSelectedCount()).toBe(2)
    })

    it('removes entry when given empty array', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.selectAllInstances('oracle-1', [1, 2])
      })
      act(() => {
        result.current.selectAllInstances('oracle-1', [])
      })

      expect(result.current.selected.has('oracle-1')).toBe(false)
      expect(result.current.getSelectedCount()).toBe(0)
    })
  })

  describe('deselectAllInstances', () => {
    it('removes all selections for a given oracle_id', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.selectAllInstances('oracle-1', [1, 2, 3])
        result.current.selectAllInstances('oracle-2', [10, 20])
      })

      act(() => {
        result.current.deselectAllInstances('oracle-1')
      })

      expect(result.current.selected.has('oracle-1')).toBe(false)
      expect(result.current.isSelected('oracle-2', 10)).toBe(true)
      expect(result.current.getSelectedCount()).toBe(2)
    })
  })

  // -------------------------------------------------------------------------
  // toggleAllRollupRows
  // -------------------------------------------------------------------------

  describe('toggleAllRollupRows', () => {
    it('selects all rows when none are fully selected', () => {
      const { result } = renderHook(() => useSelectionModel())

      const rows = [
        { oracleId: 'oracle-1', physicalCopyIds: [1, 2] },
        { oracleId: 'oracle-2', physicalCopyIds: [10, 20, 30] },
      ]

      act(() => {
        result.current.toggleAllRollupRows(rows)
      })

      expect(result.current.getSelectedCount()).toBe(5)
      expect(result.current.isSelected('oracle-1', 1)).toBe(true)
      expect(result.current.isSelected('oracle-2', 30)).toBe(true)
    })

    it('deselects all rows when all are fully selected', () => {
      const { result } = renderHook(() => useSelectionModel())

      const rows = [
        { oracleId: 'oracle-1', physicalCopyIds: [1, 2] },
        { oracleId: 'oracle-2', physicalCopyIds: [10, 20] },
      ]

      act(() => {
        result.current.selectAllInstances('oracle-1', [1, 2])
        result.current.selectAllInstances('oracle-2', [10, 20])
      })

      act(() => {
        result.current.toggleAllRollupRows(rows)
      })

      expect(result.current.getSelectedCount()).toBe(0)
    })

    it('selects all when some rows are partially selected', () => {
      const { result } = renderHook(() => useSelectionModel())

      const rows = [
        { oracleId: 'oracle-1', physicalCopyIds: [1, 2, 3] },
        { oracleId: 'oracle-2', physicalCopyIds: [10, 20] },
      ]

      // Partially select oracle-1
      act(() => {
        result.current.toggleInstance('oracle-1', 1)
      })

      act(() => {
        result.current.toggleAllRollupRows(rows)
      })

      expect(result.current.getSelectedCount()).toBe(5)
      expect(result.current.isSelected('oracle-1', 2)).toBe(true)
      expect(result.current.isSelected('oracle-1', 3)).toBe(true)
    })

    it('preserves selections for rows not in the toggle set', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.selectAllInstances('oracle-other', [99])
      })

      const rows = [{ oracleId: 'oracle-1', physicalCopyIds: [1, 2] }]
      act(() => {
        result.current.toggleAllRollupRows(rows)
      })

      expect(result.current.isSelected('oracle-other', 99)).toBe(true)
      expect(result.current.getSelectedCount()).toBe(3)
    })
  })

  // -------------------------------------------------------------------------
  // clearAll
  // -------------------------------------------------------------------------

  describe('clearAll', () => {
    it('removes all selections', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.selectAllInstances('oracle-1', [1, 2])
        result.current.selectAllInstances('oracle-2', [10])
      })

      act(() => {
        result.current.clearAll()
      })

      expect(result.current.getSelectedCount()).toBe(0)
      expect(result.current.selected.size).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // getTriState
  // -------------------------------------------------------------------------

  describe('getTriState', () => {
    it('returns unchecked when no instances are selected', () => {
      const { result } = renderHook(() => useSelectionModel())

      expect(result.current.getTriState('oracle-1', 5)).toBe('unchecked')
    })

    it('returns checked when all instances are selected', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.selectAllInstances('oracle-1', [1, 2, 3])
      })

      expect(result.current.getTriState('oracle-1', 3)).toBe('checked')
    })

    it('returns indeterminate when some instances are selected', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.toggleInstance('oracle-1', 1)
        result.current.toggleInstance('oracle-1', 2)
      })

      expect(result.current.getTriState('oracle-1', 5)).toBe('indeterminate')
    })

    it('returns unchecked when totalInstances is 0', () => {
      const { result } = renderHook(() => useSelectionModel())

      expect(result.current.getTriState('oracle-1', 0)).toBe('unchecked')
    })

    it('returns checked when selected count equals totalInstances', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.selectAllInstances('oracle-1', [1])
      })

      expect(result.current.getTriState('oracle-1', 1)).toBe('checked')
    })
  })

  // -------------------------------------------------------------------------
  // getSelectedInstanceIds / getAllSelectedIds
  // -------------------------------------------------------------------------

  describe('getSelectedInstanceIds', () => {
    it('returns empty array for unselected oracle_id', () => {
      const { result } = renderHook(() => useSelectionModel())

      expect(result.current.getSelectedInstanceIds('oracle-1')).toEqual([])
    })

    it('returns all selected instance IDs for an oracle_id', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.selectAllInstances('oracle-1', [5, 10, 15])
      })

      const ids = result.current.getSelectedInstanceIds('oracle-1')
      expect(ids.sort((a, b) => a - b)).toEqual([5, 10, 15])
    })
  })

  describe('getAllSelectedIds', () => {
    it('returns a Map with all oracle_ids and their selected instance arrays', () => {
      const { result } = renderHook(() => useSelectionModel())

      act(() => {
        result.current.selectAllInstances('oracle-1', [1, 2])
        result.current.selectAllInstances('oracle-2', [10])
      })

      const all = result.current.getAllSelectedIds()
      expect(all.size).toBe(2)
      expect(all.get('oracle-1')?.sort()).toEqual([1, 2])
      expect(all.get('oracle-2')).toEqual([10])
    })
  })
})
