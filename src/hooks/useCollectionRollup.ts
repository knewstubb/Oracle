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
  lastPriceRefresh: string | null
  isPriceStale: boolean
}

// ---------------------------------------------------------------------------
// Hook: useCollectionRollup
// ---------------------------------------------------------------------------

/**
 * Fetches card-level rollup data for the collection screen.
 * Uses TanStack Query with a 5-minute stale time for caching.
 *
 * Provides an `expand` function that lazily fetches printing subgroup details
 * for a specific card_definition from /api/collection/rollup/[id].
 *
 * Validates: Requirements 1.4, 9.2, 9.3
 */
export function useCollectionRollup(tab: 'collection' | 'proxies' = 'collection') {
  const queryClient = useQueryClient()

  // Main rollup query
  const rollupQuery = useQuery<CollectionRollupResponse>({
    queryKey: ['collection', 'rollup', tab],
    queryFn: async () => {
      const res = await fetch(`/api/collection/rollup?tab=${tab}`)
      if (!res.ok) {
        throw new Error('Failed to load collection data')
      }
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 min — collection data only changes on sync
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
    lastPriceRefresh: rollupQuery.data?.lastPriceRefresh ?? null,
    isPriceStale: rollupQuery.data?.isPriceStale ?? false,
    isLoading: rollupQuery.isLoading,
    error: rollupQuery.error,
    expand,
  }
}
