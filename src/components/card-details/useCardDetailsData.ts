'use client'
import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createDeckInvalidators } from '@/hooks/useDeckQueryKeys'
import type { DeckCollectionPart, DeckOverview, RulingsPart } from '@/lib/card-details/load'

/** Every part of one card's window starts with this key, so one invalidation refreshes all of them. */
export const cardDetailsKey = (deckId: number, cardId: number) => ['card-details', deckId, cardId] as const

const base = (deckId: number, cardId: number) => `/api/decks/${deckId}/cards/${cardId}/details`

async function getPart<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('details lookup failed')
  return (await res.json()) as T
}

/** Overview, rail and header: the only thing the window waits for. */
export const deckOverviewOptions = (deckId: number, cardId: number) =>
  queryOptions({
    queryKey: [...cardDetailsKey(deckId, cardId), 'overview'] as const,
    queryFn: () => getPart<DeckOverview>(`${base(deckId, cardId)}?part=overview`),
    staleTime: 30_000,
    retry: 1,
  })

/** Printings and copies (they share one read of the user's copies). Loaded after the Overview, or when their tab opens. */
export const deckCollectionOptions = (deckId: number, cardId: number, oracleId: string | null | undefined) =>
  queryOptions({
    queryKey: [...cardDetailsKey(deckId, cardId), 'collection', oracleId ?? null] as const,
    queryFn: () => getPart<DeckCollectionPart>(`${base(deckId, cardId)}?part=collection&oracleId=${encodeURIComponent(oracleId!)}`),
    staleTime: 30_000,
    retry: 1,
  })

/** Rulings never change while the app is open, so they are kept for the whole session. */
export const deckRulingsOptions = (deckId: number, cardId: number, oracleId: string | null | undefined) =>
  queryOptions({
    queryKey: [...cardDetailsKey(deckId, cardId), 'rulings', oracleId ?? null] as const,
    queryFn: () => getPart<RulingsPart>(`${base(deckId, cardId)}?part=rulings&oracleId=${encodeURIComponent(oracleId!)}`),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
  })

export function useDeckOverview(deckId: number, cardId: number) {
  return useQuery(deckOverviewOptions(deckId, cardId))
}

/** `enabled` is false until the Overview has told us the card's oracle id. */
export function useDeckCollection(deckId: number, cardId: number, oracleId: string | null | undefined, enabled: boolean) {
  return useQuery({ ...deckCollectionOptions(deckId, cardId, oracleId), enabled: enabled && !!oracleId })
}

export function useDeckRulings(deckId: number, cardId: number, oracleId: string | null | undefined, enabled: boolean) {
  return useQuery({ ...deckRulingsOptions(deckId, cardId, oracleId), enabled: enabled && !!oracleId })
}

/** Start the Overview read before the click (hover or focus on a card name). Does nothing if it is already fresh. */
export function prefetchDeckOverview(queryClient: QueryClient, deckId: number, cardId: number) {
  void queryClient.prefetchQuery(deckOverviewOptions(deckId, cardId))
}

/** After a change: read the modal's data again and refresh the deck's own lists. */
export function useRefreshAfterChange(deckId: number, cardId: number) {
  const queryClient = useQueryClient()
  return () => {
    // Rulings do not depend on the user's data, so they are not read again.
    void queryClient.invalidateQueries({ queryKey: cardDetailsKey(deckId, cardId), predicate: (q) => q.queryKey[3] !== 'rulings' })
    createDeckInvalidators(queryClient).invalidateDeck(deckId)
  }
}
