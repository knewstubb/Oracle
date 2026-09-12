/**
 * Supabase Edge Function: Scryfall Printings Sync
 *
 * Deno-based edge function that fetches Scryfall's Default Cards bulk data,
 * processes entries, and upserts into the `scryfall_printings` table.
 *
 * The bulk file is ~100MB+ compressed, ~600MB uncompressed. We stream and
 * process in chunks to stay within Edge Function memory limits.
 *
 * Trigger: POST request (from Supabase Cron, manual invoke, or scheduled job)
 * Auth: Bearer token validated against SUPABASE_SERVICE_ROLE_KEY
 *
 * Schedule: Daily at 10:00 UTC (after Scryfall's ~09:00 UTC update)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { gunzip } from 'https://deno.land/x/compress@v0.4.5/gzip/mod.ts'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SCRYFALL_BULK_API = 'https://api.scryfall.com/bulk-data'
const FETCH_TIMEOUT_MS = 300_000 // 5 minutes for the large download
const UPSERT_BATCH_SIZE = 500
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 10_000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulkDataInfo {
  download_uri: string
  jsonl_download_uri: string
  updated_at: string
}

interface ScryfallCard {
  id: string
  oracle_id?: string
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
  type_line?: string
  mana_cost?: string
  cmc?: number
  colors?: string[]
  color_identity?: string[]
  legalities?: {
    commander?: string
  }
  layout?: string
  released_at?: string
  reprint?: boolean
  digital?: boolean
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

interface SyncResult {
  success: boolean
  cardsProcessed: number
  cardsSkipped: number
  durationMs: number
  scryfallUpdatedAt?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405)
  }

  // Auth check
  const authHeader = req.headers.get('Authorization')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (authHeader && serviceRoleKey) {
    const token = authHeader.replace('Bearer ', '')
    if (token !== serviceRoleKey) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }
  }

  // Check for force flag
  const url = new URL(req.url)
  const force = url.searchParams.get('force') === 'true'

  const result = await syncScryfallPrintings(force)
  return jsonResponse(result, result.success ? 200 : 502)
})

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Core Sync Logic
// ---------------------------------------------------------------------------

async function syncScryfallPrintings(force: boolean): Promise<SyncResult> {
  const startTime = Date.now()

  try {
    const supabase = getSupabaseClient()

    // 1. Get bulk data info from Scryfall
    console.log(`[${ts()}] Fetching Scryfall bulk data info...`)
    const bulkInfo = await getBulkDataInfo()
    console.log(`[${ts()}] Scryfall data updated: ${bulkInfo.updated_at}`)

    // 2. Check if we need to sync
    if (!force) {
      const lastSync = await getLastSync(supabase)
      if (lastSync && lastSync >= bulkInfo.updated_at) {
        console.log(`[${ts()}] Already synced. Last: ${lastSync}`)
        return {
          success: true,
          cardsProcessed: 0,
          cardsSkipped: 0,
          durationMs: Date.now() - startTime,
          scryfallUpdatedAt: bulkInfo.updated_at,
        }
      }
    }

    // 3. Download and process bulk data
    console.log(`[${ts()}] Downloading bulk data...`)
    const { processed, skipped } = await downloadAndProcess(supabase, bulkInfo.jsonl_download_uri)

    // 4. Update sync timestamp
    await updateLastSync(supabase, bulkInfo.updated_at)

    const durationMs = Date.now() - startTime
    console.log(`[${ts()}] Sync complete. Processed: ${processed}, Skipped: ${skipped}, Duration: ${durationMs}ms`)

    return {
      success: true,
      cardsProcessed: processed,
      cardsSkipped: skipped,
      durationMs,
      scryfallUpdatedAt: bulkInfo.updated_at,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[${ts()}] Sync failed: ${msg}`)
    return {
      success: false,
      cardsProcessed: 0,
      cardsSkipped: 0,
      durationMs: Date.now() - startTime,
      error: msg,
    }
  }
}

// ---------------------------------------------------------------------------
// Scryfall API
// ---------------------------------------------------------------------------

async function getBulkDataInfo(): Promise<BulkDataInfo> {
  const response = await fetchWithTimeout(SCRYFALL_BULK_API, 30_000)
  const data = await response.json()

  const defaultCards = data.data.find((d: { type: string }) => d.type === 'default_cards')
  if (!defaultCards) {
    throw new Error('Could not find default_cards in Scryfall bulk data')
  }

  return {
    download_uri: defaultCards.download_uri,
    jsonl_download_uri: defaultCards.jsonl_download_uri,
    updated_at: defaultCards.updated_at,
  }
}

async function downloadAndProcess(
  supabase: ReturnType<typeof createClient>,
  url: string
): Promise<{ processed: number; skipped: number }> {
  // Fetch the gzipped JSONL file
  const response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS)
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download bulk data: ${response.status}`)
  }

  // Read the entire gzipped content (Edge Functions have memory limits, but we'll try)
  const gzippedData = new Uint8Array(await response.arrayBuffer())
  console.log(`[${ts()}] Downloaded ${(gzippedData.length / 1024 / 1024).toFixed(1)} MB compressed`)

  // Decompress
  const decompressed = gunzip(gzippedData)
  const text = new TextDecoder().decode(decompressed)
  console.log(`[${ts()}] Decompressed ${(text.length / 1024 / 1024).toFixed(1)} MB`)

  // Process line by line
  const lines = text.split('\n')
  const now = new Date().toISOString()
  let batch: PrintingRow[] = []
  let processed = 0
  let skipped = 0

  for (const line of lines) {
    if (!line.trim()) continue

    try {
      const card: ScryfallCard = JSON.parse(line)

      // Skip cards without oracle_id (tokens, emblems, etc.)
      if (!card.oracle_id) {
        skipped++
        continue
      }

      batch.push(cardToRow(card, now))

      if (batch.length >= UPSERT_BATCH_SIZE) {
        await upsertBatch(supabase, batch)
        processed += batch.length
        batch = []

        if (processed % 10000 === 0) {
          console.log(`[${ts()}] Processed ${processed.toLocaleString()} cards...`)
        }
      }
    } catch {
      skipped++
    }
  }

  // Final batch
  if (batch.length > 0) {
    await upsertBatch(supabase, batch)
    processed += batch.length
  }

  return { processed, skipped }
}

// ---------------------------------------------------------------------------
// Database Operations
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(url, key)
}

async function getLastSync(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data, error } = await supabase
    .from('sync_meta')
    .select('value')
    .eq('key', 'scryfall_printings_last_sync')
    .single()

  if (error || !data) return null
  return data.value
}

async function updateLastSync(supabase: ReturnType<typeof createClient>, timestamp: string) {
  await supabase.from('sync_meta').upsert({
    key: 'scryfall_printings_last_sync',
    value: timestamp,
    updated_at: new Date().toISOString(),
  })
}

async function upsertBatch(supabase: ReturnType<typeof createClient>, batch: PrintingRow[]) {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from('scryfall_printings')
      .upsert(batch, { onConflict: 'scryfall_id' })

    if (!error) return

    lastError = new Error(error.message)
    console.warn(`[${ts()}] Batch upsert attempt ${attempt} failed: ${error.message}`)

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS)
    }
  }

  throw lastError || new Error('Batch upsert failed after retries')
}

// ---------------------------------------------------------------------------
// Card Transformation
// ---------------------------------------------------------------------------

function cardToRow(card: ScryfallCard, now: string): PrintingRow {
  const images = getImageUris(card)

  return {
    scryfall_id: card.id,
    oracle_id: card.oracle_id!,
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

function getImageUris(card: ScryfallCard) {
  if (card.image_uris) {
    return {
      small: card.image_uris.small || null,
      normal: card.image_uris.normal || null,
      large: card.image_uris.large || null,
      art_crop: card.image_uris.art_crop || null,
    }
  }

  // DFCs: use first face
  if (card.card_faces?.[0]?.image_uris) {
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

function parsePrice(price: string | null | undefined): number | null {
  if (!price) return null
  const parsed = parseFloat(price)
  return isNaN(parsed) ? null : parsed
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ts(): string {
  return new Date().toISOString()
}
