'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { PrintingRowResponse } from '@/lib/collection-printing-utils'
import type { PrintingSortField, SortDirection, ColorIdentityMode } from '@/lib/collection-filters'

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
  includeMissing?: boolean
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
    colors = [],
    colorMode = 'includes',
    includeProxies = false,
    includeMissing = false,
    enabled = true,
  } = params

  // Build query string
  const queryString = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort,
    sortDir,
    includeProxies: String(includeProxies),
    includeMissing: String(includeMissing),
    ...(search ? { search } : {}),
    ...(colors.length > 0 ? { colors: colors.join(','), colorMode } : {}),
  }).toString()

  return useQuery<CollectionPrintingsResponse>({
    queryKey: ['collection', 'printings', page, pageSize, search, sort, sortDir, colors.join(','), colorMode, includeProxies, includeMissing],
    queryFn: async () => {
      const res = await fetch(`/api/collection/printings?${queryString}`)
      if (!res.ok) {
        throw new Error('Failed to load collection data')
      }
      return res.json()
    },
    staleTime: 60 * 1000, // 1 min — pages change frequently during interaction
    placeholderData: (prev) => prev, // Keep previous data visible while loading next page
    enabled,
  })
}
