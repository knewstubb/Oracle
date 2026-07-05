'use client'

import { useState, useMemo, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCollectionRollup } from '@/hooks/useCollectionRollup'
import { CollectionImportButton } from '@/components/collection/CollectionImportButton'
import {
  CollectionToolbar,
  getPersistedViewMode,
  type ViewMode,
} from '@/components/collection/CollectionToolbar'
import { CollectionListView } from '@/components/collection/CollectionListView'
import { CollectionGridView } from '@/components/collection/CollectionGridView'
import { PriceStaleIndicator } from '@/components/collection/PriceStaleIndicator'
import {
  filterBySearch,
  filterByColorIdentity,
  filterByStatus,
  sortCards,
} from '@/lib/collection-filters'
import type {
  SortField,
  SortDirection,
  StatusFilter,
  ColorIdentityMode,
  CollectionCardRow,
} from '@/lib/collection-filters'
import type { CollectionRollupRowWithPrice } from '@/hooks/useCollectionRollup'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AllocationTab } from '@/components/AllocationTab'

/* ─── Page Component ────────────────────────────────────────────────── */

export default function CollectionPage() {
  // ─── Tab state ─────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<string>('collection')

  // Collection vs Proxies tab within the Collection/Proxies split
  const [collectionTab, setCollectionTab] = useState<'collection' | 'proxies'>('collection')

  // ─── Fetch rollup data via hook ────────────────────────────────
  const { rows, lastPriceRefresh, isPriceStale, isLoading, error, expand } =
    useCollectionRollup(collectionTab)

  // Wrapper: CollectionListView/GridView expect expand to return PrintingSubgroupRow[]
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

  return (
    <div className="flex h-full flex-col" style={{ background: '#0f0f0f' }}>
      {/* ─── Page Header ─────────────────────────────────────────── */}
      <header
        className="flex items-center gap-3 px-5 py-3.5"
        style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}
      >
        <div>
          <h1 className="text-base font-medium text-white">Collection</h1>
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {rows.length.toLocaleString()} cards
            {lastPriceRefresh && ' · Prices cached'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <CollectionImportButton />
          <span
            className="flex items-center gap-1.5 text-[11px]"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            Synced
          </span>
        </div>
      </header>

      {/* ─── Top-Level Tab Navigation ────────────────────────────── */}
      <Tabs
        defaultValue="collection"
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as string)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div
          className="shrink-0 px-5"
          style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}
        >
          <TabsList variant="line">
            <TabsTrigger value="collection">Collection</TabsTrigger>
            <TabsTrigger value="allocation">Allocation</TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Collection Tab Content ──────────────────────────────── */}
        <TabsContent value="collection" className="flex min-h-0 flex-1 flex-col">
          {/* ─── Collection / Proxies sub-tabs ───────────────────── */}
          <div
            className="flex items-center gap-1 px-5 py-2"
            style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}
          >
            <button
              type="button"
              onClick={() => setCollectionTab('collection')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs transition-colors',
                collectionTab === 'collection'
                  ? 'bg-[rgba(29,158,117,0.12)] text-[#1D9E75]'
                  : 'text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.6)]'
              )}
              style={
                collectionTab === 'collection'
                  ? { border: '0.5px solid rgba(29,158,117,0.3)' }
                  : { border: '0.5px solid transparent' }
              }
              aria-pressed={collectionTab === 'collection'}
            >
              Collection
            </button>
            <button
              type="button"
              onClick={() => setCollectionTab('proxies')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs transition-colors',
                collectionTab === 'proxies'
                  ? 'bg-[rgba(29,158,117,0.12)] text-[#1D9E75]'
                  : 'text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.6)]'
              )}
              style={
                collectionTab === 'proxies'
                  ? { border: '0.5px solid rgba(29,158,117,0.3)' }
                  : { border: '0.5px solid transparent' }
              }
              aria-pressed={collectionTab === 'proxies'}
            >
              Proxies
            </button>
          </div>

          {/* ─── Price Stale Indicator ───────────────────────────── */}
          {isPriceStale && (
            <div className="px-5 pt-2">
              <PriceStaleIndicator
                isPriceStale={isPriceStale}
                lastPriceRefresh={lastPriceRefresh}
              />
            </div>
          )}

          {/* ─── Toolbar ─────────────────────────────────────────── */}
          <CollectionToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortField={sortField}
            onSortFieldChange={setSortField}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            selectedColors={selectedColors}
            onColorsChange={setSelectedColors}
            colorMode={colorMode}
            onColorModeChange={setColorMode}
            activeStatuses={activeStatuses}
            onStatusChange={setActiveStatuses}
          />

          {/* ─── Main Content: Loading / Error / Empty / Data ──── */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {isLoading ? (
              <LoadingSkeleton viewMode={viewMode} />
            ) : error ? (
              <ErrorState onRetry={() => window.location.reload()} />
            ) : filteredRows.length === 0 ? (
              <EmptyState hasFilters={searchQuery !== '' || selectedColors.length > 0 || activeStatuses.length > 0} />
            ) : viewMode === 'list' ? (
              <CollectionListView rows={filteredRows} expand={expand} />
            ) : (
              <div className="flex-1 overflow-y-auto p-4">
                <CollectionGridView rows={filteredRows} onExpand={expandSubgroups} />
              </div>
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
                {filteredRows.length.toLocaleString()}
              </span>{' '}
              of{' '}
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                {rows.length.toLocaleString()}
              </span>{' '}
              cards
            </span>
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {collectionTab === 'collection' ? 'Owned cards' : 'Proxy cards'}
            </span>
          </div>
        </TabsContent>

        {/* ─── Allocation Tab ──────────────────────────────────────── */}
        <TabsContent value="allocation" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <AllocationTab />
        </TabsContent>
      </Tabs>
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
      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Failed to load collection data.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md px-3 py-1.5 text-xs transition-colors"
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
      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
        {hasFilters
          ? 'No cards match your filters.'
          : 'No cards in your collection yet.'}
      </p>
    </div>
  )
}
