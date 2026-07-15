'use client'

import { useState, useMemo, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/PageHeader'
import { useCollectionRollup } from '@/hooks/useCollectionRollup'
import { useCollectionPrintings } from '@/hooks/useCollectionPrintings'
import { CollectionImportButton } from '@/components/collection/CollectionImportButton'
import {
  CollectionToolbar,
  getPersistedViewMode,
  type ViewMode,
} from '@/components/collection/CollectionToolbar'
import { CollectionGridView } from '@/components/collection/CollectionGridView'
import { PrintingListView } from '@/components/collection/PrintingListView'
import { MissingToggle } from '@/components/collection/MissingToggle'
import { PriceStaleIndicator } from '@/components/collection/PriceStaleIndicator'
import {
  filterBySearch,
  filterByColorIdentity,
  filterByStatus,
  sortCards,
  filterPrintingBySearch,
  filterPrintingByColorIdentity,
  filterPrintingByStatus,
  sortPrintingRows,
} from '@/lib/collection-filters'
import type {
  SortField,
  PrintingSortField,
  SortDirection,
  StatusFilter,
  ColorIdentityMode,
  CollectionCardRow,
  PrintingCardRow,
} from '@/lib/collection-filters'
import type { CollectionRollupRowWithPrice } from '@/hooks/useCollectionRollup'
import type { PrintingRowResponse } from '@/lib/collection-printing-utils'

/* ─── Page Component ────────────────────────────────────────────────── */

export default function CollectionPage() {
  // ─── Proxy toggle ──────────────────────────────────────────────
  const [includeProxies, setIncludeProxies] = useState(false)
  const [showMissing, setShowMissing] = useState(false)

  // ─── Fetch rollup data via hook (used for grid view) ─────────────
  const { rows, lastPriceRefresh, isPriceStale, isLoading, error, expand } =
    useCollectionRollup('collection')

  // ─── Fetch printing-level data via hook (used for list view) ────
  const {
    data: printingData,
    isLoading: printingLoading,
    error: printingError,
  } = useCollectionPrintings()

  // Wrapper: CollectionGridView expects expand to return PrintingSubgroupRow[]
  const expandSubgroups = useCallback(
    async (cardDefinitionId: number) => {
      const result = await expand(cardDefinitionId)
      return result.subgroups
    },
    [expand]
  )

  // ─── Toolbar state ─────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('cardName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [viewMode, setViewMode] = useState<ViewMode>(() => getPersistedViewMode())
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [colorMode, setColorMode] = useState<ColorIdentityMode>('exact')
  const [activeStatuses, setActiveStatuses] = useState<StatusFilter[]>([])

  // ─── Printing-specific sort state ──────────────────────────────
  const [printingSortField, setPrintingSortField] = useState<PrintingSortField>('cardName')
  const [printingSortDirection, setPrintingSortDirection] = useState<SortDirection>('asc')

  // ─── Client-side filtering pipeline ────────────────────────────
  const filteredRows = useMemo(() => {
    // Cast rows to the filter function type — the underlying objects retain all fields
    const allRows = rows as CollectionCardRow[]

    // 1. Search filter
    let filtered = filterBySearch(allRows, searchQuery)

    // 2. Color identity filter (skip if no colors selected)
    if (selectedColors.length > 0) {
      filtered = filterByColorIdentity(filtered, selectedColors, colorMode)
    }

    // 3. Status filter (OR logic: show cards matching ANY active status)
    if (activeStatuses.length > 0) {
      const statusSets = activeStatuses.map((status) => filterByStatus(filtered, status))
      // Union all status results (dedupe by cardDefinitionId)
      const seen = new Set<number>()
      const union: CollectionCardRow[] = []
      for (const set of statusSets) {
        for (const card of set) {
          if (!seen.has(card.cardDefinitionId)) {
            seen.add(card.cardDefinitionId)
            union.push(card)
          }
        }
      }
      filtered = union
    }

    // 4. Sort
    filtered = sortCards(filtered, sortField, sortDirection)

    // The underlying objects are still CollectionRollupRowWithPrice — safe to cast back
    return filtered as unknown as CollectionRollupRowWithPrice[]
  }, [rows, searchQuery, selectedColors, colorMode, activeStatuses, sortField, sortDirection])

  // ─── Printing-level filtering pipeline ─────────────────────────
  const filteredPrintingRows = useMemo(() => {
    let allRows = printingData?.rows ?? []

    // Filter proxies unless toggle is on
    if (!includeProxies) {
      allRows = allRows.filter((r) => !r.isProxy)
    }

    // Filter missing unless toggle is on
    if (!showMissing) {
      allRows = allRows.filter((r) => !r.isMissing)
    }

    // Cast to PrintingCardRow for filter functions
    let filtered = filterPrintingBySearch(allRows as unknown as PrintingCardRow[], searchQuery)

    if (selectedColors.length > 0) {
      filtered = filterPrintingByColorIdentity(filtered, selectedColors, colorMode)
    }

    if (activeStatuses.length > 0) {
      // OR logic for status filters
      const statusSets = activeStatuses.map((status) => filterPrintingByStatus(filtered, status))
      const seen = new Set<number>()
      const union: PrintingCardRow[] = []
      for (const set of statusSets) {
        for (const row of set) {
          if (!seen.has(row.id)) {
            seen.add(row.id)
            union.push(row)
          }
        }
      }
      filtered = union
    }

    return sortPrintingRows(filtered, printingSortField, printingSortDirection) as unknown as PrintingRowResponse[]
  }, [printingData, searchQuery, selectedColors, colorMode, activeStatuses, printingSortField, printingSortDirection, includeProxies, showMissing])

  // ─── Printing sort toggle handler ──────────────────────────────
  const handlePrintingSort = useCallback(
    (field: PrintingSortField) => {
      if (field === printingSortField) {
        // Same field clicked — toggle direction
        setPrintingSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        // Different field — set to ascending
        setPrintingSortField(field)
        setPrintingSortDirection('asc')
      }
    },
    [printingSortField]
  )

  // ─── Derived state for the active data source ──────────────────
  const isPrintingView = viewMode === 'list'
  const activeIsLoading = isPrintingView ? printingLoading : isLoading
  const activeError = isPrintingView ? printingError : error
  const activeIsPriceStale = isPrintingView
    ? (printingData?.isPriceStale ?? false)
    : isPriceStale
  const activeLastPriceRefresh = isPrintingView
    ? (printingData?.lastPriceRefresh ?? null)
    : lastPriceRefresh

  // Count owned vs proxy vs missing
  const allPrintingRows = printingData?.rows ?? []
  const ownedCount = allPrintingRows.filter((r) => !r.isProxy).length
  const proxyCount = allPrintingRows.filter((r) => r.isProxy).length
  const missingCount = allPrintingRows.filter((r) => r.isMissing).length

  const activeRowCount = isPrintingView
    ? (includeProxies ? allPrintingRows.length : ownedCount)
    : rows.length
  const activeFilteredCount = isPrintingView
    ? filteredPrintingRows.length
    : filteredRows.length

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
      {/* Max-width container: 1520px centered, fluid below */}
      <div className="mx-auto flex h-full w-full max-w-[1520px] flex-col">
      {/* ─── Page Header ─────────────────────────────────────────── */}
      <PageHeader
        title="Collection"
        subtitle={
          <>
            {ownedCount.toLocaleString()} owned
            {includeProxies && proxyCount > 0 && ` · ${proxyCount} proxies`}
            {activeLastPriceRefresh && ' · Prices cached'}
          </>
        }
        actions={
          <>
            <CollectionImportButton />
            <span className="flex items-center gap-1.5 text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">
              <RefreshCw className="size-3" aria-hidden="true" />
              Synced
            </span>
          </>
        }
      />

      {/* ─── Tab Navigation ──────────────────────────────────────── */}
      {/* ─── Browsing View ───────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
          {/* ─── Price Stale Indicator ───────────────────────────── */}
          {activeIsPriceStale && !isPrintingView && (
            <div className="px-5 pt-2">
              <PriceStaleIndicator
                isPriceStale={activeIsPriceStale}
                lastPriceRefresh={activeLastPriceRefresh}
              />
            </div>
          )}

          {/* ─── Toolbar + Proxy Toggle ──────────────────────────── */}
          <div className="flex items-center">
            <div className="flex-1">
              <CollectionToolbar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                sortField={isPrintingView ? printingSortField : sortField}
                onSortFieldChange={(field) => {
                  if (isPrintingView) {
                    setPrintingSortField(field as PrintingSortField)
                  } else {
                    setSortField(field as SortField)
                  }
                }}
                sortDirection={isPrintingView ? printingSortDirection : sortDirection}
                onSortDirectionChange={(dir) => {
                  if (isPrintingView) {
                    setPrintingSortDirection(dir)
                  } else {
                    setSortDirection(dir)
                  }
                }}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                selectedColors={selectedColors}
                onColorsChange={setSelectedColors}
                colorMode={colorMode}
                onColorModeChange={setColorMode}
                activeStatuses={activeStatuses}
                onStatusChange={setActiveStatuses}
                sortContext={isPrintingView ? 'printing' : 'rollup'}
              />
            </div>
            {/* Proxy toggle chip */}
            {isPrintingView && proxyCount > 0 && (
              <button
                type="button"
                onClick={() => setIncludeProxies((prev) => !prev)}
                className={cn(
                  'mr-4 shrink-0 rounded-full px-2.5 py-[4px] text-[11px] transition-colors',
                  includeProxies
                    ? 'border-[rgba(107,138,255,0.4)] bg-[rgba(107,138,255,0.1)] text-[#6B8AFF]'
                    : 'text-[rgba(255,255,255,0.35)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.5)]'
                )}
                style={{
                  border: includeProxies
                    ? '0.5px solid rgba(107,138,255,0.4)'
                    : '0.5px solid rgba(255,255,255,0.1)',
                }}
                aria-pressed={includeProxies}
              >
                Proxies ({proxyCount})
              </button>
            )}
            {/* Missing toggle chip */}
            {isPrintingView && (
              <MissingToggle
                showMissing={showMissing}
                onToggle={setShowMissing}
                missingCount={missingCount}
              />
            )}
          </div>

          {/* ─── Main Content: Loading / Error / Empty / Data ──── */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {activeIsLoading ? (
              <LoadingSkeleton viewMode={viewMode} />
            ) : activeError ? (
              <ErrorState onRetry={() => window.location.reload()} />
            ) : isPrintingView ? (
              (printingData?.rows?.length ?? 0) === 0 ? (
                <EmptyState hasFilters={false} />
              ) : filteredPrintingRows.length === 0 ? (
                <EmptyState hasFilters={searchQuery !== '' || selectedColors.length > 0 || activeStatuses.length > 0} />
              ) : (
                <PrintingListView
                  rows={filteredPrintingRows}
                  sortField={printingSortField}
                  sortDirection={printingSortDirection}
                  onSort={handlePrintingSort}
                  isPriceStale={activeIsPriceStale}
                  lastPriceRefresh={activeLastPriceRefresh}
                  showMissing={showMissing}
                />
              )
            ) : (
              filteredRows.length === 0 ? (
                <EmptyState hasFilters={searchQuery !== '' || selectedColors.length > 0 || activeStatuses.length > 0} />
              ) : (
                <div className="flex-1 overflow-y-auto p-4">
                  <CollectionGridView rows={filteredRows} onExpand={expandSubgroups} />
                </div>
              )
            )}
          </div>

          {/* ─── Footer ──────────────────────────────────────────── */}
          <div
            className="flex items-center gap-2.5 px-4 py-2.5"
            style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Showing{' '}
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                {activeFilteredCount.toLocaleString()}
              </span>{' '}
              of{' '}
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                {activeRowCount.toLocaleString()}
              </span>{' '}
              cards
            </span>
          </div>
      </div>{/* end browsing view */}
      </div>{/* end max-width container */}
    </div>
  )
}

/* ─── Loading Skeleton ──────────────────────────────────────────────── */

function LoadingSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === 'grid') {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div
                className="aspect-[5/7] w-full animate-pulse rounded-lg"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              />
              <div
                className="h-3 w-3/4 animate-pulse rounded"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              />
              <div
                className="h-3 w-1/2 animate-pulse rounded"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-0">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-4 py-2.5"
          style={{
            borderBottom: '0.5px solid rgba(255,255,255,0.04)',
            background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
          }}
        >
          <div
            className="h-3.5 w-3.5 animate-pulse rounded"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          />
          <div
            className="h-3.5 flex-1 animate-pulse rounded"
            style={{ background: 'rgba(255,255,255,0.05)', maxWidth: '180px' }}
          />
          <div
            className="ml-auto h-3.5 w-10 animate-pulse rounded"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          />
          <div
            className="h-3.5 w-10 animate-pulse rounded"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          />
          <div
            className="h-3.5 w-20 animate-pulse rounded"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          />
        </div>
      ))}
    </div>
  )
}

/* ─── Error State ───────────────────────────────────────────────────── */

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <p className="text-[length:var(--fs-md)]" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Failed to load collection data.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md px-3 py-1.5 text-[length:var(--fs-sm)] transition-colors"
        style={{
          background: 'rgba(29,158,117,0.12)',
          color: '#1D9E75',
          border: '0.5px solid rgba(29,158,117,0.3)',
        }}
      >
        Retry
      </button>
    </div>
  )
}

/* ─── Empty State ───────────────────────────────────────────────────── */

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-[length:var(--fs-md)]" style={{ color: 'rgba(255,255,255,0.35)' }}>
        {hasFilters
          ? 'No cards match your filters.'
          : 'No cards in your collection yet.'}
      </p>
    </div>
  )
}
