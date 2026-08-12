// ---------------------------------------------------------------------------
// Deck Status — Legacy Type Definitions
// ---------------------------------------------------------------------------

/**
 * @deprecated The deck lifecycle now uses `is_active: boolean` instead of this enum.
 * These values are kept for backward compatibility with existing data but should
 * not be used for new logic. Use `deck.is_active` instead.
 * 
 * Legacy states (no longer used for new functionality):
 * - brewing: under construction
 * - in_rotation: committed to active decks (now replaced by is_active=true)
 * - graveyard: retired/shelved
 */
export type DeckStatus = 'brewing' | 'in_rotation' | 'graveyard'

/** 
 * @deprecated Use `deck.is_active` instead.
 * Ordered list of all valid deck status values. 
 */
export const VALID_STATUSES: readonly DeckStatus[] = ['brewing', 'in_rotation', 'graveyard'] as const

/**
 * @deprecated Use `deck.is_active` instead.
 * Type guard that narrows an unknown string to a valid DeckStatus.
 */
export function isValidStatus(value: string): value is DeckStatus {
  return (VALID_STATUSES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Legacy API Request / Response Interfaces
// ---------------------------------------------------------------------------

/** 
 * @deprecated The status endpoint is being phased out. Use PATCH /api/decks/[id]/active instead.
 * Request body for PATCH /api/decks/[id]/status 
 */
export interface StatusUpdateRequest {
  status: DeckStatus
}

/** 
 * @deprecated The status endpoint is being phased out. Use PATCH /api/decks/[id]/active instead.
 * Response body for PATCH /api/decks/[id]/status 
 */
export interface StatusUpdateResponse {
  deck: {
    id: number
    name: string
    status: DeckStatus
  }
  allocationRerun: boolean
}
