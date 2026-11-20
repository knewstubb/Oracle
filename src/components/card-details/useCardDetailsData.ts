'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createDeckInvalidators } from '@/hooks/useDeckQueryKeys'
import type { CardDetails } from '@/lib/card-details/load'

export const cardDetailsKey = (deckId: number, cardId: number) => ['card-details', deckId, cardId] as const

/** One request for everything the modal shows. A failed lookup is an error, never an empty answer. */
export function useCardDetailsData(deckId: number, cardId: number) {
  return useQuery<CardDetails>({
    queryKey: cardDetailsKey(deckId, cardId),
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/cards/${cardId}/details`)
      if (!res.ok) throw new Error('details lookup failed')
      return (await res.json()) as CardDetails
    },
    staleTime: 30_000,
    retry: 1,
  })
}

/** After a change: read the modal's data again and refresh the deck's own lists. */
export function useRefreshAfterChange(deckId: number, cardId: number) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: cardDetailsKey(deckId, cardId) })
    createDeckInvalidators(queryClient).invalidateDeck(deckId)
  }
}
