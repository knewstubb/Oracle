// ---------------------------------------------------------------------------
// Deck Status — Shared Type Definitions
// ---------------------------------------------------------------------------

/**
 * The three valid lifecycle states for a deck.
 * - brewing: under construction, being built or reworked
 * - in_rotation: committed to active decks, may or may not be fully claimed
 * - graveyard: retired/shelved, no longer active
 */
export type DeckStatus = 'brewing' | 'in_rotation' | 'graveyard'

/** Ordered list of all valid deck status values. */
export const VALID_STATUSES: readonly DeckStatus[] = ['brewing', 'in_rotation', 'graveyard'] as const

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
