'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import type { RollupV2Response } from '@/app/api/collection/rollup-v2/route'
import { useSelectionModel } from '@/hooks/useSelectionModel'
import { RollupListPane } from './RollupListPane'
import { InstanceDetailPanel } from './InstanceDetailPanel'
import { BulkActionBar } from './BulkActionBar'

/* ─── useIsMobile Hook ──────────────────────────────────────────────── */

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 900px)')
    setIsMobile(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isMobile
}

/* ─── Types ─────────────────────────────────────────────────────────── */

type RollupSortField = 'cardName' | 'ownedCount' | 'proxyCount' | 'allocatedCount' | 'shortfall'
type SortDirection = 'asc' | 'desc'

/* ─── CollectionRollupTab ───────────────────────────────────────────── */

/**
 * Orchestrator component for the Collection Rollup two-pane UI.
 *
 * Owns layout state (selectedOracleId, search, sort, filter) and coordinates
 * the RollupListPane (left), InstanceDetailPanel (right), and BulkActionBar (bottom).
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
  const isMobile = useIsMobile()

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

  // ─── Escape closes detail panel ───────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedOracleId) {
        setSelectedOracleId(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedOracleId])

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
      filtered = filtered.filter((r) => !r.typeLine.includes('Basic Land'))
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
  const panelOpen = selectedOracleId !== null
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
        const data = await res.json()
        selectAllInstances(oracleId, data.physicalCopyIds)
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
      {/* Two-pane grid */}
      <div
        className="grid min-h-0 flex-1 overflow-hidden"
        style={{
          gridTemplateColumns: isMobile ? '1fr' : '1fr 560px',
        }}
      >
        {/* Left pane: Rollup list */}
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
          isPanelOpen={!isMobile}
        />

        {/* Right pane: Detail panel — always visible on desktop */}
        {!isMobile && (
          selectedOracleId ? (
            <div className="border-l border-[var(--border-subtle)] pt-[72px] overflow-hidden">
              <InstanceDetailPanel
                oracleId={selectedOracleId}
                cardName={selectedCard?.cardName ?? 'Unknown'}
                onClose={handleClosePanel}
                isInstanceSelected={isInstanceSelected}
                onToggleInstance={handleToggleInstance}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center border-l border-[var(--border-subtle)] pt-[72px] text-[length:var(--fs-base)] text-[var(--text-tertiary)]">
              Select a card to view details
            </div>
          )
        )}
      </div>

      {/* Mobile overlay: Detail panel as full-screen push */}
      {selectedOracleId && isMobile && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/60"
        >
          <div
            className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-surface)]"
          >
            {/* Mobile header with back arrow */}
            <div
              className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3"
            >
              <button
                type="button"
                onClick={handleClosePanel}
                className="rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
                aria-label="Back to list"
              >
                <ArrowLeft className="size-4" />
              </button>
              <span
                className="flex-1 truncate text-[length:var(--fs-md)] font-medium text-[var(--text-primary)]"
              >
                {selectedCard?.cardName ?? 'Unknown'}
              </span>
            </div>

            {/* Panel content (reuse InstanceDetailPanel without its own header) */}
            <div className="flex-1 overflow-hidden">
              <InstanceDetailPanel
                oracleId={selectedOracleId}
                cardName={selectedCard?.cardName ?? 'Unknown'}
                onClose={handleClosePanel}
                isInstanceSelected={isInstanceSelected}
                onToggleInstance={handleToggleInstance}
              />
            </div>
          </div>
        </div>
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
