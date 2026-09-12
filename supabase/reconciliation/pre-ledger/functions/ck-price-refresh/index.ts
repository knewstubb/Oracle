/**
 * Supabase Edge Function: Card Kingdom Price Refresh
 *
 * Deno-based edge function that fetches the Card Kingdom bulk pricelist,
 * processes entries, and upserts into the `card_kingdom_prices` table.
 *
 * Runs on Supabase infrastructure — no Vercel timeout constraint.
 * Preserves existing retry logic: 3 attempts, 30s delay between retries.
 *
 * Trigger: POST request (from Vercel Cron, manual UI trigger, or direct invoke)
 * Auth: Optional Authorization header validated against SUPABASE_SERVICE_ROLE_KEY
 *
 * Validates: Requirements 6.1, 6.3, 6.4
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CK_PRICELIST_URL = 'https://api.cardkingdom.com/api/pricelist'
const FETCH_TIMEOUT_MS = 120_000
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 30_000
const UPSERT_BATCH_SIZE = 1000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CKProduct {
  id: number
  name: string
  sku: string
  price_retail: number
  is_foil: boolean
  scryfall_id?: string | null
}

interface RefreshResult {
  success: boolean
  entriesProcessed: number
  entriesSkipped: number
  durationMs: number
  error?: string
  attempts: number
}

interface PriceEntry {
  scryfall_printing_id: string
  price_retail: number
  is_foil: boolean
  updated_at: string
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Optional auth check — validate Bearer token matches service role key
  const authHeader = req.headers.get('Authorization')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (authHeader && serviceRoleKey) {
    const token = authHeader.replace('Bearer ', '')
    if (token !== serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  // Run the refresh
  const result = await refreshPriceCache()

  const status = result.success ? 200 : 502
  return new Response(JSON.stringify(result), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
})

// ---------------------------------------------------------------------------
// Core Logic
// ---------------------------------------------------------------------------

async function refreshPriceCache(): Promise<RefreshResult> {
  const startTime = Date.now()
  let lastError: string | undefined

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[${new Date().toISOString()}] CK price refresh attempt ${attempt}/${MAX_RETRIES}`
      )

      // 1. Fetch the CK pricelist
      const products = await fetchPricelist()
      console.log(`[${new Date().toISOString()}] Fetched ${products.length} products from CK API`)

      // 2. Filter to entries with valid scryfall_id and map to DB schema
      const now = new Date().toISOString()
      const validEntries: PriceEntry[] = []
      let skipped = 0

      for (const product of products) {
        if (!product.scryfall_id || product.scryfall_id.trim() === '') {
          skipped++
          continue
        }

        validEntries.push({
          scryfall_printing_id: product.scryfall_id.trim(),
          price_retail: product.price_retail,
          is_foil: product.is_foil,
          updated_at: now,
        })
      }

      console.log(
        `[${new Date().toISOString()}] Valid entries: ${validEntries.length}, skipped: ${skipped}`
      )

      // 3. Upsert into card_kingdom_prices in batches
      const upserted = await upsertPrices(validEntries)

      const durationMs = Date.now() - startTime
      console.log(
        `[${new Date().toISOString()}] Price refresh complete. ` +
        `Upserted: ${upserted}, Duration: ${durationMs}ms`
      )

      return {
        success: true,
        entriesProcessed: upserted,
        entriesSkipped: skipped,
        durationMs,
        attempts: attempt,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      lastError = reason

      console.error(
        `[${new Date().toISOString()}] Price refresh attempt ${attempt}/${MAX_RETRIES} failed: ${reason}`
      )

      // Wait before retrying (unless this was the last attempt)
      if (attempt < MAX_RETRIES) {
        console.log(`[${new Date().toISOString()}] Waiting ${RETRY_DELAY_MS / 1000}s before retry...`)
        await sleep(RETRY_DELAY_MS)
      }
    }
  }

  // All retries exhausted — existing cache retained unchanged
  const durationMs = Date.now() - startTime
  return {
    success: false,
    entriesProcessed: 0,
    entriesSkipped: 0,
    durationMs,
    error: lastError ?? 'All retry attempts exhausted',
    attempts: MAX_RETRIES,
  }
}

// ---------------------------------------------------------------------------
// CK API Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch the CK pricelist with an AbortController timeout.
 * Throws on network error, non-200 response, or timeout.
 */
async function fetchPricelist(): Promise<CKProduct[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

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

    if (products.length === 0) {
      throw new Error('CK API returned zero products — possible schema change or empty response')
    }

    return products
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// ---------------------------------------------------------------------------
// Database Upsert
// ---------------------------------------------------------------------------

/**
 * Upsert price entries into card_kingdom_prices in batches.
 * Uses the Supabase service role client for direct DB writes.
 * Returns total count of successfully upserted rows.
 */
async function upsertPrices(entries: PriceEntry[]): Promise<number> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  let totalUpserted = 0

  // Process in batches to avoid hitting request size limits
  for (let i = 0; i < entries.length; i += UPSERT_BATCH_SIZE) {
    const batch = entries.slice(i, i + UPSERT_BATCH_SIZE)

    const { error } = await supabase
      .from('card_kingdom_prices')
      .upsert(batch, { onConflict: 'scryfall_printing_id' })

    if (error) {
      console.error(
        `[${new Date().toISOString()}] Batch upsert failed at offset ${i}: ${error.message}`
      )
      throw new Error(`Batch upsert failed at offset ${i}: ${error.message}`)
    }

    totalUpserted += batch.length

    if ((i + UPSERT_BATCH_SIZE) < entries.length) {
      console.log(
        `[${new Date().toISOString()}] Upserted batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}` +
        ` (${totalUpserted}/${entries.length} entries)`
      )
    }
  }

  return totalUpserted
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
