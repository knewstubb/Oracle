'use client'

import { useQuery } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenericLandPreference {
  cardDefinitionId: number
  cardName: string
  scryfallPrintingId: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Hook: useGenericLandPreferences
// ---------------------------------------------------------------------------

/**
 * Fetches global generic land art preferences (6 rows — one per basic land type).
 * Returns a lookup function to resolve the art URL for a given card_definition_id.
 *
 * Uses TanStack Query with a long stale time since preferences change infrequently.
 */
export function useGenericLandPreferences() {
  const { data: preferences } = useQuery<GenericLandPreference[]>({
    queryKey: ['generic-land-preferences'],
    queryFn: async () => {
      const res = await fetch('/api/settings/generic-land-preferences')
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 min — only changes via Settings UI
  })

  /**
   * Resolve the Scryfall art crop URL for a generic land slot.
   * Returns null if preferences haven't loaded or no match is found.
   */
  function resolveArtUrl(cardDefinitionId: number | null | undefined): string | null {
    if (!cardDefinitionId || !preferences) return null
    const pref = preferences.find((p) => p.cardDefinitionId === cardDefinitionId)
    if (!pref?.scryfallPrintingId) return null
    // Scryfall image API: get art_crop by printing UUID
    return `https://api.scryfall.com/cards/${pref.scryfallPrintingId}?format=image&version=art_crop`
  }

  return { preferences, resolveArtUrl }
}
