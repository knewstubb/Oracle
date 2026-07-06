'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { PrintingRowResponse } from '@/lib/collection-printing-utils'

// ---------------------------------------------------------------------------
// Types (mirrors API response shape from /api/collection/printings)
// ---------------------------------------------------------------------------

export interface CollectionPrintingsResponse {
  rows: PrintingRowResponse[]
  lastPriceRefresh: string | null
  isPriceStale: boolean
}

// ---------------------------------------------------------------------------
// Hook: useCollectionPrintings
// ---------------------------------------------------------------------------

/**
 * Fetches flat printing-level data for the collection screen.
 * Each row represents a unique combination of card name, scryfall_printing_id,
 * and finish. Uses TanStack Query with a 5-minute stale time for caching.
 *
 * Validates: Requirements 1.3, 4.3
 */
export function useCollectionPrintings(): UseQueryResult<CollectionPrintingsResponse> {
  return useQuery<CollectionPrintingsResponse>({
    queryKey: ['collection', 'printings'],
    queryFn: () => fetch('/api/collection/printings').then((r) => r.json()),
    staleTime: 5 * 60 * 1000, // 5 min — collection data only changes on sync
  })
}
