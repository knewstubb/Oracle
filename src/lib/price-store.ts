/**
 * Card Kingdom Price Cache Data Access Layer
 *
 * Manages the price cache (`card_kingdom_prices` table) for Card Kingdom
 * retail pricing via Supabase. Provides functions for:
 * - Batch upserting price entries from the CK API
 * - Computing Price_To_Add (cheapest listing across all printings via oracle_id)
 * - Looking up Owned_Valuation (specific printing + foil status)
 * - Checking price data freshness (>48h = stale)
 *
 * Basic Land Detection: Any card_definition with "Basic" in the type_line
 * supertype returns null for all price lookups — basic lands have near-zero
 * market value and displaying prices adds noise.
 *
 * Uses Supabase RPC functions for complex multi-table JOINs:
 * - get_price_to_add(card_def_id) — single card price lookup
 * - get_bulk_price_to_add() — bulk price lookup for all definitions
 *
 * Validates: Requirements 1.1, 1.4, 2.1, 2.2, 2.4, 2.5, 3.1, 3.3, 3.4, 3.5
 */

import { createServerClient } from '@/lib/supabase'

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
  minPrice: number | null // null = no CK listing exists
}

export interface OwnedValuationResult {
  physicalCopyId: number
  price: number | null // null = no CK listing for this printing+foil combo
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Price data is considered stale after 48 hours */
const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Batch Upsert
// ---------------------------------------------------------------------------

/**
 * Upsert a batch of price entries from the CK API response.
 * Uses Supabase's upsert with onConflict for atomicity.
 *
 * Entries with empty or missing scryfallPrintingId are skipped.
 * Returns count of upserted and skipped entries.
 */
export async function upsertPriceBatch(
  entries: Array<{ scryfallPrintingId: string; priceRetail: number; isFoil: boolean }>
): Promise<{ upserted: number; skipped: number }> {
  let upserted = 0
  let skipped = 0

  const validEntries: Array<{
    scryfall_printing_id: string
    price_retail: number
    is_foil: boolean
    updated_at: string
  }> = []

  for (const entry of entries) {
    if (!entry.scryfallPrintingId || entry.scryfallPrintingId.trim() === '') {
      skipped++
      continue
    }
    validEntries.push({
      scryfall_printing_id: entry.scryfallPrintingId,
      price_retail: entry.priceRetail,
      is_foil: entry.isFoil,
      updated_at: new Date().toISOString(),
    })
    upserted++
  }

  if (validEntries.length === 0) {
    return { upserted, skipped }
  }

  const supabase = createServerClient()
  const { error } = await supabase
    .from('card_kingdom_prices')
    .upsert(validEntries, { onConflict: 'scryfall_printing_id' })

  if (error) {
    throw new Error(`Failed to upsert price batch: ${error.message}`)
  }

  return { upserted, skipped }
}

// ---------------------------------------------------------------------------
// Price_To_Add (Single)
// ---------------------------------------------------------------------------

/**
 * Get Price_To_Add for a single card_definition.
 * Uses the Postgres RPC function which handles:
 * - Basic land detection (returns null for basic lands)
 * - Multi-table join through oracle_to_printings → card_kingdom_prices
 * - MIN(price_retail) aggregation
 *
 * Returns null if:
 * - The card is a Basic Land (type_line contains "Basic" as supertype)
 * - No CK listing exists for any printing of this card
 */
export async function getPriceToAdd(cardDefinitionId: number): Promise<number | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase.rpc('get_price_to_add', {
    card_def_id: cardDefinitionId,
  })

  if (error) {
    throw new Error(`Failed to get price_to_add for card ${cardDefinitionId}: ${error.message}`)
  }

  return data ?? null
}

// ---------------------------------------------------------------------------
// Price_To_Add (Bulk)
// ---------------------------------------------------------------------------

/**
 * Get Price_To_Add for all card_definitions in a single query.
 * Uses the Postgres RPC function for efficient bulk computation.
 * Returns a Map<cardDefinitionId, minPrice | null>.
 *
 * Basic lands are included in the map with null values.
 * Cards with no CK listing are included with null values.
 */
export async function getBulkPriceToAdd(): Promise<Map<number, number | null>> {
  const result = new Map<number, number | null>()

  const supabase = createServerClient()
  const { data, error } = await supabase.rpc('get_bulk_price_to_add')

  if (error) {
    throw new Error(`Failed to get bulk price_to_add: ${error.message}`)
  }

  if (data) {
    for (const row of data) {
      result.set(row.card_definition_id, row.price_to_add)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Owned Valuation
// ---------------------------------------------------------------------------

/**
 * Get Owned_Valuation for a specific printing + foil status.
 * Direct lookup by scryfall_printing_id + is_foil. No aggregation.
 *
 * Returns null if:
 * - No CK listing exists for this printing + foil combo
 * - Foil lookup never falls back to non-foil pricing
 *
 * Note: Basic land detection is done by the caller when they have
 * the card_definition context. This function is a raw price lookup.
 */
export async function getOwnedValuation(
  scryfallPrintingId: string,
  isFoil: boolean
): Promise<number | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('card_kingdom_prices')
    .select('price_retail')
    .eq('scryfall_printing_id', scryfallPrintingId)
    .eq('is_foil', isFoil)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to get owned valuation for ${scryfallPrintingId}: ${error.message}`)
  }

  return data?.price_retail ?? null
}

// ---------------------------------------------------------------------------
// Freshness / Staleness
// ---------------------------------------------------------------------------

/**
 * Get the last successful refresh timestamp.
 * Returns the most recent updated_at value from the price cache.
 * Returns null if the table is empty (never refreshed).
 */
export async function getLastRefreshTimestamp(): Promise<string | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('card_kingdom_prices')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to get last refresh timestamp: ${error.message}`)
  }

  return data?.updated_at ?? null
}

/**
 * Check if pricing data is stale (>48 hours since last refresh).
 * Returns true if stale or if no price data exists.
 */
export async function isPriceDataStale(): Promise<boolean> {
  const lastRefresh = await getLastRefreshTimestamp()

  if (!lastRefresh) {
    return true
  }

  const lastRefreshTime = new Date(lastRefresh).getTime()
  const now = Date.now()

  return (now - lastRefreshTime) > STALE_THRESHOLD_MS
}
