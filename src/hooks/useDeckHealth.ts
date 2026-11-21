'use client'
import { useQuery } from '@tanstack/react-query'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { DeckHealthResponse } from '@/lib/deck-health'

/** The deck's six health rows (shared by the rail and the Deck settings window). */
export function useDeckHealth(deckId: number) {
  return useQuery<DeckHealthResponse>({
    queryKey: deckKeys.health(deckId),
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/health`)
      if (!res.ok) throw new Error('Failed to fetch health data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}
