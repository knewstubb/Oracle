'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createDeckInvalidators } from '@/hooks/useDeckQueryKeys'
import type { CollectionCardDetails } from '@/lib/card-details/load-collection'

export const collectionCardDetailsKey = (oracleId: string) => ['collection-card-details', oracleId] as const

/** One request for everything the collection window shows. A failed lookup is an error, never an empty answer. */
export function useCollectionCardDetailsData(oracleId: string) {
  return useQuery<CollectionCardDetails>({
    queryKey: collectionCardDetailsKey(oracleId),
    queryFn: async () => {
      const res = await fetch(`/api/collection/instances/${oracleId}/details`)
      if (!res.ok) throw new Error('details lookup failed')
      return (await res.json()) as CollectionCardDetails
    },
    staleTime: 30_000,
    retry: 1,
  })
}

/** After a change: read the window's data again and refresh the Collection list, storage and the decks involved. */
export function useRefreshCollectionDetails(oracleId: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: collectionCardDetailsKey(oracleId) })
    void queryClient.invalidateQueries({ queryKey: ['collection'] })
    void queryClient.invalidateQueries({ queryKey: ['instances', oracleId] })
    void queryClient.invalidateQueries({ queryKey: ['storage'] })
    // Decks involved are not always known (a move has a source and a target), so refresh every deck view.
    createDeckInvalidators(queryClient).invalidateAll()
    void queryClient.invalidateQueries({ queryKey: ['picklist'] })
    void queryClient.invalidateQueries({ queryKey: ['allocation'] })
  }
}
