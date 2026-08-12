/**
 * Sync Scryfall Printings
 * 
 * Downloads Scryfall's "Default Cards" bulk data and upserts into printings table.
 * Can be run manually or scheduled via cron.
 * 
 * Usage:
 *   npx tsx scripts/sync-scryfall-printings.ts           # Full sync
 *   npx tsx scripts/sync-scryfall-printings.ts --dry-run # Preview without writing
 *   npx tsx scripts/sync-scryfall-printings.ts --force   # Force full refresh even if recent
 */

import { createClient } from '@supabase/supabase-js'
import { createReadStream } from 'fs'
import { createWriteStream, existsSync, unlinkSync, statSync } from 'fs'
import { createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import * as readline from 'readline'
import { Readable } from 'stream'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Scryfall bulk data API
const BULK_DATA_API = 'https://api.scryfall.com/bulk-data'
const TEMP_FILE = '/tmp/scryfall-default-cards.jsonl'
const USER_AGENT = 'TheOracle/1.0 (https://github.com/bradknewstubb/the-oracle)'

interface BulkDataInfo {
  download_uri: string
  jsonl_download_uri: string
  updated_at: string
  size: number
}

interface ScryfallCard {
  id: string
  oracle_id: string
  name: string
  set: string
  set_name: string
  collector_number: string
  rarity: string
  prices: {
    usd?: string | null
    usd_foil?: string | null
    eur?: string | null
    eur_foil?: string | null
  }
  image_uris?: {
    small?: string
    normal?: string
    large?: string
    art_crop?: string
  }
  card_faces?: Array<{
    image_uris?: {
      small?: string
      normal?: string
      large?: string
      art_crop?: string
    }
  }>
  type_line: string
  mana_cost?: string
  cmc: number
  colors?: string[]
  color_identity?: string[]
  legalities: {
    commander?: string
  }
  layout: string
  released_at: string
  reprint: boolean
  digital: boolean
}

interface PrintingRow {
  scryfall_id: string
  oracle_id: string
  name: string
  set_code: string
  set_name: string
  collector_number: string
  rarity: string
  price_usd: number | null
  price_usd_foil: number | null
  price_eur: number | null
  price_eur_foil: number | null
  image_uri_small: string | null
  image_uri_normal: string | null
  image_uri_large: string | null
  image_uri_art_crop: string | null
  type_line: string | null
  mana_cost: string | null
  cmc: number | null
  colors: string[] | null
  color_identity: string[] | null
  legality_commander: string | null
  layout: string | null
  released_at: string | null
  reprint: boolean
  digital: boolean
  updated_at: string
}

async function getBulkDataInfo(): Promise<BulkDataInfo> {
  console.log('Fetching bulk data info from Scryfall...')
  const response = await fetch(BULK_DATA_API, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  })
  
  if (!response.ok) {
    throw new Error(`Scryfall API returned ${response.status}: ${response.statusText}`)
  }
  
  const data = await response.json()
  
  if (!data || !Array.isArray(data.data)) {
    console.error('Unexpected API response:', JSON.stringify(data).slice(0, 200))
    throw new Error('Unexpected Scryfall API response structure')
  }
  
  const defaultCards = data.data.find((d: { type: string }) => d.type === 'default_cards')
  if (!defaultCards) {
    console.error('Available types:', data.data.map((d: { type: string }) => d.type).join(', '))
    throw new Error('Could not find default_cards bulk data')
  }
  
  return {
    download_uri: defaultCards.download_uri,
    jsonl_download_uri: defaultCards.jsonl_download_uri,
    updated_at: defaultCards.updated_at,
    size: defaultCards.size,
  }
}

async function checkLastSync(): Promise<string | null> {
  const { data, error } = await supabase
    .from('sync_meta')
    .select('value')
    .eq('key', 'printings_last_sync')
    .single()
  
  if (error || !data) return null
  return data.value
}

async function updateLastSync(timestamp: string): Promise<void> {
  await supabase
    .from('sync_meta')
    .upsert({ key: 'printings_last_sync', value: timestamp, updated_at: new Date().toISOString() })
}

