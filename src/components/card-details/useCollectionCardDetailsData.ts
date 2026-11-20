'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createDeckInvalidators } from '@/hooks/useDeckQueryKeys'
import type { CollectionMainDetails } from '@/lib/card-details/load-collection'
import type { Ruling } from '@/lib/card-details/load'

export const collectionCardDetailsKey = (oracleId: string) => ['collection-card-details', oracleId] as const

async function getPart<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('details lookup failed')
  return (await res.json()) as T
}

/** Everything except rulings: the only thing the window waits for. */
export function useCollectionMain(oracleId: string) {
  return useQuery<CollectionMainDetails>({
    queryKey: [...collectionCardDetailsKey(oracleId), 'main'],
    queryFn: () => getPart<CollectionMainDetails>(`/api/collection/instances/${oracleId}/details?part=main`),
    staleTime: 30_000,
    retry: 1,
  })
}

/** Rulings are kept for the whole session. Loaded after the main part, or at once when the Rulings tab is open. */
export function useCollectionRulings(oracleId: string, enabled: boolean) {
  return useQuery<{ rulings: Ruling[] }>({
    queryKey: [...collectionCardDetailsKey(oracleId), 'rulings'],
    queryFn: () => getPart<{ rulings: Ruling[] }>(`/api/collection/instances/${oracleId}/details?part=rulings`),
    enabled,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
  })
}

/** After a change: read the window's data again and refresh the Collection list, storage and the decks involved. */
export function useRefreshCollectionDetails(oracleId: string) {
  const queryClient = useQueryClient()
  return () => {
    // Rulings do not depend on the user's data, so they are not read again.
    void queryClient.invalidateQueries({ queryKey: collectionCardDetailsKey(oracleId), predicate: (q) => q.queryKey[2] !== 'rulings' })
    void queryClient.invalidateQueries({ queryKey: ['collection'] })
    void queryClient.invalidateQueries({ queryKey: ['instances', oracleId] })
    void queryClient.invalidateQueries({ queryKey: ['storage'] })
    // Decks involved are not always known (a move has a source and a target), so refresh every deck view.
    createDeckInvalidators(queryClient).invalidateAll()
    void queryClient.invalidateQueries({ queryKey: ['picklist'] })
    void queryClient.invalidateQueries({ queryKey: ['allocation'] })
  }
}
