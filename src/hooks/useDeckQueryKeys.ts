/**
 * Standardized query keys for deck-related queries.
 * 
 * Addresses TD-016: Query key fragility — deckId was used as both string and number
 * in different components, causing cache misses and requiring double invalidations.
 * 
 * This hook normalizes deckId to a number and provides typed query key factories.
 * All deck-related queries should use these keys for consistent cache behavior.
 */

/**
 * Normalize deckId to a number for consistent query key typing.
 * Accepts string | number and always returns number.
 */
function normalizeDeckId(deckId: string | number): number {
  return typeof deckId === 'string' ? parseInt(deckId, 10) : deckId
}

/**
 * Query key factories for deck-related queries.
 * Use these instead of inline query key arrays.
 */
export const deckKeys = {
  /** All decks list: ['decks'] */
  all: ['decks'] as const,

  /** Single deck: ['decks', deckId] */
  detail: (deckId: string | number) => ['decks', normalizeDeckId(deckId)] as const,

  /** Card statuses for a deck: ['decks', deckId, 'card-statuses'] */
  cardStatuses: (deckId: string | number) => ['decks', normalizeDeckId(deckId), 'card-statuses'] as const,

  /** Health metrics for a deck: ['decks', deckId, 'health'] */
  health: (deckId: string | number) => ['decks', normalizeDeckId(deckId), 'health'] as const,

  /** Picklist for a deck: ['picklist', deckId] */
  picklist: (deckId: string | number) => ['picklist', normalizeDeckId(deckId)] as const,

  /** Allocation data for a deck: ['allocation', deckId] */
  allocation: (deckId: string | number) => ['allocation', normalizeDeckId(deckId)] as const,

  /** Card actions context: ['card-actions', deckId, cardName] */
  cardActions: (deckId: string | number, cardName: string) => 
    ['card-actions', normalizeDeckId(deckId), cardName] as const,
}

/**
 * Hook for invalidating all deck-related queries.
 * Call with a queryClient to get an invalidation helper.
 */
export function createDeckInvalidators(queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => void }) {
  return {
    /** Invalidate all deck queries (list + all details) */
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: deckKeys.all })
    },

    /** Invalidate a single deck and all its related queries */
    invalidateDeck: (deckId: string | number) => {
      queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) })
      queryClient.invalidateQueries({ queryKey: deckKeys.cardStatuses(deckId) })
      queryClient.invalidateQueries({ queryKey: deckKeys.health(deckId) })
      queryClient.invalidateQueries({ queryKey: deckKeys.picklist(deckId) })
      queryClient.invalidateQueries({ queryKey: deckKeys.allocation(deckId) })
    },

    /** Invalidate card status and picklist (common after allocation changes) */
    invalidateCardState: (deckId: string | number) => {
      queryClient.invalidateQueries({ queryKey: deckKeys.cardStatuses(deckId) })
      queryClient.invalidateQueries({ queryKey: deckKeys.picklist(deckId) })
    },
  }
}

/**
 * React hook version — call within a component to get invalidation helpers.
 * Requires useQueryClient from @tanstack/react-query.
 */
export function useDeckInvalidators() {
  // Import dynamically to avoid circular deps — caller should use this in a component
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useQueryClient } = require('@tanstack/react-query')
  const queryClient = useQueryClient()
  return createDeckInvalidators(queryClient)
}
