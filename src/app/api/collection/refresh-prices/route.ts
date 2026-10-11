/**
 * POST /api/collection/refresh-prices
 *
 * Refreshes Scryfall USD prices for the printings the user owns into
 * `ref_printings` — `price_usd` for the normal price and `price_usd_foil` for
 * the foil price. These are the same fields the collection shows.
 *
 * Rules (D-040, D-042):
 * - Prices come from Scryfall only. Card Kingdom is removed.
 * - A missing, non-numeric, zero or negative price is rejected, never stored
 *   as 0.
 * - A foil price is never written into the normal price column.
 * - The response reports how many prices were updated and how many failed, and
 *   is only `success: true` when nothing failed.
 *
 * Can be triggered manually (the collection "Refresh Prices" button).
 */

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

const SCRYFALL_COLLECTION_URL = 'https://api.scryfall.com/cards/collection'
const SCRYFALL_BATCH_SIZE = 75 // Scryfall collection endpoint max
const RATE_LIMIT_MS = 100

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScryfallPriceInfo {
  usd?: string | null
  usd_foil?: string | null
}

interface ScryfallCollectionCard {
  id: string
  prices?: ScryfallPriceInfo | null
}

interface ScryfallCollectionResponse {
  data?: ScryfallCollectionCard[]
  not_found?: unknown[]
}

export interface PriceUpdate {
  price_usd?: number
  price_usd_foil?: number
}

// ---------------------------------------------------------------------------
// Pure price parsing (unit-tested)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Owned printings
// ---------------------------------------------------------------------------

/**
 * Returns the distinct printing ids the user owns a physical copy of.
 */
async function getOwnedPrintingIds(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<string[]> {
  const PAGE_SIZE = 1000
  const ids = new Set<string>()
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('user_copies')
      .select('printing_id')
      .eq('user_id', userId)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error || !data || data.length === 0) break

    for (const row of data) {
      if (row.printing_id) ids.add(row.printing_id)
    }

    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return [...ids]
}

// ---------------------------------------------------------------------------
// POST handler — manual UI trigger
// ---------------------------------------------------------------------------

export async function POST() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const supabase = createAdminClient()

  const printingIds = await getOwnedPrintingIds(supabase, userId)

  if (printingIds.length === 0) {
    return Response.json({ success: true, updated: 0, failed: 0, total: 0, errors: 0 })
  }

  let updated = 0
  let failed = 0
  let errors = 0

  for (let i = 0; i < printingIds.length; i += SCRYFALL_BATCH_SIZE) {
    const batch = printingIds.slice(i, i + SCRYFALL_BATCH_SIZE)

    try {
      const res = await fetch(SCRYFALL_COLLECTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'TheOracle/0.2.0' },
        body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
      })

      if (!res.ok) {
        errors++
        failed += batch.length
        continue
      }

      const json = (await res.json()) as ScryfallCollectionResponse
      const cards = json.data ?? []

      // Scryfall can omit identifiers it does not recognise — count those as
      // failures rather than silently ignoring them.
      const returnedIds = new Set(cards.map((card) => card.id))
      for (const id of batch) {
        if (!returnedIds.has(id)) failed++
      }

      for (const card of cards) {
        const update = buildPriceUpdate(card)
        if (!update) {
          failed++
          continue
        }

        const { data, error } = await supabase
          .from('ref_printings')
          .update(update)
          .eq('scryfall_id', card.id)
          .select('scryfall_id')

        if (error || !data || data.length === 0) {
          failed++
        } else {
          updated++
        }
      }
    } catch {
      errors++
      failed += batch.length
    }

    if (i + SCRYFALL_BATCH_SIZE < printingIds.length) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS))
    }
  }

  return Response.json({
    success: failed === 0,
    updated,
    failed,
    total: printingIds.length,
    errors,
  })
}
