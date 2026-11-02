/**
 * Card data sync — downloads Scryfall's "Default Cards" bulk file and upserts it
 * into ref_printings. Shared by scripts/sync-scryfall-printings.ts and
 * POST /api/card-data/refresh. Upserts only: nothing is ever deleted.
 *
 * Server-only (uses node fs/zlib).
 */

import { createReadStream, createWriteStream, existsSync, unlinkSync } from 'fs'
import { createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { tmpdir } from 'os'
import { join } from 'path'
import * as readline from 'readline'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapScryfallFinishes, type ImportFinish } from '@/lib/import-copies'

export const SYNC_META_KEY = 'printings_last_sync'
export const BATCH_SIZE = 500
const BULK_DATA_API = 'https://api.scryfall.com/bulk-data'
const USER_AGENT = 'TheOracle/1.0 (https://github.com/bradknewstubb/the-oracle)'
/** ref_printings.cmc is NUMERIC(5,2): the largest storable value. */
const CMC_MAX = 999.99

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageUris {
  small?: string
  normal?: string
  large?: string
  art_crop?: string
}

export interface ScryfallCard {
  id: string
  oracle_id?: string
  name: string
  set: string
  set_name: string
  collector_number: string
  rarity: string
  prices?: {
    usd?: string | null
    usd_foil?: string | null
    eur?: string | null
    eur_foil?: string | null
  }
  image_uris?: ImageUris
  card_faces?: Array<{ image_uris?: ImageUris }>
  type_line?: string
  mana_cost?: string
  cmc?: number
  colors?: string[]
  color_identity?: string[]
  legalities?: { commander?: string }
  layout?: string
  released_at?: string
  reprint?: boolean
  digital?: boolean
  /** Scryfall per-printing finishes: nonfoil, foil, etched, glossy. */
  finishes?: string[]
}

export interface PrintingRow {
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
  /** Subset of nonfoil/foil/etched, or null when Scryfall gave none. */
  finishes: ImportFinish[] | null
  updated_at: string
}

export interface SyncResult {
  skipped: boolean
  total: number
  upserted: number
  failed: number
  /** Up to a few ids of rows that could not be saved. */
  failedIds: string[]
  /** First error message seen, if any. */
  firstError: string | null
  /** Timestamp recorded in sync_meta (Scryfall's bulk-file date). */
  syncedAt: string | null
}

export interface SyncOptions {
  force?: boolean
  dryRun?: boolean
  onProgress?: (message: string, processed: number) => void
  onError?: (message: string) => void
  fetchImpl?: typeof fetch
  tempFile?: string
}

type Db = Pick<SupabaseClient, 'from'>

// ---------------------------------------------------------------------------
// Row conversion
// ---------------------------------------------------------------------------

