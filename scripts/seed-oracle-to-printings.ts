#!/usr/bin/env npx tsx
/**
 * Seed oracle_to_printings from Scryfall Bulk Data
 *
 * Downloads the Scryfall "default_cards" bulk JSON, streams it to disk,
 * then processes it in chunks to populate oracle_to_printings in Supabase.
 *
 * Uses file-based streaming to avoid Node.js string length limits (~512MB).
 *
 * Usage: npx tsx scripts/seed-oracle-to-printings.ts
 *
 * Expected runtime: 2-3 minutes (download + parse + batch upsert)
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createWriteStream, createReadStream, unlinkSync, existsSync } from 'fs'
import { createInterface } from 'readline'
import { Writable } from 'stream'
import { pipeline } from 'stream/promises'

// Load .env.local before any other imports
config({ path: resolve(__dirname, '..', '.env.local') })

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRYFALL_BULK_DATA_URL = 'https://api.scryfall.com/bulk-data'
const USER_AGENT = 'TheOracle/0.1.0'
const BATCH_SIZE = 1000
const TEMP_FILE = resolve(__dirname, '..', 'data', 'scryfall-bulk-temp.jsonl')

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now()

  // Dynamic import after env is loaded
  const { createAdminClient } = await import('../src/lib/supabase')
  const supabase = createAdminClient()

  console.log('[seed] Fetching Scryfall bulk data catalog...')

  // Step 1: Get the download URL for "default_cards"
  const catalogRes = await fetch(SCRYFALL_BULK_DATA_URL, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!catalogRes.ok) {
    throw new Error(`Failed to fetch Scryfall bulk data catalog: ${catalogRes.status}`)
  }

  const catalog = await catalogRes.json() as {
    data: Array<{ type: string; download_uri: string; size: number }>
  }

  const defaultCards = catalog.data.find(d => d.type === 'default_cards')
  if (!defaultCards) {
    throw new Error('Could not find "default_cards" in Scryfall bulk data catalog')
  }

  const sizeMB = (defaultCards.size / 1024 / 1024).toFixed(0)
  console.log(`[seed] Downloading default_cards (${sizeMB}MB) to temp file...`)

  // Step 2: Stream download to disk (avoids string length limit)
  const downloadRes = await fetch(defaultCards.download_uri, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!downloadRes.ok || !downloadRes.body) {
    throw new Error(`Failed to download bulk data: ${downloadRes.status}`)
  }

  const fileStream = createWriteStream(TEMP_FILE)
  // @ts-ignore — Node.js Readable.fromWeb exists in Node 18+
  const { Readable } = await import('stream')
  const nodeStream = Readable.fromWeb(downloadRes.body as any)
  await pipeline(nodeStream, fileStream)

  console.log('[seed] Download complete. Processing file...')

  // Step 3: Read the file line by line, extracting oracle_id + id pairs.
  // The JSON is an array of objects. We look for "id" and "oracle_id" fields
  // using a simple regex approach on each line (avoids full JSON parse).
  const mappings: Array<{ oracle_id: string; scryfall_printing_id: string }> = []
  
  const rl = createInterface({
    input: createReadStream(TEMP_FILE, { encoding: 'utf-8', highWaterMark: 64 * 1024 }),
    crlfDelay: Infinity,
  })

  // Buffer for accumulating a single JSON object across lines
  let buffer = ''
  let objectDepth = 0
  let cardCount = 0

  for await (const line of rl) {
    // Track brace depth to find complete JSON objects
    for (const char of line) {
      if (char === '{') objectDepth++
      if (char === '}') objectDepth--
    }

    buffer += line

    // When depth returns to 0, we have a complete top-level object
    if (objectDepth === 0 && buffer.includes('"id"')) {
      // Try to extract id and oracle_id using regex (faster than JSON.parse for large files)
      const idMatch = buffer.match(/"id"\s*:\s*"([0-9a-f-]{36})"/)
      const oracleMatch = buffer.match(/"oracle_id"\s*:\s*"([0-9a-f-]{36})"/)

      if (idMatch && oracleMatch) {
        mappings.push({
          oracle_id: oracleMatch[1],
          scryfall_printing_id: idMatch[1],
        })
        cardCount++
      }

      buffer = ''
    }

    // Clear buffer if it gets too large without completing an object (safety)
    if (buffer.length > 100000) {
      buffer = ''
      objectDepth = 0
    }

    // Progress logging
    if (cardCount > 0 && cardCount % 50000 === 0) {
      console.log(`[seed] Extracted ${cardCount.toLocaleString()} mappings...`)
    }
  }

  console.log(`[seed] Extracted ${mappings.length.toLocaleString()} total oracle→printing mappings`)

  // Step 4: Batch upsert into oracle_to_printings
  console.log('[seed] Upserting into oracle_to_printings...')

  let upserted = 0
  let errors = 0

  for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
    const batch = mappings.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
      .from('oracle_to_printings')
      .upsert(batch, { onConflict: 'oracle_id,scryfall_printing_id' })

    if (error) {
      errors++
      if (errors <= 3) {
        console.error(`[seed] Batch error at offset ${i}: ${error.message}`)
      }
    } else {
      upserted += batch.length
    }

    // Progress every 50k
    if ((i + BATCH_SIZE) % 50000 < BATCH_SIZE) {
      console.log(`[seed] Progress: ${Math.min(i + BATCH_SIZE, mappings.length).toLocaleString()}/${mappings.length.toLocaleString()} rows`)
    }
  }

  // Step 5: Clean up temp file
  try {
    if (existsSync(TEMP_FILE)) {
      unlinkSync(TEMP_FILE)
      console.log('[seed] Temp file cleaned up.')
    }
  } catch {
    console.warn('[seed] Warning: could not delete temp file at', TEMP_FILE)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n[seed] ✅ Complete in ${elapsed}s`)
  console.log(`  Cards processed: ${cardCount.toLocaleString()}`)
  console.log(`  Mappings upserted: ${upserted.toLocaleString()}`)
  console.log(`  Batch errors: ${errors}`)
}

main().catch(err => {
  console.error('[seed] ❌ Fatal error:', err)
  process.exit(1)
})
