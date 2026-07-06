/**
 * Collection Printing View — Pure utility functions
 *
 * Formatters, grouping logic, and helpers for the flat printing-level
 * collection view. All functions are pure (no side effects, no DB, no React).
 */

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface DeckReference {
  deckId: number
  deckName: string
  /** Allocation role: 'original' = real card in this deck, 'proxy' = printed proxy, 'unmet' = no copy available */
  role: 'original' | 'proxy' | 'unmet'
}

export interface PrintingRowResponse {
  id: number
  cardName: string
  scryfallPrintingId: string
  setCode: string
  setName: string
  isFoil: boolean
  quantity: number
  colorIdentity: string[]
  usedByCount: number
  usedByDecks: DeckReference[]
  price: number | null
  /** Whether this row represents proxy copies (not real Magic cards) */
  isProxy: boolean
  /** Number of owned original copies (across all printings of this card) */
  originalQty: number
  /** Number of printed proxy copies (across all printings of this card) */
  proxyQty: number
  /** Total supply = originalQty + proxyQty */
  totalSupply: number
  /** Number of active decks demanding this card */
  activeDemand: number
  /** Allocation state: 'clean' | 'proxied' | 'overallocated' | 'unallocated' */
  allocationState: 'clean' | 'proxied' | 'overallocated' | 'unallocated'
}

/** Raw input type for the grouping function. */
export interface RawPhysicalCopy {
  id: number
  cardName: string
  scryfallPrintingId: string
  setCode: string
  setName: string
  isFoil: boolean
  quantity: number
  colorIdentity: string[]
  usedByCount: number
  usedByDecks: DeckReference[]
  price: number | null
  /** Whether this physical copy is a proxy */
  isProxy: boolean
}

/* ─── Price Formatting ──────────────────────────────────────────────── */

/**
 * Formats a price as USD with two decimal places and comma thousands separator.
 * Returns "—" (em dash) for null values.
 */
export function formatPrice(price: number | null): string {
  if (price === null) return '—'
  return price.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/* ─── Name Truncation ───────────────────────────────────────────────── */

/**
 * Truncates a card name to maxLength characters followed by "…" if it exceeds
 * the limit. Returns the original string unchanged if within the limit.
 */
export function truncateName(name: string, maxLength: number = 40): string {
  if (name.length <= maxLength) return name
  return name.slice(0, maxLength) + '…'
}

/* ─── Overallocation Detection ──────────────────────────────────────── */

/**
 * Returns true if a printing is allocated to more decks than the owned quantity.
 */
export function isOverallocated(quantity: number, usedByCount: number): boolean {
  return usedByCount > quantity
}

/* ─── Tooltip Content ───────────────────────────────────────────────── */

/**
 * Produces the tooltip content for a Used By cell.
 * Sorts deck names alphabetically, caps visible list at 20,
 * and computes remaining count.
 */
export function getTooltipContent(decks: DeckReference[]): {
  visibleDecks: string[]
  remainingCount: number
} {
  const sorted = [...decks].sort((a, b) => a.deckName.localeCompare(b.deckName))
  const visibleDecks = sorted.slice(0, 20).map((d) => d.deckName)
  const remainingCount = Math.max(0, sorted.length - 20)
  return { visibleDecks, remainingCount }
}

/* ─── Row Grouping ──────────────────────────────────────────────────── */

/**
 * Groups an array of RawPhysicalCopy by the unique combination of
 * (cardName, scryfallPrintingId, isFoil, isProxy). For each group, produces one
 * PrintingRowResponse with quantity = sum of all matching quantities.
 * Other fields come from the first entry in the group.
 *
 * Note: allocation-level fields (originalQty, proxyQty, totalSupply, activeDemand, allocationState)
 * are set to defaults here and must be populated by the caller after grouping,
 * since they require card-level aggregation across all printings.
 */
export function groupPhysicalCopiesToPrintingRows(
  copies: RawPhysicalCopy[]
): PrintingRowResponse[] {
  const groupMap = new Map<string, PrintingRowResponse>()

  for (const copy of copies) {
    const key = `${copy.cardName}||${copy.scryfallPrintingId}||${copy.isFoil}||${copy.isProxy}`

    const existing = groupMap.get(key)
    if (existing) {
      existing.quantity += copy.quantity
    } else {
      groupMap.set(key, {
        id: copy.id,
        cardName: copy.cardName,
        scryfallPrintingId: copy.scryfallPrintingId,
        setCode: copy.setCode,
        setName: copy.setName,
        isFoil: copy.isFoil,
        quantity: copy.quantity,
        colorIdentity: copy.colorIdentity,
        usedByCount: copy.usedByCount,
        usedByDecks: copy.usedByDecks,
        price: copy.price,
        isProxy: copy.isProxy,
        // Allocation-level fields — populated by caller after grouping
        originalQty: 0,
        proxyQty: 0,
        totalSupply: 0,
        activeDemand: 0,
        allocationState: 'unallocated',
      })
    }
  }

  return Array.from(groupMap.values())
}

/**
 * Computes the allocation state for a card based on its supply and demand.
 * - 'clean': demand ≤ originals (all covered by real cards)
 * - 'proxied': demand > originals but ≤ totalSupply (proxies cover the gap)
 * - 'overallocated': demand > totalSupply (need to buy or print more)
 * - 'unallocated': demand = 0 (not in any active deck)
 */
export function computeAllocationState(
  originalQty: number,
  proxyQty: number,
  activeDemand: number
): 'clean' | 'proxied' | 'overallocated' | 'unallocated' {
  if (activeDemand === 0) return 'unallocated'
  const totalSupply = originalQty + proxyQty
  if (activeDemand <= originalQty) return 'clean'
  if (activeDemand <= totalSupply) return 'proxied'
  return 'overallocated'
}

/* ─── Price Lookup ──────────────────────────────────────────────────── */

/**
 * Looks up the price for a specific printing and foil status.
 * The key format is `${scryfallPrintingId}:${isFoil ? 'foil' : 'normal'}`.
 * Returns null if no entry exists.
 */
export function lookupPrice(
  priceMap: Map<string, number>,
  scryfallPrintingId: string,
  isFoil: boolean
): number | null {
  const key = `${scryfallPrintingId}:${isFoil ? 'foil' : 'normal'}`
  const price = priceMap.get(key)
  return price !== undefined ? price : null
}
