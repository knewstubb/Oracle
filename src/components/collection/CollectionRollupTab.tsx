'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { RollupV2Response } from '@/app/api/collection/rollup-v2/route'
import { useSelectionModel } from '@/hooks/useSelectionModel'
import { RollupListPane } from './RollupListPane'
import { CollectionCardDetails } from '@/components/card-details/CollectionCardDetails'
import { BulkActionBar } from './BulkActionBar'
import { hasSupertype, parseTypeLine } from '@/lib/type-line'

/* ─── Types ─────────────────────────────────────────────────────────── */

type RollupSortField = 'cardName' | 'ownedCount' | 'proxyCount' | 'allocatedCount' | 'shortfall'
type SortDirection = 'asc' | 'desc'

/* ─── CollectionRollupTab ───────────────────────────────────────────── */

/**
 * Orchestrator component for the Collection Rollup two-pane UI.
 *
 * Owns layout state (selectedOracleId, search, sort, filter) and coordinates
 * the RollupListPane, the card details window (modal), and BulkActionBar (bottom).
 *
 * Validates: Requirements 5.1, 5.2, 5.5, 10.1
 */
export function CollectionRollupTab() {
  // ─── Layout state ──────────────────────────────────────────────
  const [selectedOracleId, setSelectedOracleId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<RollupSortField>('cardName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [basicLandFilter, setBasicLandFilter] = useState(true)
  const [allocatedFilter, setAllocatedFilter] = useState(false)

  // ─── Selection model ───────────────────────────────────────────
  const {
    selected: selection,
    selectAllInstances,
    deselectAllInstances,
    toggleInstance,
    isSelected,
    getSelectedCount,
    clearAll,
  } = useSelectionModel()

  const selectedCount = getSelectedCount()
  const selectedIds = useMemo(
    () => [...selection.values()].flatMap((s) => [...s]),
    [selection]
  )
  const queryClient = useQueryClient()

  // ─── Fetch rollup data ─────────────────────────────────────────
  const { data, isLoading, error } = useQuery<RollupV2Response>({
    queryKey: ['collection', 'rollup-v2'],
    queryFn: async () => {
      const res = await fetch('/api/collection/rollup-v2')
      if (!res.ok) throw new Error('Failed to load rollup data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // ─── Filtered + sorted rows ────────────────────────────────────
  const rows = useMemo(() => {
    if (!data?.rows) return []
    let filtered = data.rows

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((r) => r.cardName.toLowerCase().includes(q))
    }

    // Basic land filter
    if (basicLandFilter) {
      filtered = filtered.filter((r) => !hasSupertype(parseTypeLine(r.typeLine), 'Basic', 'any'))
    }

    // Allocated filter — show only cards with allocatedCount > 0
    if (allocatedFilter) {
      filtered = filtered.filter((r) => r.allocatedCount > 0)
    }

    // Sort
    const dir = sortDirection === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sortField === 'cardName') {
        return a.cardName.localeCompare(b.cardName) * dir
      }
      return ((a[sortField] ?? 0) - (b[sortField] ?? 0)) * dir
    })
  }, [data, searchQuery, basicLandFilter, allocatedFilter, sortField, sortDirection])

  // ─── Derived state ─────────────────────────────────────────────
  const selectedCard = rows.find((r) => r.oracleId === selectedOracleId)

  // ─── Handlers ──────────────────────────────────────────────────
  const handleRowClick = (oracleId: string) => {
    setSelectedOracleId(oracleId)
  }

  const handleClosePanel = () => {
    setSelectedOracleId(null)
  }

  const handleClearSelection = () => {
    clearAll()
  }

  /**
   * Check if a specific instance is selected in the detail panel.
   * Uses the hook's isSelected method with the currently open oracle_id.
   */
  const isInstanceSelected = useCallback((physicalCopyId: number) => {
    if (!selectedOracleId) return false
    return isSelected(selectedOracleId, physicalCopyId)
  }, [isSelected, selectedOracleId])

  /**
   * Toggle a specific instance's selection in the detail panel.
   * Uses the hook's toggleInstance method with the currently open oracle_id.
   */
  const handleToggleInstance = useCallback((physicalCopyId: number) => {
    if (!selectedOracleId) return
    toggleInstance(selectedOracleId, physicalCopyId)
  }, [toggleInstance, selectedOracleId])

  /**
   * Checkbox toggle: resolve real physical_copy_ids via the instance resolver endpoint.
   * If already selected, deselect. If not, fetch and select all.
   * Validates: Requirements 1.1, 1.2, 1.3
   */
  const handleCheckboxToggle = useCallback(async (oracleId: string) => {
    const current = selection.get(oracleId)
    if (current && current.size > 0) {
      // Deselect all instances for this oracle_id
      deselectAllInstances(oracleId)
    } else {
      // Fetch real IDs from the instance resolver and select all
      try {
        const res = await fetch(`/api/collection/instances/${oracleId}/ids`)
        if (!res.ok) throw new Error('Failed to resolve')
        const payload = (await res.json()) as { physicalCopyIds?: unknown }
        const physicalCopyIds = Array.isArray(payload.physicalCopyIds)
          ? payload.physicalCopyIds.filter((id): id is number => typeof id === 'number' && Number.isInteger(id))
          : []
        selectAllInstances(oracleId, physicalCopyIds)
      } catch {
        toast.error('Failed to resolve instances')
      }
    }
  }, [selection, selectAllInstances, deselectAllInstances])

  /**
   * Get tri-state for a rollup row checkbox.
   * Returns 'checked' if oracleId exists in selection with size > 0, 'unchecked' otherwise.
   * Indeterminate state will be refined when detail panel instance checkboxes are wired (task 12).
   */
  const getTriState = useCallback((oracleId: string): 'checked' | 'unchecked' | 'indeterminate' => {
    const s = selection.get(oracleId)
    if (!s || s.size === 0) return 'unchecked'
    return 'checked'
  }, [selection])

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden">
        {/* The Collection list. A card opens in the card details window (a modal), so the list uses the full width. */}
        <RollupListPane
          rows={rows}
          isLoading={isLoading}
          error={error}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortField={sortField}
          sortDirection={sortDirection}
          onSortFieldChange={setSortField}
          onSortDirectionChange={setSortDirection}
          basicLandFilter={basicLandFilter}
          onBasicLandFilterChange={setBasicLandFilter}
          allocatedFilter={allocatedFilter}
          onAllocatedFilterChange={setAllocatedFilter}
          selectedOracleId={selectedOracleId}
          onRowClick={handleRowClick}
          onCheckboxToggle={handleCheckboxToggle}
          getTriState={getTriState}
          isPanelOpen={false}
        />
      </div>
      {selectedOracleId && (
        <CollectionCardDetails
          key={selectedOracleId}
          oracleId={selectedOracleId}
          cardName={selectedCard?.cardName ?? 'Unknown'}
          onClose={handleClosePanel}
          isInstanceSelected={isInstanceSelected}
          onToggleInstance={handleToggleInstance}
        />
      )}
      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <BulkActionBar
          selectedCount={selectedCount}
          selectedIds={selectedIds}
          onClear={handleClearSelection}
          onSuccess={() => {
            clearAll()
            queryClient.invalidateQueries({ queryKey: ['collection'] })
          }}
        />
      )}
    </div>
  )
}
