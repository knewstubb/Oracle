/**
 * Collection Screen — sort and status types, and the card status rule
 *
 * Filtering and sorting run on the server (/api/collection/rollup and /api/collection/printings).
 * computeStatus is the one rule for a card's status; the server status filter uses it.
 */

/* ─── Types ─────────────────────────────────────────────────────────── */

export type SortField = 'dateUpdated' | 'dateAdded' | 'quantity' | 'cardName' | 'rarity' | 'price'
export type SortDirection = 'asc' | 'desc'
export type StatusFilter = 'fullyPlaced' | 'partiallyAvailable' | 'unplaced' | 'overAllocated'
export type ColorIdentityMode = 'exact' | 'includes'

/** Sort fields available for the printing-level view. */
export type PrintingSortField = 'cardName' | 'quantity' | 'setCode' | 'price' | 'usedByCount' | 'rarity'

/** Every status, in toolbar order. */
export const STATUS_FILTERS: readonly StatusFilter[] = ['fullyPlaced', 'partiallyAvailable', 'unplaced', 'overAllocated']

/* ─── Constants ─────────────────────────────────────────────────────── */

/** Default sort directions per field (as specified in the design doc). */
export const DEFAULT_SORT_DIRECTIONS: Record<SortField, SortDirection> = {
  dateUpdated: 'desc',
  dateAdded: 'desc',
  quantity: 'desc',
  cardName: 'asc',
  rarity: 'desc',
  price: 'desc',
}

/** Default sort directions for printing-level sort fields. */
export const DEFAULT_PRINTING_SORT_DIRECTIONS: Record<PrintingSortField, SortDirection> = {
  cardName: 'asc',
  quantity: 'desc',
  setCode: 'asc',
  price: 'desc',
  usedByCount: 'desc',
  rarity: 'desc',
}

/* ─── Status ────────────────────────────────────────────────────────── */

/**
 * Computes the status category for a single card based on its
 * ownedQuantity and inUseCount values. The four categories are
 * mutually exclusive and exhaustive for any non-negative integer pair.
 */
export function computeStatus(card: { ownedQuantity: number; inUseCount: number }): StatusFilter {
  const { ownedQuantity, inUseCount } = card
  if (inUseCount > ownedQuantity) return 'overAllocated'
  if (inUseCount === ownedQuantity) return 'fullyPlaced'
  if (inUseCount === 0) return 'unplaced'
  // inUseCount > 0 && inUseCount < ownedQuantity
  return 'partiallyAvailable'
}
