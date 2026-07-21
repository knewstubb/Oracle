/**
 * Build Hash Database for Card Scanner
 *
 * Downloads Scryfall's "unique_artwork" bulk data, fetches art_crop images,
 * computes dHash for each, and outputs a compressed JSON file.
 *
 * The output file is served as a static asset at /public/scan/hash-db.json
 * and loaded by the client-side scanner for real-time matching.
 *
 * Usage:
 *   npx tsx scripts/build-hash-db.ts
 *   npx tsx scripts/build-hash-db.ts --resume   (skip already-processed cards)
 *   npx tsx scripts/build-hash-db.ts --limit 500 (process only N cards, for testing)
 *
 * Output:
 *   the-oracle/public/scan/hash-db.json (~3-5MB)
 *
 * Runtime: ~4-6 hours for full 100K card database (rate-limited to 75ms/request)
 *
 * Requirements:
 *   - Node 18+ (fetch API)
 *   - sharp (image processing — npm install sharp)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScryfallCard {
  id: string
  oracle_id: string
  name: string
  set: string
  collector_number: string
  illustration_id?: string
  image_uris?: {
    art_crop?: string
    small?: string
    normal?: string
  }
  card_faces?: Array<{
    image_uris?: {
      art_crop?: string
    }
  }>
}

interface HashDBEntry {
  /** dHash as 16-char hex string */
  h: string
  /** Scryfall ID (representative printing) */
  s: string
  /** Card name */
  n: string
  /** Oracle ID */
  o: string
  /** Set code */
  c: string
  /** Collector number */
  r: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRYFALL_BULK_API = 'https://api.scryfall.com/bulk-data'
const RATE_LIMIT_MS = 50
const OUTPUT_DIR = resolve(__dirname, '../public/scan')
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'hash-db.json')
const PROGRESS_FILE = resolve(__dirname, '.hash-db-progress.json')
const USER_AGENT = 'TheOracle/0.1.0 (hash-db-builder)'

// ---------------------------------------------------------------------------
// dHash Implementation (Node.js version — uses sharp for image processing)
// ---------------------------------------------------------------------------

const HASH_WIDTH = 9
const HASH_HEIGHT = 8

async function computeDHashFromBuffer(imageBuffer: Buffer): Promise<bigint> {
  // Dynamically import sharp (may not be installed)
  const sharp = (await import('sharp')).default

  // Resize to 9x8, convert to grayscale, get raw pixel buffer
  const { data, info } = await sharp(imageBuffer)
    .resize(HASH_WIDTH, HASH_HEIGHT, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Compute horizontal gradient hash
  let hash = 0n
  for (let y = 0; y < HASH_HEIGHT; y++) {
    for (let x = 0; x < HASH_WIDTH - 1; x++) {
      const left = data[y * info.width + x]
      const right = data[y * info.width + x + 1]
      if (left < right) {
        hash |= 1n << BigInt(y * 8 + x)
      }
    }
  }

  return hash
}

function hashToHex(hash: bigint): string {
  return hash.toString(16).padStart(16, '0')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (res.status === 429) {
        // Rate limited — wait and retry
        const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10)
        console.log(`  Rate limited, waiting ${retryAfter}s...`)
        await sleep(retryAfter * 1000)
        continue
      }
      return res
    } catch (err) {
      if (attempt === retries - 1) throw err
      console.log(`  Fetch failed, retrying (${attempt + 1}/${retries})...`)
      await sleep(1000 * (attempt + 1))
    }
  }
  throw new Error(`Failed to fetch after ${retries} retries: ${url}`)
}

function getArtCropUrl(card: ScryfallCard): string | null {
  // Prefer top-level image_uris, fall back to first card_face
  if (card.image_uris?.art_crop) return card.image_uris.art_crop
  if (card.card_faces?.[0]?.image_uris?.art_crop) return card.card_faces[0].image_uris.art_crop
  return null
}

// ---------------------------------------------------------------------------
// Progress Management (for resume support)
// ---------------------------------------------------------------------------

interface Progress {
  processedIds: Set<string>
  entries: HashDBEntry[]
}

function loadProgress(): Progress {
  if (existsSync(PROGRESS_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'))
      return {
        processedIds: new Set(raw.processedIds ?? []),
        entries: raw.entries ?? [],
      }
    } catch {
      console.log('  Corrupted progress file, starting fresh')
    }
  }
  return { processedIds: new Set(), entries: [] }
}

