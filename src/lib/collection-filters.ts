/**
 * Collection Screen — Filter, Sort, and Status utilities
 *
 * Pure functions for client-side filtering, sorting, and status computation
 * on the collection card-level rollup data. These are framework-agnostic
 * (no React, no DB, no side effects) and independently testable.
 */

/* ─── Types ─────────────────────────────────────────────────────────── */

export type SortField = 'dateUpdated' | 'dateAdded' | 'quantity' | 'cardName' | 'rarity' | 'price'
export type SortDirection = 'asc' | 'desc'
export type StatusFilter = 'fullyPlaced' | 'partiallyAvailable' | 'unplaced' | 'overAllocated'
export type ColorIdentityMode = 'exact' | 'includes'

/** Represents a card-level rollup row from the collection API. */
export interface CollectionCardRow {
  cardDefinitionId: number
  cardName: string
  oracleId: string
  colorIdentity: string[] // e.g. ['W','U'] or [] for colorless
  isBasicLand: boolean
  ownedQuantity: number
  inUseCount: number
  priceToAdd: number | null
  /** Optional sort-assist fields (populated by the rollup query) */
  dateUpdated?: string | null
  dateAdded?: string | null
  rarity?: string | null // 'mythic' | 'rare' | 'uncommon' | 'common'
}

/* ─── Constants ─────────────────────────────────────────────────────── */

/** Rarity ordering: higher numeric value = rarer. Used for descending sort. */
const RARITY_ORDER: Record<string, number> = {
  mythic: 4,
  rare: 3,
  uncommon: 2,
  common: 1,
}

/** Default sort directions per field (as specified in the design doc). */
export const DEFAULT_SORT_DIRECTIONS: Record<SortField, SortDirection> = {
  dateUpdated: 'desc',
  dateAdded: 'desc',
  quantity: 'desc',
  cardName: 'asc',
  rarity: 'desc',
  price: 'desc',
}

/* ─── Search ────────────────────────────────────────────────────────── */

/**
 * Filters cards by case-insensitive substring match on card name.
 * Returns all cards when query is empty or whitespace-only.
 */
export function filterBySearch(cards: CollectionCardRow[], query: string): CollectionCardRow[] {
  const trimmed = query.trim()
  if (trimmed === '') return cards
  const lowerQuery = trimmed.toLowerCase()
  return cards.filter((card) => card.cardName.toLowerCase().includes(lowerQuery))
}

/* ─── Status ────────────────────────────────────────────────────────── */

/**
 * Computes the status category for a single card based on its
 * ownedQuantity and inUseCount values. The four categories are
 * mutually exclusive and exhaustive for any non-negative integer pair.
 */
export function computeStatus(card: Pick<CollectionCardRow, 'ownedQuantity' | 'inUseCount'>): StatusFilter {
  const { ownedQuantity, inUseCount } = card

  if (inUseCount > ownedQuantity) return 'overAllocated'
  if (inUseCount === ownedQuantity) return 'fullyPlaced'
  if (inUseCount === 0) return 'unplaced'
  // inUseCount > 0 && inUseCount < ownedQuantity
  return 'partiallyAvailable'
}

/**
 * Filters cards to only those matching the given status category.
 */
export function filterByStatus(cards: CollectionCardRow[], status: StatusFilter): CollectionCardRow[] {
  return cards.filter((card) => computeStatus(card) === status)
}

/* ─── Color Identity ────────────────────────────────────────────────── */

/**
 * Filters cards by color identity using one of two modes:
 *
 * - **Exact Identity**: card's color identity set equals the selected set exactly.
 * - **Includes These**: selected set is a subset of the card's color identity
 *   (the card contains at least the selected colors, possibly more).
 *
 * When `colors` is empty, all cards pass (filter inactive).
 */
export function filterByColorIdentity(
  cards: CollectionCardRow[],
  colors: string[],
  mode: ColorIdentityMode
): CollectionCardRow[] {
  if (colors.length === 0) return cards

  // Deduplicate selected colors
  const selectedArr = Array.from(new Set(colors.map((c) => c.toUpperCase())))

  if (mode === 'exact') {
    return cards.filter((card) => {
      const cardSet = new Set(card.colorIdentity.map((c) => c.toUpperCase()))
      if (cardSet.size !== selectedArr.length) return false
      return selectedArr.every((color) => cardSet.has(color))
    })
  }

  // 'includes' mode: selected colors are a subset of the card's color identity
  return cards.filter((card) => {
    const cardSet = new Set(card.colorIdentity.map((c) => c.toUpperCase()))
    return selectedArr.every((color) => cardSet.has(color))
  })
}

/* ─── Sort ──────────────────────────────────────────────────────────── */

/**
 * Sorts cards by the specified field and direction.
 * Returns a new sorted array (does not mutate the input).
 *
 * Special behavior for Price sort: null values always sort last
 * regardless of direction (ascending or descending).
 */
export function sortCards(
  cards: CollectionCardRow[],
  field: SortField,
  direction: SortDirection
): CollectionCardRow[] {
  const sorted = [...cards]
  const dir = direction === 'asc' ? 1 : -1

  sorted.sort((a, b) => {
    const aVal = getSortValue(a, field)
    const bVal = getSortValue(b, field)

    // Null-last behavior for price field (and any nullable field)
    if (field === 'price') {
      if (aVal === null && bVal === null) return 0
      if (aVal === null) return 1 // a goes after b (last)
      if (bVal === null) return -1 // b goes after a (last)
    }

    // String comparison for cardName
    if (field === 'cardName') {
      const aStr = (aVal as string) ?? ''
      const bStr = (bVal as string) ?? ''
      return dir * aStr.localeCompare(bStr)
    }

    // Numeric comparison for everything else
    const aNum = aVal as number ?? 0
    const bNum = bVal as number ?? 0
    return dir * (aNum - bNum)
  })

  return sorted
}

/**
 * Extracts the comparable value for sorting from a card row.
 */
function getSortValue(card: CollectionCardRow, field: SortField): string | number | null {
  switch (field) {
    case 'dateUpdated':
      return card.dateUpdated ? new Date(card.dateUpdated).getTime() : 0
    case 'dateAdded':
      return card.dateAdded ? new Date(card.dateAdded).getTime() : 0
    case 'quantity':
      return card.ownedQuantity
    case 'cardName':
      return card.cardName.toLowerCase()
    case 'rarity':
      return RARITY_ORDER[card.rarity?.toLowerCase() ?? ''] ?? 0
    case 'price':
      return card.priceToAdd
    default:
      return 0
  }
}
