'use client'

/** The boxes and decks a card can be sent to. One shared list for the Picklist pages (read only). */
import { useQuery } from '@tanstack/react-query'

export type PlaceOption = {
  value: string
  label: string
  to: { kind: 'deck'; deckId: number } | { kind: 'location'; locationId: number }
}

export function usePlaceOptions() {
  return useQuery<PlaceOption[]>({
    queryKey: ['import', 'destinations'],
    queryFn: async () => {
      const res = await fetch('/api/import/destinations')
      if (!res.ok) return []
      const d = (await res.json()) as { storage?: Array<{ locationId: number; name: string }>; decks?: Array<{ deckId: number; name: string }> }
      return [
        ...(d.storage ?? []).map((b) => ({ value: `l${b.locationId}`, label: `Box: ${b.name}`, to: { kind: 'location' as const, locationId: b.locationId } })),
        ...(d.decks ?? []).map((k) => ({ value: `d${k.deckId}`, label: `Deck: ${k.name}`, to: { kind: 'deck' as const, deckId: k.deckId } })),
      ]
    },
    staleTime: 60_000,
  })
}
