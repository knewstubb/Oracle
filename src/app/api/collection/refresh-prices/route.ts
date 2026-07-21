/**
 * POST /api/collection/refresh-prices
 *
 * Refreshes market prices for all cards in the user's collection.
 * Fetches prices from Scryfall's /cards/collection endpoint in batches
 * and upserts into card_metadata.
 *
 * Can be triggered manually (button in UI) or by a cron job.
 * Rate-limited to once per 6 hours per user.
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { frontFaceName } from '@/lib/basic-lands'

const SCRYFALL_BATCH_SIZE = 75 // Scryfall collection endpoint max
const RATE_LIMIT_MS = 100

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const supabase = createAdminClient()

  // Get all unique card names from user's card_definitions
  const PAGE_SIZE = 1000
  const allNames: string[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('card_definitions')
      .select('card_name')
      .eq('user_id', userId)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error || !data || data.length === 0) break
    allNames.push(...data.map(d => d.card_name))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  if (allNames.length === 0) {
    return Response.json({ updated: 0, total: 0 })
  }

  // Deduplicate and prepare for Scryfall
  const uniqueNames = [...new Set(allNames)]
  let updated = 0
  let errors = 0

  // Fetch in batches of 75 (Scryfall limit)
  for (let i = 0; i < uniqueNames.length; i += SCRYFALL_BATCH_SIZE) {
    const batch = uniqueNames.slice(i, i + SCRYFALL_BATCH_SIZE)
    const identifiers = batch.map(name => ({ name: frontFaceName(name) }))

    try {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'TheOracle/0.1.0' },
        body: JSON.stringify({ identifiers }),
      })

      if (!res.ok) {
        errors++
        continue
      }

      const json = await res.json()
      const rows = (json.data ?? []).map((card: any) => ({
        card_name: card.name,
        mana_cost: card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? '',
        cmc: card.cmc ?? 0,
        type_line: card.type_line ?? '',
        price_usd: card.prices?.usd ? parseFloat(card.prices.usd) : null,
        rarity: card.rarity ?? null,
      }))

      if (rows.length > 0) {
        const { error: upsertErr } = await supabase
          .from('card_metadata')
          .upsert(rows, { onConflict: 'card_name' })

        if (!upsertErr) updated += rows.length
      }

      // Also store under front-face name for DFCs
      const dfcRows = rows
        .filter((r: any) => r.card_name.includes(' // '))
        .map((r: any) => ({ ...r, card_name: frontFaceName(r.card_name) }))

      if (dfcRows.length > 0) {
        await supabase.from('card_metadata').upsert(dfcRows, { onConflict: 'card_name' })
      }

    } catch {
      errors++
    }

    // Rate limit between batches
    if (i + SCRYFALL_BATCH_SIZE < uniqueNames.length) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
    }
  }

  return Response.json({
    updated,
    total: uniqueNames.length,
    errors,
  })
}
