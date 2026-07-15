/**
 * Seed oracle_to_printings + printing_set_info from Scryfall Bulk Data
 *
 * Downloads the "Default Cards" bulk file (every printing of every card),
 * extracts the identity mapping fields, and upserts into Supabase.
 *
 * Tables populated:
 *   - oracle_to_printings: (oracle_id, scryfall_printing_id, card_name, set_code, collector_number)
 *   - printing_set_info: (scryfall_printing_id, set_code, edition_name)
 *
 * Run: npx tsx scripts/seed-scryfall-bulk.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Duration: ~3-5 minutes (download ~90MB + parse + 200 batch upserts)
 * Idempotent: safe to re-run (uses ON CONFLICT DO NOTHING / upsert)
 */

import { createClient } from '@supabase/supabase-js'
import https from 'https'
import http from 'http'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BATCH_SIZE = 1000
const SCRYFALL_BULK_API = 'https://api.scryfall.com/bulk-data'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScryfallBulkMeta {
  data: Array<{
    type: string
    download_uri: string
    size: number
    name: string
  }>
}

interface ScryfallCard {
  id: string           // scryfall_printing_id
  oracle_id: string
  name: string
  set: string          // set code (lowercase)
  collector_number: string
  set_name: string     // edition name
  lang: string
  layout: string
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    protocol.get(url, { headers: { 'User-Agent': 'TheOracle/1.0 (scryfall-bulk-seed)' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location!).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', (chunk: Buffer) => data += chunk.toString())
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

/**
 * Stream a large JSON array from a URL, calling `onItem` for each parsed object.
 * Uses a simple bracket-counting parser to avoid loading 500MB into memory.
 */
function streamJsonArray(url: string, onItem: (card: ScryfallCard) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    protocol.get(url, { headers: { 'User-Agent': 'TheOracle/1.0 (scryfall-bulk-seed)' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return streamJsonArray(res.headers.location!, onItem).then(resolve).catch(reject)
      }

      let buffer = ''
      let depth = 0
      let inString = false
      let escaped = false
      let objectStart = -1
      let count = 0

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()

        for (let i = 0; i < buffer.length; i++) {
          const ch = buffer[i]

          if (escaped) { escaped = false; continue }
          if (ch === '\\' && inString) { escaped = true; continue }
          if (ch === '"') { inString = !inString; continue }
          if (inString) continue

          if (ch === '{') {
            if (depth === 0) objectStart = i
            depth++
          } else if (ch === '}') {
            depth--
            if (depth === 0 && objectStart >= 0) {
              const jsonStr = buffer.slice(objectStart, i + 1)
              try {
                const card = JSON.parse(jsonStr) as ScryfallCard
                onItem(card)
                count++
              } catch {
                // Skip malformed entries
              }
              objectStart = -1
            }
          }
        }

        // Keep only unprocessed portion in buffer
        if (objectStart >= 0) {
          buffer = buffer.slice(objectStart)
          objectStart = 0
        } else {
          buffer = ''
        }
      })

      res.on('end', () => resolve(count))
      res.on('error', reject)
    }).on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('🔍 Fetching Scryfall bulk data catalog...')
  const catalog: ScryfallBulkMeta = await fetchJson(SCRYFALL_BULK_API)

  // Use "default_cards" — every printing, English preferred
  const defaultCards = catalog.data.find(d => d.type === 'default_cards')
  if (!defaultCards) {
    console.error('❌ Could not find "default_cards" in Scryfall bulk data catalog')
    process.exit(1)
  }

  const sizeMB = (defaultCards.size / 1024 / 1024).toFixed(0)
  console.log(`📥 Downloading ${defaultCards.name} (${sizeMB} MB)...`)
  console.log(`   URL: ${defaultCards.download_uri}`)

  // Collect rows for batch upsert
  const oracleRows: Array<{ oracle_id: string; scryfall_printing_id: string; card_name: string; set_code: string; collector_number: string }> = []
  const printingRows: Array<{ scryfall_printing_id: string; set_code: string; edition_name: string }> = []

  let processed = 0
  let skipped = 0

  const totalCards = await streamJsonArray(defaultCards.download_uri, (card) => {
    // Skip non-English cards (we only need one language per printing)
    if (card.lang !== 'en') { skipped++; return }

    // Skip tokens, art_series, etc.
    const skipLayouts = ['token', 'double_faced_token', 'art_series', 'emblem']
    if (skipLayouts.includes(card.layout)) { skipped++; return }

    if (!card.id || !card.oracle_id || !card.name) { skipped++; return }

    oracleRows.push({
      oracle_id: card.oracle_id,
      scryfall_printing_id: card.id,
      card_name: card.name,
      set_code: card.set,
      collector_number: card.collector_number,
    })

    printingRows.push({
      scryfall_printing_id: card.id,
      set_code: card.set,
      edition_name: card.set_name,
    })

    processed++
    if (processed % 10000 === 0) {
      process.stdout.write(`   Parsed ${processed.toLocaleString()} cards...\r`)
    }
  })

  console.log(`\n✅ Parsed ${processed.toLocaleString()} cards (${skipped.toLocaleString()} skipped)`)

  // ---------------------------------------------------------------------------
  // Batch upsert into oracle_to_printings
  // ---------------------------------------------------------------------------
  console.log(`\n📤 Upserting ${oracleRows.length.toLocaleString()} rows into oracle_to_printings...`)

  let oracleInserted = 0
  for (let i = 0; i < oracleRows.length; i += BATCH_SIZE) {
    const batch = oracleRows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('oracle_to_printings')
      .upsert(batch, { onConflict: 'oracle_id,scryfall_printing_id', ignoreDuplicates: true })

    if (error) {
      console.error(`   ⚠️  Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${error.message}`)
    } else {
      oracleInserted += batch.length
    }

    if ((i / BATCH_SIZE) % 20 === 0) {
      process.stdout.write(`   Progress: ${oracleInserted.toLocaleString()} / ${oracleRows.length.toLocaleString()}\r`)
    }
  }
  console.log(`\n   ✅ oracle_to_printings: ${oracleInserted.toLocaleString()} rows upserted`)

  // ---------------------------------------------------------------------------
  // Batch upsert into printing_set_info
  // ---------------------------------------------------------------------------
  console.log(`\n📤 Upserting ${printingRows.length.toLocaleString()} rows into printing_set_info...`)

  let printingInserted = 0
  for (let i = 0; i < printingRows.length; i += BATCH_SIZE) {
    const batch = printingRows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('printing_set_info')
      .upsert(batch, { onConflict: 'scryfall_printing_id', ignoreDuplicates: true })

    if (error) {
      console.error(`   ⚠️  Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${error.message}`)
    } else {
      printingInserted += batch.length
    }

    if ((i / BATCH_SIZE) % 20 === 0) {
      process.stdout.write(`   Progress: ${printingInserted.toLocaleString()} / ${printingRows.length.toLocaleString()}\r`)
    }
  }
  console.log(`\n   ✅ printing_set_info: ${printingInserted.toLocaleString()} rows upserted`)

  console.log('\n🎉 Seed complete!')
  console.log(`   Total cards processed: ${processed.toLocaleString()}`)
  console.log(`   oracle_to_printings: ${oracleInserted.toLocaleString()} rows`)
  console.log(`   printing_set_info: ${printingInserted.toLocaleString()} rows`)
}

main().catch((err) => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
