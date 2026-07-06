/**
 * GET/POST /api/collection/prices/refresh
 *
 * Fetches the Card Kingdom bulk pricelist directly and upserts into the
 * `card_kingdom_prices` table via Supabase. Runs server-side in the Next.js
 * API route — no edge function dependency.
 *
 * Trigger modes:
 * - GET: Vercel Cron (validates Authorization header with CRON_SECRET)
 * - POST: Manual UI trigger (requires auth)
 *
 * Returns: { success, entriesProcessed, entriesSkipped, durationMs }
 *
 * Validates: Requirements 6.4
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CK_PRICELIST_URL = 'https://api.cardkingdom.com/api/pricelist'
const FETCH_TIMEOUT_MS = 120_000
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

// ---------------------------------------------------------------------------
// Core price refresh logic
// ---------------------------------------------------------------------------

async function refreshPrices(): Promise<Response> {
  const startTime = Date.now()

  try {
    // 1. Fetch the CK pricelist
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    let response: globalThis.Response
    try {
      response = await fetch(CK_PRICELIST_URL, { signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      return Response.json(
        { success: false, error: `CK API returned HTTP ${response.status}` },
        { status: 502 }
      )
    }

    const data = await response.json()

    // Handle different possible response shapes from CK API
    const products: CKProduct[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.products)
          ? data.products
          : []

    if (products.length === 0) {
      return Response.json(
        { success: false, error: 'CK API returned zero products' },
        { status: 502 }
      )
    }

    // 2. Filter to entries with valid scryfall_id
    const now = new Date().toISOString()
    const validEntries: Array<{
      scryfall_printing_id: string
      price_retail: number
      is_foil: boolean
      updated_at: string
    }> = []
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

    if (validEntries.length === 0) {
      return Response.json(
        {
          success: false,
          error: 'No products with scryfall_id found in CK response',
          entriesSkipped: skipped,
        },
        { status: 502 }
      )
    }

    // 3. Upsert into card_kingdom_prices in batches
    const supabase = createAdminClient()
    let totalUpserted = 0

    for (let i = 0; i < validEntries.length; i += UPSERT_BATCH_SIZE) {
      const batch = validEntries.slice(i, i + UPSERT_BATCH_SIZE)

      const { error: upsertErr } = await supabase
        .from('card_kingdom_prices')
        .upsert(batch, { onConflict: 'scryfall_printing_id' })

      if (upsertErr) {
        return Response.json(
          {
            success: false,
            error: `Batch upsert failed at offset ${i}: ${upsertErr.message}`,
            entriesProcessed: totalUpserted,
          },
          { status: 500 }
        )
      }

      totalUpserted += batch.length
    }

    const durationMs = Date.now() - startTime

    return Response.json({
      success: true,
      entriesProcessed: totalUpserted,
      entriesSkipped: skipped,
      durationMs,
      timestamp: now,
    })
  } catch (error) {
    const durationMs = Date.now() - startTime
    const message = error instanceof Error ? error.message : String(error)

    if (message.includes('AbortError') || message.includes('aborted')) {
      return Response.json(
        { success: false, error: `Request timed out after ${FETCH_TIMEOUT_MS}ms`, durationMs },
        { status: 504 }
      )
    }

    return Response.json(
      { success: false, error: message, durationMs },
      { status: 502 }
    )
  }
}

// ---------------------------------------------------------------------------
// GET handler — Vercel Cron trigger
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return Response.json(
        { error: 'Unauthorized — invalid cron secret' },
        { status: 401 }
      )
    }
  }

  return refreshPrices()
}

// ---------------------------------------------------------------------------
// POST handler — Manual UI trigger
// ---------------------------------------------------------------------------

export async function POST() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  return refreshPrices()
}
