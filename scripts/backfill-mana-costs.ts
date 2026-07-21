/**
 * Backfill card_metadata with mana_cost data from Scryfall.
 * Fetches all unique card_names from deck_cards, looks them up via
 * Scryfall's /cards/collection endpoint, and inserts into card_metadata.
 *
 * Run: npx tsx scripts/backfill-mana-costs.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function fetchFromScryfall(cardNames: string[]): Promise<Map<string, { mana_cost: string; cmc: number; type_line: string; price_usd: number | null; rarity: string | null }>> {
  const result = new Map<string, { mana_cost: string; cmc: number; type_line: string; price_usd: number | null; rarity: string | null }>()

  // Scryfall collection endpoint accepts max 75 identifiers per request
  const BATCH_SIZE = 75
  for (let i = 0; i < cardNames.length; i += BATCH_SIZE) {
    const batch = cardNames.slice(i, i + BATCH_SIZE)
    const identifiers = batch.map(name => {
      // For DFC cards, use front face name for Scryfall lookup
      const idx = name.indexOf(' // ')
      return { name: idx === -1 ? name : name.substring(0, idx) }
    })

    const res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TheOracle/0.1.0',
      },
      body: JSON.stringify({ identifiers }),
    })

    if (!res.ok) {
      console.error(`Scryfall batch ${i}–${i + batch.length} failed: ${res.status}`)
      continue
    }

    const json = await res.json()
    for (const card of json.data ?? []) {
      const priceStr = card.prices?.usd ?? card.prices?.usd_foil ?? null
      // DFC cards have mana_cost on card_faces, not top-level
      const manaCost = card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? ''
      result.set(card.name, {
        mana_cost: manaCost,
        cmc: card.cmc ?? 0,
        type_line: card.type_line ?? '',
        price_usd: priceStr ? parseFloat(priceStr) : null,
        rarity: card.rarity ?? null,
      })
      // Also store under front-face name for decks that use short names
      const frontIdx = card.name.indexOf(' // ')
      if (frontIdx !== -1) {
        const front = card.name.substring(0, frontIdx)
        result.set(front, {
          mana_cost: manaCost,
          cmc: card.cmc ?? 0,
          type_line: card.type_line ?? '',
          price_usd: priceStr ? parseFloat(priceStr) : null,
          rarity: card.rarity ?? null,
        })
      }
    }

    // Rate limit: 100ms between requests
    if (i + BATCH_SIZE < cardNames.length) {
      await new Promise(r => setTimeout(r, 100))
    }

    console.log(`  Fetched ${Math.min(i + BATCH_SIZE, cardNames.length)}/${cardNames.length} from Scryfall`)
  }

  return result
}

async function main() {
  console.log('Fetching unique card names from card_definitions and deck_cards...')

  // Get all unique card names from card_definitions + deck_cards (covers everything)
  const allNamesSet = new Set<string>()
  let offset = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('card_definitions')
      .select('card_name')
      .range(offset, offset + PAGE - 1)
    if (error) { console.error(error); break }
    if (!data || data.length === 0) break
    for (const row of data) allNamesSet.add(row.card_name)
    if (data.length < PAGE) break
    offset += PAGE
  }

  // Also grab from deck_cards (covers unowned cards not in card_definitions)
  offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('deck_cards')
      .select('card_name')
      .range(offset, offset + PAGE - 1)
    if (error) { console.error(error); break }
    if (!data || data.length === 0) break
    for (const row of data) allNamesSet.add(row.card_name)
    if (data.length < PAGE) break
    offset += PAGE
  }

  const allNames = [...allNamesSet]

  console.log(`Found ${allNames.length} unique card names`)

  // Fetch from Scryfall
  console.log('Fetching mana costs from Scryfall...')
  const scryfallData = await fetchFromScryfall(allNames)
  console.log(`Got data for ${scryfallData.size} cards`)

  // Upsert into card_metadata
  console.log('Upserting into card_metadata...')
  const rows = Array.from(scryfallData.entries()).map(([card_name, data]) => ({
    card_name,
    mana_cost: data.mana_cost,
    cmc: data.cmc,
    type_line: data.type_line,
    price_usd: data.price_usd,
    rarity: data.rarity,
  }))

  // Batch upsert in chunks of 500
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await supabase
      .from('card_metadata')
      .upsert(batch, { onConflict: 'card_name' })
    if (error) {
      console.error(`Upsert batch ${i} failed:`, error.message)
    } else {
      console.log(`  Upserted ${Math.min(i + 500, rows.length)}/${rows.length}`)
    }
  }

  console.log('Done!')
}

main().catch(console.error)
