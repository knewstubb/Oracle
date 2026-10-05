/**
 * Card Price Data Access Layer
 *
 * Manages price lookups from the `ref_printings` table which stores Scryfall
 * pricing data (price_usd, price_usd_foil, price_eur, price_eur_foil).
 *
 * Provides functions for:
 * - Computing Price_To_Add (cheapest listing across all printings via oracle_id)
 * - Looking up Owned_Valuation (specific printing + foil status)
 * - Checking price data freshness (>48h = stale)
 *
 * Basic Land Detection: Any card with "Basic" in the type_line supertype
 * returns null for all price lookups — basic lands have near-zero market
 * value and displaying prices adds noise.
 *
 * Validates: Requirements 1.1, 1.4, 2.1, 2.2, 2.4, 2.5, 3.1, 3.3, 3.4, 3.5
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriceEntry {
  scryfallPrintingId: string
  priceRetail: number
  isFoil: boolean
  updatedAt: string
}

export interface PriceToAddResult {
  cardDefinitionId: number
  minPrice: number | null // null = no price exists
}

export interface OwnedValuationResult {
  physicalCopyId: number
  price: number | null // null = no price for this printing+foil combo
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Price data is considered stale after 48 hours */
const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Owned Valuation
// ---------------------------------------------------------------------------

/**
 * Get Owned_Valuation for a specific printing + foil status.
 * Direct lookup by scryfall_id from ref_printings.
 *
 * Returns null if:
 * - No price exists for this printing + foil combo
 * - Foil lookup uses price_usd_foil, non-foil uses price_usd
 */
export async function getOwnedValuation(
  scryfallPrintingId: string,
  isFoil: boolean
): Promise<number | null> {
  const supabase = createAdminClient()
  const priceColumn = isFoil ? 'price_usd_foil' : 'price_usd'
  
  const { data, error } = await supabase
    .from('ref_printings')
    .select(priceColumn)
    .eq('scryfall_id', scryfallPrintingId)
    .maybeSingle()

  if (error) {
    console.error(`Failed to get owned valuation for ${scryfallPrintingId}:`, error.message)
    return null
  }

  return (data as Record<string, number | null> | null)?.[priceColumn] ?? null
}

// ---------------------------------------------------------------------------
// Freshness / Staleness
// ---------------------------------------------------------------------------

/**
 * Get the last successful refresh timestamp.
 * Returns the most recent updated_at value from the ref_printings table.
 * Returns null if the table is empty (never synced).
 */
export async function getLastRefreshTimestamp(): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('ref_printings')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    // Table might not exist yet — treat as "never refreshed"
    if (error.message.includes('schema cache') || error.code === '42P01') {
      console.warn('[price-store] ref_printings table not found, skipping price data')
      return null
    }
    console.error('Failed to get last refresh timestamp:', error.message)
    return null
  }

  const updatedAt = data?.updated_at ?? null

  // Guard the lookup boundary: a malformed stored timestamp must not be
  // treated as a valid recent refresh downstream.
  if (updatedAt !== null && Number.isNaN(new Date(updatedAt).getTime())) {
    console.error('[price-store] Encountered a malformed updated_at timestamp')
    return null
  }

  return updatedAt
}

/**
 * Check if pricing data is stale (>48 hours since last refresh).
 * Returns true if stale or if no price data exists.
 *
 * Accepts an optional already-observed timestamp so callers that already
 * hold a `getLastRefreshTimestamp()` result can derive staleness without a
 * second database read:
 * - Omitted/`undefined`: performs its own single lookup (existing behaviour).
 * - Explicit timestamp or explicit `null`: calculates only, zero reads.
 */
export async function isPriceDataStale(lastRefresh?: string | null): Promise<boolean> {
  const observedRefresh = lastRefresh === undefined
    ? await getLastRefreshTimestamp()
    : lastRefresh

  // Explicit/looked-up absence of a timestamp is not malformed input — no
  // diagnostic. Any non-null value (including empty/whitespace strings)
  // must still pass through the malformed-timestamp check below.
  if (observedRefresh === null) {
    return true
  }

  const lastRefreshTime = new Date(observedRefresh).getTime()

  if (Number.isNaN(lastRefreshTime)) {
    console.error('[price-store] isPriceDataStale received a malformed timestamp')
    return true
  }

  const now = Date.now()

  return (now - lastRefreshTime) > STALE_THRESHOLD_MS
}
