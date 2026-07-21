'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/PageHeader'
import { useCollectionRollup } from '@/hooks/useCollectionRollup'
import { useCollectionPrintings } from '@/hooks/useCollectionPrintings'
import { CollectionImportButton } from '@/components/collection/CollectionImportButton'
import { CollectionValueBanner } from '@/components/collection/CollectionValueBanner'
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
  PrintingCardRow,
} from '@/lib/collection-filters'
import type { CollectionRollupRowWithPrice } from '@/hooks/useCollectionRollup'
import type { PrintingRowResponse } from '@/lib/collection-printing-utils'

/* ─── Debounce hook ─────────────────────────────────────────────────── */

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/* ─── Page Component ────────────────────────────────────────────────── */

export default function CollectionPage() {
  // ─── Proxy toggle ──────────────────────────────────────────────
  const [includeProxies, setIncludeProxies] = useState(false)
  const [showMissing, setShowMissing] = useState(false)

  // ─── Toolbar state ─────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('cardName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [colorMode, setColorMode] = useState<ColorIdentityMode>('exact')
  const [activeStatuses, setActiveStatuses] = useState<StatusFilter[]>([])

  // Sync viewMode from localStorage after hydration (avoids SSR mismatch)
  useEffect(() => {
    const persisted = getPersistedViewMode()
    if (persisted !== 'grid') setViewMode(persisted)
  }, [])

  // ─── Pagination state ──────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1)

  // Reset page when filters change
  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  useEffect(() => { setCurrentPage(1) }, [debouncedSearch, selectedColors, colorMode, sortField, sortDirection])

  // ─── Fetch rollup data via hook (server-side paginated) ────────
  const { rows, totalCount, page, pageSize, lastPriceRefresh, isPriceStale, isLoading, isFetching, error, expand } =
    useCollectionRollup({
      tab: 'collection',
      page: currentPage,
      pageSize: 50,
      search: debouncedSearch,
      sort: sortField,
      sortDir: sortDirection,
      colors: selectedColors,
      colorMode,
    })

  // ─── Fetch printing-level data via hook (only in list view) ─────
  const {
    data: printingData,
    isLoading: printingLoading,
    error: printingError,
  } = useCollectionPrintings({ enabled: viewMode === 'list' })

  // Wrapper: CollectionGridView expects expand to return PrintingSubgroupRow[]
  const expandSubgroups = useCallback(
    async (cardDefinitionId: number) => {
      const result = await expand(cardDefinitionId)
      return result.subgroups
    },
    [expand]
  )

  // ─── Printing-specific sort state ──────────────────────────────
  const [printingSortField, setPrintingSortField] = useState<PrintingSortField>('cardName')
  const [printingSortDirection, setPrintingSortDirection] = useState<SortDirection>('asc')

  // ─── Printing-level filtering pipeline (list view stays client-side for now) ───
  const filteredPrintingRows = useMemo(() => {
    let allRows = printingData?.rows ?? []

    if (!includeProxies) {
      allRows = allRows.filter((r) => !r.isProxy)
    }

    if (!showMissing) {
      allRows = allRows.filter((r) => !r.isMissing)
    }

    let filtered = filterPrintingBySearch(allRows as unknown as PrintingCardRow[], searchQuery)

    if (selectedColors.length > 0) {
      filtered = filterPrintingByColorIdentity(filtered, selectedColors, colorMode)
    }

    if (activeStatuses.length > 0) {
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
        setPrintingSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setPrintingSortField(field)
        setPrintingSortDirection('asc')
      }
    },
    [printingSortField]
  )

  // ─── Derived state ─────────────────────────────────────────────
  const isPrintingView = viewMode === 'list'
  const activeIsLoading = isPrintingView ? printingLoading : isLoading
  const activeError = isPrintingView ? printingError : error
  const activeIsPriceStale = isPrintingView
    ? (printingData?.isPriceStale ?? false)
    : isPriceStale
  const activeLastPriceRefresh = isPrintingView
    ? (printingData?.lastPriceRefresh ?? null)
    : lastPriceRefresh

  const allPrintingRows = printingData?.rows ?? []
  const ownedCount = allPrintingRows.filter((r) => !r.isProxy).length
  const proxyCount = allPrintingRows.filter((r) => r.isProxy).length
  const missingCount = allPrintingRows.filter((r) => r.isMissing).length

  // Pagination derived state
  const totalPages = Math.ceil(totalCount / pageSize)
  const showPagination = !isPrintingView && totalPages > 1

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
      {/* Max-width container: 1520px centered, fluid below */}
      <div className="mx-auto flex h-full w-full max-w-[var(--content-max-width)] flex-col">
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
          <CollectionImportButton />
        }
      />

      {/* ─── Collection Value Banner ─────────────────────────────── */}
      <CollectionValueBanner />

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
              rows.length === 0 ? (
                <EmptyState hasFilters={debouncedSearch !== '' || selectedColors.length > 0} />
              ) : (
                <div className={cn("flex-1 overflow-y-auto p-4", isFetching && "opacity-70 transition-opacity")}>
                  <CollectionGridView rows={rows} onExpand={expandSubgroups} />
                </div>
              )
            )}
          </div>

          {/* ─── Footer with pagination ──────────────────────────── */}
          <div
            className="flex items-center gap-2.5 px-4 py-2.5"
            style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {isPrintingView ? (
                <>
                  Showing{' '}
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {filteredPrintingRows.length.toLocaleString()}
                  </span>{' '}
                  of{' '}
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {(includeProxies ? allPrintingRows.length : ownedCount).toLocaleString()}
                  </span>{' '}
                  cards
                </>
              ) : (
                <>
                  Showing{' '}
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {rows.length.toLocaleString()}
                  </span>{' '}
                  of{' '}
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {totalCount.toLocaleString()}
                  </span>{' '}
                  cards
                  {totalPages > 1 && (
                    <> · Page {currentPage} of {totalPages}</>
                  )}
                </>
              )}
            </span>

            {/* Pagination controls */}
            {showPagination && (
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
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
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="text-[length:var(--fs-md)]" style={{ color: 'rgba(255,255,255,0.35)' }}>
        {hasFilters
          ? 'No cards match your filters.'
          : 'No cards in your collection yet.'}
      </p>
      {!hasFilters && (
        <p className="max-w-sm text-[length:var(--fs-sm)] text-muted-foreground">
          Import a CSV from Archidekt, Moxfield, or ManaBox to get started. Your collection powers the Picklist and allocation system.
        </p>
      )}
      {!hasFilters && <CollectionImportButton />}
    </div>
  )
}
