/**
 * Card Kingdom Price Refresh Engine
 *
 * Orchestrates the daily fetch of the Card Kingdom bulk pricelist,
 * parses the response, filters to entries with valid scryfall_id,
 * and upserts into the local price cache via `upsertPriceBatch`.
 *
 * Handles:
 * - Request timeout (120s default) via AbortController
 * - Retry logic (up to 3 attempts with 30s delay between)
 * - Error logging with timestamp, attempt count, and reason
 * - On all retries exhausted: existing cache retained unchanged
 *
 * Validates: Requirements 1.2, 1.3, 1.5, 1.6
 */

import { upsertPriceBatch } from './price-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RefreshResult {
  success: boolean
  entriesProcessed: number
  entriesSkipped: number // entries with no scryfall_id
  durationMs: number
  error?: string
}

export interface RefreshOptions {
  timeoutMs?: number // default: 120_000
  maxRetries?: number // default: 3
  retryDelayMs?: number // default: 30_000
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CK_PRICELIST_URL = 'https://api.cardkingdom.com/api/pricelist'
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_RETRY_DELAY_MS = 30_000

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface CKProduct {
  id: number
  name: string
  sku: string
  price_retail: number
  is_foil: boolean
  scryfall_id?: string | null
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Fetch the CK pricelist and upsert into card_kingdom_prices.
 * Handles retries, timeout, and error logging.
 */
export async function refreshPriceCache(
  options?: RefreshOptions
): Promise<RefreshResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES
  const retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS

  const startTime = Date.now()

  let lastError: string | undefined

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const products = await fetchPricelist(timeoutMs)

      // Filter to entries with a valid scryfall_id
      const validEntries: Array<{ scryfallPrintingId: string; priceRetail: number; isFoil: boolean }> = []
      let skipped = 0

      for (const product of products) {
        if (!product.scryfall_id || product.scryfall_id.trim() === '') {
          skipped++
          continue
        }

        validEntries.push({
          scryfallPrintingId: product.scryfall_id,
          priceRetail: product.price_retail,
          isFoil: product.is_foil,
        })
      }

      // Upsert valid entries into the price cache
      const { upserted } = await upsertPriceBatch(validEntries)

      const durationMs = Date.now() - startTime

      return {
        success: true,
        entriesProcessed: upserted,
        entriesSkipped: skipped,
        durationMs,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      lastError = reason

      console.error(
        `[${new Date().toISOString()}] Price refresh attempt ${attempt}/${maxRetries} failed: ${reason}`
      )

      // Wait before retrying (unless this was the last attempt)
      if (attempt < maxRetries) {
        await sleep(retryDelayMs)
      }
    }
  }

  // All retries exhausted — return error result, existing cache unchanged
  const durationMs = Date.now() - startTime

  return {
    success: false,
    entriesProcessed: 0,
    entriesSkipped: 0,
    durationMs,
    error: lastError ?? 'All retry attempts exhausted',
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the CK pricelist with an AbortController timeout.
 * Throws on network error, non-200 response, or timeout.
 */
async function fetchPricelist(timeoutMs: number): Promise<CKProduct[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(CK_PRICELIST_URL, {
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`CK API returned HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    // The CK API may wrap products in a top-level key or return an array directly.
    // Handle both shapes defensively.
    const products: CKProduct[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.products)
          ? data.products
          : []

    return products
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Promise-based sleep utility for retry delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
