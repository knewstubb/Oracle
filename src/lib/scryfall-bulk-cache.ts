/**
 * Scryfall bulk data cache manager.
 *
 * Downloads the "default_cards" JSON (all printings) from Scryfall and caches
 * it locally. Re-downloads if the cache is older than 7 days.
 *
 * Cache location: data/scryfall-bulk-default-cards.json
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulkCacheOptions {
  /** Override cache directory (default: process.cwd()/data) */
  cacheDir?: string
  /** Max cache age in milliseconds (default: 7 days) */
  maxAgeMs?: number
}

export interface ScryfallPrintingRecord {
  scryfallId: string
  oracleId: string
  cardName: string
  set: string
  collectorNumber: string
}

export interface ScryfallBulkIndex {
  /** Map from scryfall_id (printing UUID) → printing record */
  byPrintingId: Map<string, ScryfallPrintingRecord>
  /** Map from "set_code|collector_number" → scryfall_id (first match) */
  bySetCollector: Map<string, string>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CACHE_FILENAME = 'scryfall-bulk-default-cards.json'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const SCRYFALL_BULK_DATA_URL = 'https://api.scryfall.com/bulk-data'
const USER_AGENT = 'TheOracle/0.1.0'

/**
 * Determine the cache directory based on environment.
 * On Vercel (serverless), use /tmp which is the only writable directory.
 * Locally, use process.cwd()/data as before.
 */
function getDefaultCacheDir(): string {
  // VERCEL env var is set by Vercel's build & runtime environment
  if (process.env.VERCEL) {
    return '/tmp'
  }
  return join(process.cwd(), 'data')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure the bulk data file is present and fresh.
 * Downloads from Scryfall if the cached file is missing or older than maxAgeMs.
 * Returns the absolute path to the cached file.
 */
export async function ensureBulkData(options?: BulkCacheOptions): Promise<string> {
  const cacheDir = options?.cacheDir ?? getDefaultCacheDir()
  const maxAgeMs = options?.maxAgeMs ?? SEVEN_DAYS_MS
  const cacheFilePath = join(cacheDir, DEFAULT_CACHE_FILENAME)

  // Ensure the cache directory exists
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }

  // Check if cache file exists and is fresh
  if (existsSync(cacheFilePath)) {
    const stats = statSync(cacheFilePath)
    const ageMs = Date.now() - stats.mtimeMs
    if (ageMs < maxAgeMs) {
      return cacheFilePath
    }
  }

  // Download fresh bulk data
  const downloadUrl = await resolveBulkDataDownloadUrl()
  await downloadBulkData(downloadUrl, cacheFilePath)

  return cacheFilePath
}

/**
 * Read and parse the bulk data file, building the index structures.
 * Uses readFileSync + JSON.parse since no streaming JSON parser is installed.
 *
 * Builds:
 * - byPrintingId: scryfallId → ScryfallPrintingRecord
 * - bySetCollector: "set|collector_number" → scryfallId (first match wins)
 */
export function buildIndexFromFile(filePath: string): ScryfallBulkIndex {
  const raw = readFileSync(filePath, 'utf-8')
  const cards: ScryfallBulkCard[] = JSON.parse(raw)

  const byPrintingId = new Map<string, ScryfallPrintingRecord>()
  const bySetCollector = new Map<string, string>()

  for (const card of cards) {
    // Skip entries without required fields
    if (!card.id || !card.oracle_id || !card.name) continue

    const record: ScryfallPrintingRecord = {
      scryfallId: card.id,
      oracleId: card.oracle_id,
      cardName: card.name,
      set: card.set,
      collectorNumber: card.collector_number,
    }

    byPrintingId.set(card.id, record)

    // Only store the first match for a given set+collector pair
    const setCollectorKey = `${card.set}|${card.collector_number}`
    if (!bySetCollector.has(setCollectorKey)) {
      bySetCollector.set(setCollectorKey, card.id)
    }
  }

  return { byPrintingId, bySetCollector }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Shape of a card entry in Scryfall's default_cards bulk data */
interface ScryfallBulkCard {
  id: string
  oracle_id: string
  name: string
  set: string
  collector_number: string
  [key: string]: unknown
}

/**
 * Query the Scryfall bulk-data endpoint to get the download URI
 * for the "default_cards" file.
 */
async function resolveBulkDataDownloadUrl(): Promise<string> {
  const response = await fetch(SCRYFALL_BULK_DATA_URL, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Scryfall bulk-data catalog: ${response.status} ${response.statusText}`
    )
  }

  const catalog = (await response.json()) as { data: Array<{ type: string; download_uri: string }> }
  const defaultCards = catalog.data.find((entry) => entry.type === 'default_cards')

  if (!defaultCards) {
    throw new Error('Scryfall bulk-data catalog does not contain a "default_cards" entry')
  }

  return defaultCards.download_uri
}

/**
 * Download a file from the given URL and write it to disk.
 * Uses streaming via response.arrayBuffer() to handle large files.
 */
async function downloadBulkData(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    throw new Error(
      `Failed to download Scryfall bulk data: ${response.status} ${response.statusText}`
    )
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  writeFileSync(destPath, buffer)
}