async function downloadBulkData(url: string): Promise<void> {
  console.log('Downloading bulk data (this may take a minute)...')
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/octet-stream',
    },
  })
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download: ${response.status}`)
  }
  
  // Stream the gzipped content, decompress, and write to temp file
  const gunzip = createGunzip()
  const fileStream = createWriteStream(TEMP_FILE)
  
  // Convert web ReadableStream to Node stream
  const reader = response.body.getReader()
  const nodeStream = new Readable({
    async read() {
      const { done, value } = await reader.read()
      if (done) {
        this.push(null)
      } else {
        this.push(Buffer.from(value))
      }
    }
  })
  
  await pipeline(nodeStream, gunzip, fileStream)
  
  const stats = statSync(TEMP_FILE)
  console.log(`Downloaded and decompressed: ${(stats.size / 1024 / 1024).toFixed(1)} MB`)
}

function parsePrice(price: string | null | undefined): number | null {
  if (!price) return null
  const parsed = parseFloat(price)
  return isNaN(parsed) ? null : parsed
}

function getImageUris(card: ScryfallCard): {
  small: string | null
  normal: string | null
  large: string | null
  art_crop: string | null
} {
  // For cards with image_uris directly
  if (card.image_uris) {
    return {
      small: card.image_uris.small || null,
      normal: card.image_uris.normal || null,
      large: card.image_uris.large || null,
      art_crop: card.image_uris.art_crop || null,
    }
  }
  
  // For DFCs and split cards, use the first face
  if (card.card_faces && card.card_faces[0]?.image_uris) {
    const face = card.card_faces[0].image_uris
    return {
      small: face.small || null,
      normal: face.normal || null,
      large: face.large || null,
      art_crop: face.art_crop || null,
    }
  }
  
  return { small: null, normal: null, large: null, art_crop: null }
}

function cardToRow(card: ScryfallCard, now: string): PrintingRow {
  const images = getImageUris(card)
  
  return {
    scryfall_id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    set_code: card.set,
    set_name: card.set_name,
    collector_number: card.collector_number,
    rarity: card.rarity,
    price_usd: parsePrice(card.prices?.usd),
    price_usd_foil: parsePrice(card.prices?.usd_foil),
    price_eur: parsePrice(card.prices?.eur),
    price_eur_foil: parsePrice(card.prices?.eur_foil),
    image_uri_small: images.small,
    image_uri_normal: images.normal,
    image_uri_large: images.large,
    image_uri_art_crop: images.art_crop,
    type_line: card.type_line || null,
    mana_cost: card.mana_cost || null,
    cmc: card.cmc ?? null,
    colors: card.colors || null,
    color_identity: card.color_identity || null,
    legality_commander: card.legalities?.commander || null,
    layout: card.layout || null,
    released_at: card.released_at || null,
    reprint: card.reprint ?? false,
    digital: card.digital ?? false,
    updated_at: now,
  }
}

async function processAndUpsert(dryRun: boolean): Promise<{ total: number; upserted: number; failed: number }> {
  console.log('Processing cards...')
  
  const now = new Date().toISOString()
  const BATCH_SIZE = 500
  let batch: PrintingRow[] = []
  let total = 0
  let upserted = 0
  let failed = 0
  
  const fileStream = createReadStream(TEMP_FILE)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  })
  
  for await (const line of rl) {
    if (!line.trim()) continue
    
    try {
      const card: ScryfallCard = JSON.parse(line)
      
      // Skip cards without oracle_id (tokens, emblems, etc. that aren't real cards)
      if (!card.oracle_id) continue
      
      const row = cardToRow(card, now)
      batch.push(row)
      total++
      
      if (batch.length >= BATCH_SIZE) {
        if (!dryRun) {
          const { error } = await supabase
            .from('ref_printings')
            .upsert(batch, { onConflict: 'scryfall_id' })
          
          if (error) {
            console.error(`Batch error: ${error.message}`)
            failed += batch.length
          } else {
            upserted += batch.length
          }
        } else {
          upserted += batch.length
        }
        
        batch = []
        
        if (total % 10000 === 0) {
          console.log(`  Processed ${total.toLocaleString()} cards...`)
        }
      }
    } catch (e) {
      // Skip malformed lines
      failed++
    }
  }
  
  // Final batch
  if (batch.length > 0) {
    if (!dryRun) {
      const { error } = await supabase
        .from('scryfall_printings')
        .upsert(batch, { onConflict: 'scryfall_id' })
      
      if (error) {
        console.error(`Final batch error: ${error.message}`)
        failed += batch.length
      } else {
        upserted += batch.length
      }
    } else {
      upserted += batch.length
    }
  }
  
  return { total, upserted, failed }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')
  
  console.log('=== Scryfall Printings Sync ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log('')
  
  try {
    // Get bulk data info
    const bulkInfo = await getBulkDataInfo()
    console.log(`Scryfall data updated: ${bulkInfo.updated_at}`)
    console.log(`Compressed size: ${(bulkInfo.size / 1024 / 1024).toFixed(1)} MB`)
    
    // Check if we need to sync
    if (!force) {
      const lastSync = await checkLastSync()
      if (lastSync && lastSync >= bulkInfo.updated_at) {
        console.log(`\nAlready synced (last: ${lastSync}). Use --force to re-sync.`)
        return
      }
    }
    
    // Download bulk data
    await downloadBulkData(bulkInfo.jsonl_download_uri)
    
    // Process and upsert
    const result = await processAndUpsert(dryRun)
    
    console.log('\n=== Summary ===')
    console.log(`Total cards processed: ${result.total.toLocaleString()}`)
    console.log(`Upserted: ${result.upserted.toLocaleString()}`)
    console.log(`Failed: ${result.failed.toLocaleString()}`)
    
    // Update sync timestamp
    if (!dryRun && result.failed === 0) {
      await updateLastSync(bulkInfo.updated_at)
      console.log(`\nSync timestamp updated to: ${bulkInfo.updated_at}`)
    }
    
    // Cleanup
    if (existsSync(TEMP_FILE)) {
      unlinkSync(TEMP_FILE)
      console.log('Temp file cleaned up.')
    }
    
    console.log('\nDone!')
    
  } catch (error) {
    console.error('Sync failed:', error)
    process.exit(1)
  }
}

main()
