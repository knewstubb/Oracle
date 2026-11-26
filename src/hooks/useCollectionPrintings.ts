'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { PrintingRowResponse } from '@/lib/collection-printing-utils'
import type { PrintingSortField, SortDirection, ColorIdentityMode, StatusFilter } from '@/lib/collection-filters'

// ---------------------------------------------------------------------------
// Types (mirrors API response shape from /api/collection/printings)
// ---------------------------------------------------------------------------

export interface CollectionPrintingsResponse {
  rows: PrintingRowResponse[]
  totalCount: number
  page: number
  pageSize: number
  lastPriceRefresh: string | null
  isPriceStale: boolean
}

// ---------------------------------------------------------------------------
// Pagination params
// ---------------------------------------------------------------------------

export interface CollectionPrintingsParams {
  page?: number
  pageSize?: number
  search?: string
  sort?: PrintingSortField
  sortDir?: SortDirection
  colors?: string[]
  colorMode?: ColorIdentityMode
  includeProxies?: boolean
  /** Only Basic cards (Basic supertype). */
  basic?: boolean
  /** Tag keys the card must have (stored keys), and whether it needs all of them or any. */
  tags?: string[]
  tagsMatch?: 'all' | 'any'
  /** Card statuses to show (any of); empty = all cards. */
  statuses?: StatusFilter[]
  enabled?: boolean
}

// ---------------------------------------------------------------------------
// Hook: useCollectionPrintings
// ---------------------------------------------------------------------------

/**
 * Fetches paginated printing-level data for the collection screen.
 * Passes search/sort/filter params to the server — only fetches the current page.
 *
 * Validates: Requirements 1.3, 4.3
 */
export function useCollectionPrintings(params: CollectionPrintingsParams = {}): UseQueryResult<CollectionPrintingsResponse> {
  const {
    page = 1,
    pageSize = 100,
    search = '',
    sort = 'cardName',
    sortDir = 'asc',
    colors: colorsParam = [],
    colorMode = 'includes',
    includeProxies = false,
    basic = false,
    tags: tagsParam = [],
    tagsMatch = 'all',
    statuses: statusesParam = [],
    enabled = true,
  } = params

  // Same colours in any click order are the same request (and the same cache entry)
  const colors = [...colorsParam].sort()
  const tags = [...tagsParam].sort()
  const statuses = [...statusesParam].sort()
  // Build query string
  const queryString = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort,
    sortDir,
    includeProxies: String(includeProxies),
    ...(search ? { search } : {}),
    ...(basic ? { basic: 'true' } : {}),
    ...(colors.length > 0 ? { colors: colors.join(','), colorMode } : {}),
    ...(tags.length > 0 ? { tags: tags.join(','), tagsMatch } : {}),
    ...(statuses.length > 0 ? { status: statuses.join(',') } : {}),
  }).toString()

  return useQuery<CollectionPrintingsResponse>({
    queryKey: ['collection', 'printings', page, pageSize, search, sort, sortDir, colors.join(','), colorMode, includeProxies, basic, tags.join(','), tagsMatch, statuses.join(',')],
    queryFn: async ({ signal }) => {
      // signal: a request that is no longer wanted (the filter changed again) is cancelled
      const res = await fetch(`/api/collection/printings?${queryString}`, { signal })
      if (!res.ok) {
        throw new Error('Failed to load collection data')
      }
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 min — collection data is relatively stable
    gcTime: 60 * 60 * 1000, // 1 hour — keep in memory for fast navigation
    placeholderData: (prev) => prev, // Keep previous data visible while loading next page
    refetchOnWindowFocus: false, // Don't refetch on tab switch
    enabled,
  })
}