function saveProgress(progress: Progress): void {
  writeFileSync(PROGRESS_FILE, JSON.stringify({
    processedIds: Array.from(progress.processedIds),
    entries: progress.entries,
  }))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const resume = args.includes('--resume')
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity

  console.log('=== Hash Database Builder ===')
  console.log(`Resume: ${resume}, Limit: ${limit === Infinity ? 'none' : limit}`)

  // 1. Get bulk data download URL
  console.log('\n1. Fetching Scryfall bulk data index...')
  const bulkRes = await fetch(SCRYFALL_BULK_API, { headers: { 'User-Agent': USER_AGENT } })
  if (!bulkRes.ok) throw new Error(`Failed to fetch bulk data index: ${bulkRes.status}`)
  const bulkData = await bulkRes.json()

  // Find the "unique_artwork" bulk file
  const uniqueArtwork = bulkData.data?.find((d: any) => d.type === 'unique_artwork')
  if (!uniqueArtwork) throw new Error('Could not find unique_artwork bulk data')

  console.log(`   Found: ${uniqueArtwork.name}`)
  console.log(`   Updated: ${uniqueArtwork.updated_at}`)
  console.log(`   Download: ${uniqueArtwork.download_uri}`)

  // 2. Download bulk JSON
  console.log('\n2. Downloading bulk card data...')
  const downloadRes = await fetchWithRetry(uniqueArtwork.download_uri)
  if (!downloadRes.ok) throw new Error(`Failed to download bulk data: ${downloadRes.status}`)
  const cards: ScryfallCard[] = await downloadRes.json()
  console.log(`   Got ${cards.length} unique artworks`)

  // 3. Load progress (for resume)
  const progress = resume ? loadProgress() : { processedIds: new Set<string>(), entries: [] }
  if (resume && progress.processedIds.size > 0) {
    console.log(`   Resuming from ${progress.processedIds.size} already processed`)
  }

  // 4. Process cards — fetch art_crop, compute dHash
  console.log('\n3. Processing cards...')
  const toProcess = cards.filter(c => !progress.processedIds.has(c.id)).slice(0, limit)
  console.log(`   ${toProcess.length} cards to process`)

  let processed = 0
  let skipped = 0
  let errors = 0
  const startTime = Date.now()

  for (const card of toProcess) {
    const artUrl = getArtCropUrl(card)
    if (!artUrl) {
      skipped++
      progress.processedIds.add(card.id)
      continue
    }

    try {
      // Fetch art_crop image
      const imgRes = await fetchWithRetry(artUrl)
      if (!imgRes.ok) {
        errors++
        progress.processedIds.add(card.id)
        continue
      }

      const imgBuffer = Buffer.from(await imgRes.arrayBuffer())

      // Compute dHash
      const hash = await computeDHashFromBuffer(imgBuffer)

      // Store entry
      progress.entries.push({
        h: hashToHex(hash),
        s: card.id,
        n: card.name,
        o: card.oracle_id,
        c: card.set,
        r: card.collector_number,
      })

      progress.processedIds.add(card.id)
      processed++

      // Progress logging
      if (processed % 100 === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = processed / elapsed
        const remaining = (toProcess.length - processed - skipped - errors) / rate
        console.log(
          `   ${processed}/${toProcess.length} processed ` +
          `(${skipped} skipped, ${errors} errors) — ` +
          `${rate.toFixed(1)} cards/sec, ~${Math.round(remaining / 60)}min remaining`
        )

        // Save progress every 100 cards
        saveProgress(progress)
      }

      // Rate limit
      await sleep(RATE_LIMIT_MS)

    } catch (err) {
      errors++
      progress.processedIds.add(card.id)
      if (errors % 10 === 0) {
        console.log(`   ${errors} errors so far (last: ${card.name})`)
      }
    }
  }

  // 5. Save final progress
  saveProgress(progress)

  // 6. Write output file
  console.log('\n4. Writing output...')
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(progress.entries))
  const sizeMB = (Buffer.byteLength(JSON.stringify(progress.entries)) / 1024 / 1024).toFixed(2)
  console.log(`   Written: ${OUTPUT_FILE}`)
  console.log(`   Entries: ${progress.entries.length}`)
  console.log(`   Size: ${sizeMB}MB (uncompressed)`)

  console.log('\n=== Done ===')
  console.log(`   Processed: ${processed}`)
  console.log(`   Skipped: ${skipped}`)
  console.log(`   Errors: ${errors}`)
  console.log(`   Total entries: ${progress.entries.length}`)
  console.log(`\n   Next: gzip the output for production serving:`)
  console.log(`   gzip -k ${OUTPUT_FILE}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
