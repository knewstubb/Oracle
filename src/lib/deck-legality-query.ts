import { deckKeys } from '@/hooks/useDeckQueryKeys'
import type { LegalityIssue } from '@/lib/deck-legality'

export interface LegalityResponse {
  format: string
  isLegal: boolean
  issues: LegalityIssue[]
}

/**
 * Shared query options for GET /api/decks/[id]/legality. LegalityBanner and the deck rail both read
 * this one cache entry, so the page makes a single request.
 */
export function legalityQueryOptions(deckId: string | number) {
  return {
    queryKey: deckKeys.legality(deckId),
    queryFn: async (): Promise<LegalityResponse> => {
      const res = await fetch(`/api/decks/${deckId}/legality`)
      if (!res.ok) throw new Error('Failed to check legality')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
    retry: false as const,
  }
}
