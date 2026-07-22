/**
 * Centralized deck query key factory.
 *
 * Ensures all deck-related query keys use a consistent string type for the deck ID,
 * eliminating the string/number fragility that causes cache misses when invalidating.
 *
 * Usage:
 *   const keys = useDeckQueryKeys(deckId)
 *   useQuery({ queryKey: keys.detail, ... })
 *   queryClient.invalidateQueries({ queryKey: keys.cardStatuses })
 *
 * Or without the hook (for non-component contexts):
 *   import { deckKeys } from '@/hooks/useDeckQueryKeys'
 *   queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) })
 */

import { useMemo } from 'react'

// ---------------------------------------------------------------------------
// Key factory (pure functions — usable anywhere)
// ---------------------------------------------------------------------------

export const deckKeys = {
  /** All decks list */
  all: ['decks'] as const,

  /** Single deck detail */
  detail: (id: string | number) => ['decks', String(id)] as const,

  /** Card statuses for a deck (ownership, allocation) */
  cardStatuses: (id: string | number) => ['decks', String(id), 'card-statuses'] as const,

  /** Health data for a deck */
  health: (id: string | number) => ['decks', String(id), 'health'] as const,

  /** Picklist data for a deck */
  picklist: (id: string | number) => ['picklist', String(id)] as const,

  /** Allocation data for a deck */
  allocation: (id: string | number) => ['allocation', String(id)] as const,
}

// ---------------------------------------------------------------------------
// Hook (for components that have a deckId in scope)
// ---------------------------------------------------------------------------

/**
 * Returns memoized query keys for a specific deck.
 * Always normalizes the deck ID to a string to prevent cache key mismatches.
 */
export function useDeckQueryKeys(deckId: string | number) {
  return useMemo(() => ({
    detail: deckKeys.detail(deckId),
    cardStatuses: deckKeys.cardStatuses(deckId),
    health: deckKeys.health(deckId),
    picklist: deckKeys.picklist(deckId),
    allocation: deckKeys.allocation(deckId),
  }), [deckId])
}
