/**
 * Pure Scryfall price parsing for the refresh-prices route (D-040, D-042).
 * Lives outside the route file because Next.js route files may only export
 * route handlers.
 */

export interface ScryfallPriceInfo {
  usd?: string | null
  usd_foil?: string | null
}

export interface ScryfallCollectionCard {
  id: string
  prices?: ScryfallPriceInfo | null
}

export interface PriceUpdate {
  price_usd?: number
  price_usd_foil?: number
}

/**
 * Parses a Scryfall USD price string into a positive, finite number.
 * Returns null for a missing, non-numeric, zero or negative value. A null
 * result must never be written to a price column (D-042).
 */
export function parsePositiveUsd(value: string | null | undefined): number | null {
  if (value == null) return null
  const amount = Number.parseFloat(value)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return amount
}

/**
 * Builds the `ref_printings` update for one Scryfall card. Normal and foil
 * prices live in separate columns and are never mixed. Returns null when the
 * card has no usable price at all.
 */
export function buildPriceUpdate(card: ScryfallCollectionCard): PriceUpdate | null {
  const normal = parsePositiveUsd(card.prices?.usd)
  const foil = parsePositiveUsd(card.prices?.usd_foil)

  const update: PriceUpdate = {}
  if (normal !== null) update.price_usd = normal
  if (foil !== null) update.price_usd_foil = foil

  return Object.keys(update).length > 0 ? update : null
}
