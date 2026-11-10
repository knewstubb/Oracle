import { deckKeys } from '@/hooks/useDeckQueryKeys'

/**
 * Shared query options for GET /api/decks/[id]/card-statuses. The deck page
 * prefetches this alongside the deck query and CardsTab reads it, so both use
 * the same cache entry (no waterfall, no second source).
 */
export function cardStatusesQueryOptions(deckId: string | number) {
  return {
    queryKey: deckKeys.cardStatuses(deckId),
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/card-statuses`)
      if (!res.ok) throw new Error('Failed to fetch card statuses')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  }
}
