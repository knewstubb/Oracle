'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types (mirrors API response shape from /api/collection/rollup)
// ---------------------------------------------------------------------------

export interface DeckUsageEntry {
  deckId: number
  deckName: string
  quantity: number
}

export interface PrintingSubgroupRow {
  physicalCopyId: number
  scryfallPrintingId: string
  setCode: string
  setName: string
  isFoil: boolean
  quantity: number
  inUseCount: number
  ownedValuation: number | null
  deckUsage: DeckUsageEntry[]
}

export interface ExpandResult {
  subgroups: PrintingSubgroupRow[]
  proxyPlacementCount: number
}

export interface CollectionRollupRowWithPrice {
  cardDefinitionId: number
  cardName: string
  oracleId: string
  colorIdentity: string[]
  isBasicLand: boolean
  ownedQuantity: number
  inUseCount: number
  priceToAdd: number | null
  printingSubgroups: PrintingSubgroupRow[]
}

export interface CollectionRollupResponse {
  rows: CollectionRollupRowWithPrice[]
  totalCount: number
  page: number
  pageSize: number
  lastPriceRefresh: string | null
  isPriceStale: boolean
}

// ---------------------------------------------------------------------------
// Pagination params
// ---------------------------------------------------------------------------

export interface CollectionRollupParams {
  tab?: 'collection' | 'proxies'
  page?: number
  pageSize?: number
  search?: string
  sort?: string
  sortDir?: 'asc' | 'desc'
  colors?: string[]
  colorMode?: string
}

// ---------------------------------------------------------------------------
// Hook: useCollectionRollup
// ---------------------------------------------------------------------------

/**
 * Fetches paginated card-level rollup data for the collection screen.
 * Passes search/sort/filter params to the server — only fetches the current page.
 *
 * Validates: Requirements 1.4, 9.2, 9.3
 */
export function useCollectionRollup(params: CollectionRollupParams = {}) {
  const queryClient = useQueryClient()

  const {
    tab = 'collection',
    page = 1,
    pageSize = 50,
    search = '',
    sort = 'cardName',
    sortDir = 'asc',
    colors = [],
    colorMode = 'includes',
  } = params

  // Build query string
  const queryString = new URLSearchParams({
    tab,
    page: String(page),
    pageSize: String(pageSize),
    sort,
    sortDir,
    ...(search ? { search } : {}),
    ...(colors.length > 0 ? { colors: colors.join(','), colorMode } : {}),
  }).toString()

  // Main rollup query — keyed by all filter/pagination params
  const rollupQuery = useQuery<CollectionRollupResponse>({
    queryKey: ['collection', 'rollup', tab, page, pageSize, search, sort, sortDir, colors.join(','), colorMode],
    queryFn: async () => {
      const res = await fetch(`/api/collection/rollup?${queryString}`)
      if (!res.ok) {
        throw new Error('Failed to load collection data')
      }
      return res.json()
    },
    staleTime: 60 * 1000, // 1 min — pages change frequently during interaction
    placeholderData: (prev) => prev, // Keep previous data visible while loading next page
  })

  /**
   * Lazily fetches printing subgroup details for a single card_definition.
   * Results are cached via TanStack Query so repeated expands don't re-fetch.
   */
  const expand = useCallback(
    async (cardDefinitionId: number): Promise<ExpandResult> => {
      return queryClient.fetchQuery<ExpandResult>({
        queryKey: ['collection', 'rollup', 'expand', cardDefinitionId],
        queryFn: async () => {
          const res = await fetch(`/api/collection/rollup/${cardDefinitionId}`)
          if (!res.ok) {
            throw new Error(`Failed to load printing details for card ${cardDefinitionId}`)
          }
          return res.json()
        },
        staleTime: 5 * 60 * 1000,
      })
    },
    [queryClient]
  )

  return {
    data: rollupQuery.data,
    rows: rollupQuery.data?.rows ?? [],
    totalCount: rollupQuery.data?.totalCount ?? 0,
    page: rollupQuery.data?.page ?? page,
    pageSize: rollupQuery.data?.pageSize ?? pageSize,
    lastPriceRefresh: rollupQuery.data?.lastPriceRefresh ?? null,
    isPriceStale: rollupQuery.data?.isPriceStale ?? false,
    isLoading: rollupQuery.isLoading,
    isFetching: rollupQuery.isFetching,
    error: rollupQuery.error,
    expand,
  }
}