export function parsePrice(price: string | null | undefined): number | null {
  if (!price) return null
  const parsed = parseFloat(price)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * The cmc column holds at most 999.99. Scryfall has joke cards (Gleemax) with a
 * cmc of 1,000,000; storing them overflowed the column and failed whole batches.
 * Out-of-range values are stored as null (unknown) instead.
 */
export function sanitizeCmc(cmc: number | null | undefined): number | null {
  if (cmc === null || cmc === undefined || !Number.isFinite(cmc)) return null
  if (cmc < 0 || cmc > CMC_MAX) return null
  return cmc
}

export function getImageUris(card: ScryfallCard) {
  const pick = (u: ImageUris) => ({
    small: u.small || null,
    normal: u.normal || null,
    large: u.large || null,
    art_crop: u.art_crop || null,
  })
  if (card.image_uris) return pick(card.image_uris)
  const face = card.card_faces?.[0]?.image_uris
  if (face) return pick(face)
  return { small: null, normal: null, large: null, art_crop: null }
}

export function cardToRow(card: ScryfallCard, now: string): PrintingRow {
  const images = getImageUris(card)
  return {
    scryfall_id: card.id,
    oracle_id: card.oracle_id as string,
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
    cmc: sanitizeCmc(card.cmc),
    colors: card.colors || null,
    color_identity: card.color_identity || null,
    legality_commander: card.legalities?.commander || null,
    layout: card.layout || null,
    released_at: card.released_at || null,
    reprint: card.reprint ?? false,
    digital: card.digital ?? false,
    finishes: mapScryfallFinishes(card.finishes),
    updated_at: now,
  }
}

/** Keeps the last row per scryfall_id (one upsert batch may not repeat a key). */
export function dedupeRows(rows: PrintingRow[]): PrintingRow[] {
  const byId = new Map<string, PrintingRow>()
  for (const r of rows) byId.set(r.scryfall_id, r)
  return [...byId.values()]
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

interface BatchOutcome {
  upserted: number
  failed: number
  failedIds: string[]
  firstError: string | null
}

const MAX_FAILED_IDS = 5

/**
 * Upserts one batch. On failure the batch is split in half and retried so one
 * bad row only costs itself, not 500 neighbours. Errors and a few offending ids
 * are reported through onError.
 */
export async function upsertBatch(
  db: Db,
  rows: PrintingRow[],
  onError?: (message: string) => void
): Promise<BatchOutcome> {
  const out: BatchOutcome = { upserted: 0, failed: 0, failedIds: [], firstError: null }
  if (rows.length === 0) return out

  const { error } = await db.from('ref_printings').upsert(rows, { onConflict: 'scryfall_id' })
  if (!error) {
    out.upserted = rows.length
    return out
  }

  if (rows.length === 1) {
    out.failed = 1
    out.failedIds = [rows[0].scryfall_id]
    out.firstError = error.message
    onError?.(`Could not save ${rows[0].name} (${rows[0].scryfall_id}): ${error.message}`)
    return out
  }

  const mid = Math.ceil(rows.length / 2)
  for (const half of [rows.slice(0, mid), rows.slice(mid)]) {
    const r = await upsertBatch(db, half, onError)
    out.upserted += r.upserted
    out.failed += r.failed
    out.firstError = out.firstError ?? r.firstError
    for (const id of r.failedIds) {
      if (out.failedIds.length < MAX_FAILED_IDS) out.failedIds.push(id)
    }
  }
  return out
}

/** Reads Scryfall JSONL lines, converts and upserts in batches. */
export async function upsertPrintingsFromLines(
  db: Db,
  lines: AsyncIterable<string>,
  opts: Pick<SyncOptions, 'dryRun' | 'onProgress' | 'onError'> = {}
): Promise<Omit<SyncResult, 'skipped' | 'syncedAt'>> {
  const now = new Date().toISOString()
  const res = { total: 0, upserted: 0, failed: 0, failedIds: [] as string[], firstError: null as string | null }
  let batch: PrintingRow[] = []

  const flush = async () => {
    if (batch.length === 0) return
    const rows = dedupeRows(batch)
    batch = []
    if (opts.dryRun) {
      res.upserted += rows.length
      return
    }
    const r = await upsertBatch(db, rows, opts.onError)
    res.upserted += r.upserted
    res.failed += r.failed
    res.firstError = res.firstError ?? r.firstError
    for (const id of r.failedIds) {
      if (res.failedIds.length < MAX_FAILED_IDS) res.failedIds.push(id)
    }
  }

  for await (const line of lines) {
    if (!line.trim()) continue
    let card: ScryfallCard
    try {
      card = JSON.parse(line)
    } catch {
      res.failed++
      res.firstError = res.firstError ?? 'A line in the Scryfall file could not be read'
      opts.onError?.('Skipped an unreadable line in the Scryfall file')
      continue
    }
    // Tokens/emblems without an oracle_id are not real cards.
    if (!card.oracle_id) continue

    batch.push(cardToRow(card, now))
    res.total++
    if (batch.length >= BATCH_SIZE) {
      await flush()
      if (res.total % 10000 === 0) opts.onProgress?.(`Saved ${res.total.toLocaleString()} cards…`, res.total)
    }
  }
  await flush()
  opts.onProgress?.(`Saved ${res.total.toLocaleString()} cards…`, res.total)
  return res
}

// ---------------------------------------------------------------------------
// sync_meta
// ---------------------------------------------------------------------------

export async function getLastSync(db: Db): Promise<string | null> {
  const { data, error } = await db.from('sync_meta').select('value').eq('key', SYNC_META_KEY).maybeSingle()
  if (error || !data) return null
  return (data as { value: string }).value ?? null
}

export async function setLastSync(db: Db, timestamp: string): Promise<void> {
  const { error } = await db
    .from('sync_meta')
    .upsert({ key: SYNC_META_KEY, value: timestamp, updated_at: new Date().toISOString() })
  if (error) throw new Error(`Could not record the sync time: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Download + orchestration
// ---------------------------------------------------------------------------

export async function getBulkDataInfo(fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(BULK_DATA_API, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Scryfall returned ${response.status}`)
  const data = await response.json()
  if (!data || !Array.isArray(data.data)) throw new Error('Unexpected Scryfall response')
  const info = data.data.find((d: { type: string }) => d.type === 'default_cards')
  if (!info) throw new Error('Scryfall default cards file not found')
  const downloadUri: string | undefined = info.jsonl_download_uri
  if (!downloadUri) throw new Error('Scryfall default cards file has no download link')
  return { downloadUri, updatedAt: info.updated_at as string }
}

async function downloadBulkData(url: string, file: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/octet-stream' },
  })
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`)
  const reader = response.body.getReader()
  const nodeStream = new Readable({
    async read() {
      const { done, value } = await reader.read()
      if (done) this.push(null)
      else this.push(Buffer.from(value))
    },
  })
  await pipeline(nodeStream, createGunzip(), createWriteStream(file))
}

/**
 * Full refresh. Skips when already current unless `force`. Only records the new
 * last-sync time when every row saved.
 */
export async function runCardDataSync(db: Db, opts: SyncOptions = {}): Promise<SyncResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const file = opts.tempFile ?? join(tmpdir(), 'scryfall-default-cards.jsonl')
  const empty = { total: 0, upserted: 0, failed: 0, failedIds: [], firstError: null }

  opts.onProgress?.('Checking Scryfall…', 0)
  const bulk = await getBulkDataInfo(fetchImpl)

  if (!opts.force) {
    const last = await getLastSync(db)
    if (last && last >= bulk.updatedAt) {
      return { skipped: true, ...empty, syncedAt: last }
    }
  }

  try {
    opts.onProgress?.('Downloading the latest card list…', 0)
    await downloadBulkData(bulk.downloadUri, file, fetchImpl)

    opts.onProgress?.('Saving cards…', 0)
    const rl = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity })
    const result = await upsertPrintingsFromLines(db, rl, opts)

    let syncedAt: string | null = null
    if (!opts.dryRun && result.failed === 0) {
      await setLastSync(db, bulk.updatedAt)
      syncedAt = bulk.updatedAt
    }
    return { skipped: false, ...result, syncedAt }
  } finally {
    if (existsSync(file)) unlinkSync(file)
  }
}
