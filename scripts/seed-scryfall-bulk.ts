/**
 * Seed oracle_to_printings + printing_set_info from Scryfall Bulk Data
 *
 * Reads a local Scryfall JSONL file (one card object per line) and upserts
 * identity mappings into Supabase for instant local resolution during imports.
 *
 * Tables populated:
 *   - oracle_to_printings: (oracle_id, scryfall_printing_id, card_name, set_code, collector_number)
 *   - printing_set_info: (scryfall_printing_id, set_code, edition_name)
 *
 * Usage:
 *   npm run seed:scryfall
 *   npm run seed:scryfall -- --file /path/to/default-cards.jsonl
 *
 * If no --file arg, looks for docs/default-cards-*.jsonl in the project root.
 *
 * To get the file:
 *   1. Visit https://api.scryfall.com/bulk-data
 *   2. Download "Default Cards" (JSONL format, ~500MB)
 *   3. Place in docs/ directory
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 * Duration: ~3-5 minutes (parse + 116 batch upserts)
 * Idempotent: safe to re-run (uses ON CONFLICT DO NOTHING / upsert)
 */

import { createClient } from '@supabase/supabase-js'
import { createReadStream, readdirSync } from 'fs'
import { createInterface } from 'readline'
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

// ---------------------------------------------------------------------------
// Find the JSONL file
// ---------------------------------------------------------------------------

function findJsonlFile(): string {
  // Check --file argument
  const fileArgIdx = process.argv.indexOf('--file')
  if (fileArgIdx >= 0 && process.argv[fileArgIdx + 1]) {
    return process.argv[fileArgIdx + 1]
  }

  // Auto-detect in docs/ directory
  const docsDir = resolve(__dirname, '../docs')
  try {
    const files = readdirSync(docsDir).filter(f => f.startsWith('default-cards-') && f.endsWith('.jsonl'))
    if (files.length > 0) {
      // Use the most recent one (sorted by name = sorted by date)
      files.sort()
      return resolve(docsDir, files[files.length - 1])
    }
  } catch {
    // docs dir doesn't exist
  }

  console.error('❌ No Scryfall JSONL file found.')
  console.error('   Download from: https://api.scryfall.com/bulk-data')
  console.error('   Place in: docs/default-cards-YYYYMMDD.jsonl')
  console.error('   Or specify: npm run seed:scryfall -- --file /path/to/file.jsonl')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const filePath = findJsonlFile()
  console.log(`📂 Reading: ${filePath}`)

  // Parse JSONL line by line (memory-efficient)
  const oracleRows: Array<{ oracle_id: string; scryfall_printing_id: string; card_name: string; set_code: string; collector_number: string }> = []
  const printingRows: Array<{ scryfall_printing_id: string; set_code: string; edition_name: string }> = []

  let processed = 0
  let skipped = 0

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!line.trim()) continue

    let card: any
    try {
      card = JSON.parse(line)
    } catch {
      skipped++
      continue
    }

    // Skip non-English cards
    if (card.lang !== 'en') { skipped++; continue }

    // Skip tokens, art_series, etc.
    const skipLayouts = ['token', 'double_faced_token', 'art_series', 'emblem']
    if (skipLayouts.includes(card.layout)) { skipped++; continue }

    if (!card.id || !card.oracle_id || !card.name) { skipped++; continue }

    oracleRows.push({
      oracle_id: card.oracle_id,
      scryfall_printing_id: card.id,
      card_name: card.name,
      set_code: card.set ?? '',
      collector_number: card.collector_number ?? '',
    })

    printingRows.push({
      scryfall_printing_id: card.id,
      set_code: card.set ?? '',
      edition_name: card.set_name ?? '',
    })

    processed++
    if (processed % 10000 === 0) {
      console.log(`   Parsed ${processed.toLocaleString()} cards...`)
    }
  }

  console.log(`✅ Parsed ${processed.toLocaleString()} cards (${skipped.toLocaleString()} skipped)`)

  // ---------------------------------------------------------------------------
  // Batch upsert into oracle_to_printings
  // ---------------------------------------------------------------------------
  console.log(`\n📤 Upserting ${oracleRows.length.toLocaleString()} rows into oracle_to_printings...`)

  let oracleInserted = 0
  let oracleErrors = 0
  for (let i = 0; i < oracleRows.length; i += BATCH_SIZE) {
    const batch = oracleRows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('oracle_to_printings')
      .upsert(batch, { onConflict: 'oracle_id,scryfall_printing_id' })

    if (error) {
      oracleErrors++
      if (oracleErrors <= 3) {
        console.error(`   ⚠️  Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${error.message}`)
      }
    } else {
      oracleInserted += batch.length
    }

    if ((Math.floor(i / BATCH_SIZE)) % 10 === 0) {
      console.log(`   Progress: ${oracleInserted.toLocaleString()} / ${oracleRows.length.toLocaleString()}`)
    }
  }
  console.log(`   ✅ oracle_to_printings: ${oracleInserted.toLocaleString()} rows upserted (${oracleErrors} batch errors)`)

  // ---------------------------------------------------------------------------
  // Batch upsert into printing_set_info
  // ---------------------------------------------------------------------------
  console.log(`\n📤 Upserting ${printingRows.length.toLocaleString()} rows into printing_set_info...`)

  let printingInserted = 0
  let printingErrors = 0
  for (let i = 0; i < printingRows.length; i += BATCH_SIZE) {
    const batch = printingRows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('printing_set_info')
      .upsert(batch, { onConflict: 'scryfall_printing_id' })

    if (error) {
      printingErrors++
      if (printingErrors <= 3) {
        console.error(`   ⚠️  Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${error.message}`)
      }
    } else {
      printingInserted += batch.length
    }

    if ((Math.floor(i / BATCH_SIZE)) % 10 === 0) {
      console.log(`   Progress: ${printingInserted.toLocaleString()} / ${printingRows.length.toLocaleString()}`)
    }
  }
  console.log(`   ✅ printing_set_info: ${printingInserted.toLocaleString()} rows upserted (${printingErrors} batch errors)`)

  console.log('\n🎉 Seed complete!')
  console.log(`   Total cards processed: ${processed.toLocaleString()}`)
  console.log(`   oracle_to_printings: ${oracleInserted.toLocaleString()} rows`)
  console.log(`   printing_set_info: ${printingInserted.toLocaleString()} rows`)
}

main().catch((err) => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
