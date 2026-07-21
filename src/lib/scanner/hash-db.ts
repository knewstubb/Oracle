/**
 * Hash Database Loader + LSH Index
 *
 * Loads the pre-built dHash database from /scan/hash-db.json and provides
 * fast nearest-neighbor lookup using Locality-Sensitive Hashing (LSH).
 *
 * LSH approach:
 * - Split each 64-bit hash into 8-bit segments (8 segments per hash)
 * - Each segment becomes a bucket key in its own hash table
 * - For a query: check all 8 tables → collect candidate entries → rank by full Hamming distance
 * - This reduces comparison from O(N) to O(bucket_size * 8) ≈ O(~800) for 100K entries
 *
 * Expected performance:
 * - Load time: ~200ms for 100K entries (parse JSON + build index)
 * - Query time: < 5ms per lookup
 */

import { hexToHash, hammingDistance } from '@/lib/scanner/dhash'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HashDBEntry {
  /** dHash as 16-char hex string */
  h: string
  /** Scryfall ID */
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

export interface MatchResult {
  entry: HashDBEntry
  distance: number
}

// ---------------------------------------------------------------------------
// LSH Index
// ---------------------------------------------------------------------------

/** Number of 8-bit segments to split the 64-bit hash into */
const NUM_TABLES = 8

/**
 * LSH index for fast approximate nearest-neighbor search on 64-bit hashes.
 */
class LSHIndex {
  /** 8 hash tables, each mapping an 8-bit bucket key → array of entry indices */
  private tables: Map<number, number[]>[] = []
  private entries: HashDBEntry[] = []
  private hashes: bigint[] = []

  constructor(entries: HashDBEntry[]) {
    this.entries = entries
    this.hashes = entries.map(e => hexToHash(e.h))

    // Build 8 tables
    for (let t = 0; t < NUM_TABLES; t++) {
      const table = new Map<number, number[]>()
      for (let i = 0; i < entries.length; i++) {
        const bucket = this.getBucket(this.hashes[i], t)
        const existing = table.get(bucket)
        if (existing) {
          existing.push(i)
        } else {
          table.set(bucket, [i])
        }
      }
      this.tables.push(table)
    }
  }

  /**
   * Find the top-K nearest matches for a query hash.
   */
  findMatches(queryHash: bigint, topK: number = 5, maxDistance: number = 12): MatchResult[] {
    // Collect candidate indices from all tables
    const candidateSet = new Set<number>()

    for (let t = 0; t < NUM_TABLES; t++) {
      const bucket = this.getBucket(queryHash, t)
      const entries = this.tables[t].get(bucket)
      if (entries) {
        for (const idx of entries) {
          candidateSet.add(idx)
        }
      }

      // Also check neighboring buckets (±1) for more recall
      const neighbors = [bucket - 1, bucket + 1].filter(b => b >= 0 && b <= 255)
      for (const nb of neighbors) {
        const entries = this.tables[t].get(nb)
        if (entries) {
          for (const idx of entries) {
            candidateSet.add(idx)
          }
        }
      }
    }

    // Rank candidates by Hamming distance
    const results: MatchResult[] = []
    for (const idx of candidateSet) {
      const dist = hammingDistance(queryHash, this.hashes[idx])
      if (dist <= maxDistance) {
        results.push({ entry: this.entries[idx], distance: dist })
      }
    }

    // Sort by distance, take top K
    results.sort((a, b) => a.distance - b.distance)
    return results.slice(0, topK)
  }

  /** Get the 8-bit bucket key for a given table (segment) index */
  private getBucket(hash: bigint, tableIndex: number): number {
    return Number((hash >> BigInt(tableIndex * 8)) & 0xFFn)
  }

  get size(): number {
    return this.entries.length
  }
}

// ---------------------------------------------------------------------------
// Database Singleton
// ---------------------------------------------------------------------------

let dbInstance: LSHIndex | null = null
let loadPromise: Promise<LSHIndex> | null = null

/**
 * Load the hash database. Returns the cached instance if already loaded.
 * Safe to call multiple times — deduplicates concurrent loads.
 */
export async function loadHashDB(): Promise<LSHIndex> {
  if (dbInstance) return dbInstance

  if (!loadPromise) {
    loadPromise = doLoad()
  }

  return loadPromise
}

async function doLoad(): Promise<LSHIndex> {
  const startTime = performance.now()

  // Try gzipped first, fall back to uncompressed
  let entries: HashDBEntry[]

  try {
    const res = await fetch('/scan/hash-db.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    entries = await res.json()
  } catch (err) {
    console.warn('[hash-db] Failed to load hash database:', err)
    entries = []
  }

  const index = new LSHIndex(entries)
  dbInstance = index

  const elapsed = (performance.now() - startTime).toFixed(0)
  console.log(`[hash-db] Loaded ${index.size} entries in ${elapsed}ms`)

  return index
}

/**
 * Query the hash database for matches. Loads the DB if not already loaded.
 *
 * Returns top-K matches sorted by distance.
 */
export async function findCardMatches(
  queryHash: bigint,
  topK: number = 5,
  maxDistance: number = 12
): Promise<MatchResult[]> {
  const index = await loadHashDB()
  return index.findMatches(queryHash, topK, maxDistance)
}

/**
 * Check if the hash database is loaded and ready.
 */
export function isHashDBReady(): boolean {
  return dbInstance !== null && dbInstance.size > 0
}

/**
 * Get the number of entries in the loaded database.
 */
export function getHashDBSize(): number {
  return dbInstance?.size ?? 0
}
