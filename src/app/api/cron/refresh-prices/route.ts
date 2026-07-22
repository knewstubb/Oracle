/**
 * GET /api/cron/refresh-prices
 *
 * Vercel Cron endpoint — triggers daily price refresh for all users.
 * Runs at 6:00 AM UTC daily.
 *
 * Security: Validates CRON_SECRET header from Vercel to prevent unauthorized access.
 * Falls back to running for the first user if no specific targeting is needed
 * (single-user app).
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { frontFaceName } from '@/lib/basic-lands'

const SCRYFALL_BATCH_SIZE = 75
const RATE_LIMIT_MS = 100

export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret (if configured)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Get all unique card names from card_definitions (all users — single-user app)
  const PAGE_SIZE = 1000
  const allNames: string[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('card_definitions')
      .select('card_name')
      .range(offset, offset + PAGE_SIZE - 1)

    if (error || !data || data.length === 0) break
    allNames.push(...data.map(d => d.card_name))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  if (allNames.length === 0) {
    return Response.json({ updated: 0, total: 0 })
  }

  const uniqueNames = [...new Set(allNames)]
  let updated = 0
  let errors = 0

  for (let i = 0; i < uniqueNames.length; i += SCRYFALL_BATCH_SIZE) {
    const batch = uniqueNames.slice(i, i + SCRYFALL_BATCH_SIZE)
    const identifiers = batch.map(name => ({ name: frontFaceName(name) }))

    try {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'TheOracle/0.2.0' },
        body: JSON.stringify({ identifiers }),
      })

      if (!res.ok) { errors++; continue }

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

      // DFC front-face names
      const dfcRows = rows
        .filter((r: any) => r.card_name.includes(' // '))
        .map((r: any) => ({ ...r, card_name: frontFaceName(r.card_name) }))
      if (dfcRows.length > 0) {
        await supabase.from('card_metadata').upsert(dfcRows, { onConflict: 'card_name' })
      }
    } catch { errors++ }

    if (i + SCRYFALL_BATCH_SIZE < uniqueNames.length) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
    }
  }

  return Response.json({ updated, total: uniqueNames.length, errors })
}
