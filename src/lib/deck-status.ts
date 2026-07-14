// ---------------------------------------------------------------------------
// Deck Status — Shared Type Definitions
// ---------------------------------------------------------------------------

/**
 * The three valid lifecycle states for a deck.
 * - brew: under construction, excluded from allocation
 * - boxed: fully built, assignments locked, resolver must not touch
 * - archived: shelved/retired, excluded from allocation
 */
export type DeckStatus = 'brew' | 'boxed' | 'archived'

/** Ordered list of all valid deck status values. */
export const VALID_STATUSES: readonly DeckStatus[] = ['brew', 'boxed', 'archived'] as const

/**
 * Type guard that narrows an unknown string to a valid DeckStatus.
 */
export function isValidStatus(value: string): value is DeckStatus {
  return (VALID_STATUSES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// API Request / Response Interfaces
// ---------------------------------------------------------------------------

/** Request body for PATCH /api/decks/[id]/status */
export interface StatusUpdateRequest {
  status: DeckStatus
}

/** Response body for PATCH /api/decks/[id]/status */
export interface StatusUpdateResponse {
  deck: {
    id: number
    name: string
    status: DeckStatus
  }
  allocationRerun: boolean
}
