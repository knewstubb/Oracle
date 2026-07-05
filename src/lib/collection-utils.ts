/**
 * Collection Allocation Expansion — Pure utility functions
 *
 * These functions handle filtering, pagination, string abbreviation,
 * pagination range generation, and status badge determination for the
 * Collection Allocation tab. They are pure (no React, no DB, no side effects)
 * and independently testable.
 */

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface AllocationDeck {
  deckId: number
  deckName: string
  status: 'original' | 'proxy' | null
}

export interface AllocationRow {
  cardName: string
  typeLine: string | null
  isConflict: boolean
  decks: AllocationDeck[]
  ownedCopies: number
  totalDemand: number
}

export interface FilterFlags {
  conflicts: boolean
  proxies: boolean
  notInDeck: boolean
}

export interface StatusResult {
  label: string
  variant: 'teal' | 'amber' | 'muted'
}

/* ─── Constants ─────────────────────────────────────────────────────── */

export const PAGE_SIZE = 100

/* ─── Functions ─────────────────────────────────────────────────────── */

/**
 * Filters an array of AllocationRow objects using AND semantics.
 * Each active flag further restricts the result set (intersection).
 *
 * - conflicts: only cards with isConflict === true
 * - proxies: only cards with at least one deck entry having status === 'proxy'
 * - notInDeck: only cards with totalDemand === 0
 */
export function filterCards(cards: AllocationRow[], filters: FilterFlags): AllocationRow[] {
  let result = cards
  if (filters.conflicts) {
    result = result.filter((c) => c.isConflict)
  }
  if (filters.proxies) {
    result = result.filter((c) => c.decks.some((d) => d.status === 'proxy'))
  }
  if (filters.notInDeck) {
    result = result.filter((c) => c.totalDemand === 0)
  }
  return result
}

/**
 * Returns the slice of cards for the given page number.
 * Pages are 1-indexed. Returns an empty array when page exceeds valid range.
 */
export function paginateCards(cards: AllocationRow[], page: number, pageSize: number): AllocationRow[] {
  return cards.slice((page - 1) * pageSize, page * pageSize)
}

/**
 * Truncates a string to `max` characters, appending '…' if truncation occurs.
 * The returned string is never longer than `max` characters.
 */
export function abbreviate(name: string, max: number = 8): string {
  if (name.length <= max) return name
  return name.slice(0, max - 1) + '…'
}

/**
 * Generates a pagination range array for rendering page buttons.
 * Returns page numbers and '...' ellipsis placeholders.
 *
 * - If total <= 5, returns all page numbers [1..total]
 * - Otherwise, always includes first and last page with context around current
 */
export function getPaginationRange(current: number, total: number): (number | '...')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | '...')[] = [1]

  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (current < total - 2) pages.push('...')

  pages.push(total)

  return pages
}

/**
 * Determines the status badge label and variant for a card row.
 *
 * Priority order:
 * 1. totalDemand === 0 → "● Not in a deck" (muted)
 * 2. isConflict OR proxyCount > 0 → "◐ N orig · N proxy" (amber)
 * 3. origCount > 1 → "● Multiple copies" (teal)
 * 4. default → "● Original" (teal)
 */
export function determineStatus(card: {
  isConflict: boolean
  totalDemand: number
  ownedCopies: number
  decks: { status: string | null }[]
}): StatusResult {
  const origCount = card.decks.filter((d) => d.status === 'original').length
  const proxyCount = card.decks.filter((d) => d.status === 'proxy').length

  if (card.totalDemand === 0) {
    return { label: '● Not in a deck', variant: 'muted' }
  }
  if (card.isConflict || proxyCount > 0) {
    return { label: `◐ ${origCount} orig · ${proxyCount} proxy`, variant: 'amber' }
  }
  if (origCount > 1) {
    return { label: '● Multiple copies', variant: 'teal' }
  }
  return { label: '● Original', variant: 'teal' }
}
