#!/usr/bin/env npx tsx
/**
 * Backfill Script: Collection → Physical Copies
 *
 * Migrates all rows from the `collection` table into the instance-level
 * `physical_copies` table (one row per physical card).
 *
 * For each collection row:
 *   1. Resolve/upsert card_definitions entry using oracle_id from Scryfall API
 *   2. Insert N physical_copies rows (one per quantity unit)
 *   3. Map foil → is_foil, normalize condition, set source_tag = 'backfill'
 *   4. Carry over storage_location_id
 *
 * Idempotency: Skips collection rows whose scryfall_id (or resolved printing id)
 * already exists as scryfall_printing_id in physical_copies with source_tag = 'backfill'.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local before any other imports
config({ path: resolve(__dirname, '..', '.env.local') })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollectionRow {
  id: number
  card_name: string
  scryfall_id: string | null
  set_code: string | null
  quantity: number
  foil: boolean
  condition: string | null
  storage_location_id: number | null
  collector_number: string | null
  user_id: string
}

interface BackfillFailure {
  collectionId: number
  cardName: string
  setCode: string | null
  collectorNumber: string | null
  reason: string
}

interface BackfillSummary {
  totalCollectionRows: number
  skipped: number        // already backfilled (idempotency)
  inserted: number       // physical_copies rows created
  failed: number         // identity resolution failures
  failures: BackfillFailure[]
  durationMs: number
}

// ---------------------------------------------------------------------------
// Condition normalization
// ---------------------------------------------------------------------------

type PhysicalCondition =
  | 'near_mint'
  | 'lightly_played'
  | 'moderately_played'
  | 'heavily_played'
  | 'damaged'

/**
 * Normalize condition from the collection table format to the physical_copies enum.
 * Returns null for NULL or unrecognized values per Requirement 2.5.
 */
function normalizeCondition(condition: string | null): PhysicalCondition | null {
  if (!condition) return null

  const mapping: Record<string, PhysicalCondition> = {
    'Near Mint': 'near_mint',
    'Lightly Played': 'lightly_played',
    'Moderately Played': 'moderately_played',
    'Heavily Played': 'heavily_played',
    'Damaged': 'damaged',
  }

  return mapping[condition] ?? null
}

// ---------------------------------------------------------------------------
// Scryfall API helpers
// ---------------------------------------------------------------------------

/** Rate-limit delay between Scryfall API calls (75ms per their guidelines). */
const SCRYFALL_DELAY_MS = 75

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Fetch oracle_id from Scryfall by scryfall_id (card UUID).
 * Returns { oracleId, cardName } or null on failure.
 */
async function fetchOracleIdByScryfallId(
  scryfallId: string
): Promise<{ oracleId: string; cardName: string } | null> {
  await delay(SCRYFALL_DELAY_MS)

  try {
    const response = await fetch(
      `https://api.scryfall.com/cards/${scryfallId}`,
      { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
    )

    if (!response.ok) return null

    const card = (await response.json()) as {
      oracle_id?: string
      name?: string
    }

    if (!card.oracle_id) return null

    return { oracleId: card.oracle_id, cardName: card.name ?? '' }
  } catch {
    return null
  }
}

/**
 * Fetch oracle_id from Scryfall by set_code + collector_number.
 * Returns { oracleId, cardName, scryfallId } or null on failure.
 */
async function fetchOracleIdBySetCollector(
  setCode: string,
  collectorNumber: string
): Promise<{ oracleId: string; cardName: string; scryfallId: string } | null> {
  await delay(SCRYFALL_DELAY_MS)

  try {
    const response = await fetch(
      `https://api.scryfall.com/cards/${encodeURIComponent(setCode.toLowerCase())}/${encodeURIComponent(collectorNumber)}`,
      { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
    )

    if (!response.ok) return null

    const card = (await response.json()) as {
      oracle_id?: string
      name?: string
      id?: string
    }

    if (!card.oracle_id || !card.id) return null

    return {
      oracleId: card.oracle_id,
      cardName: card.name ?? '',
      scryfallId: card.id,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Main backfill logic
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now()

  // Dynamic import after env is loaded
  const { createAdminClient } = await import('../src/lib/supabase')
  const supabase = createAdminClient()

  console.log('[backfill] Starting collection → physical_copies backfill...')

  // -------------------------------------------------------------------------
  // Step 1: Fetch all collection rows
  // Note: We use .select('*') and cast because the Supabase-generated types
  // may not yet include columns added by recent migrations (storage_location_id).
  // -------------------------------------------------------------------------
  const { data: rawRows, error: fetchError } = await supabase
    .from('collection')
    .select('*')
    .order('id', { ascending: true })

  if (fetchError) {
    console.error('[backfill] ❌ Failed to fetch collection rows:', fetchError.message)
    process.exit(1)
  }

  // Cast to our known interface (columns exist at runtime even if types are stale)
  const collectionRows = (rawRows ?? []) as unknown as CollectionRow[]

  if (collectionRows.length === 0) {
    console.log('[backfill] No collection rows found. Nothing to backfill.')
    return
  }

  console.log(`[backfill] Found ${collectionRows.length} collection rows to process.`)

  // -------------------------------------------------------------------------
  // Step 2: Fetch existing backfilled scryfall_printing_ids for idempotency
  // Note: source_tag column may not be in generated types yet, use RPC or raw query.
  // -------------------------------------------------------------------------
  const { data: existingCopies, error: existingError } = await supabase
    .from('physical_copies')
    .select('scryfall_printing_id, source_tag' as any)
    .eq('source_tag' as any, 'backfill')
    .not('scryfall_printing_id', 'is', null)

  if (existingError) {
    console.error('[backfill] ❌ Failed to fetch existing physical copies:', existingError.message)
    process.exit(1)
  }

  const alreadyBackfilled = new Set<string>(
    ((existingCopies ?? []) as any[])
      .map((row: any) => row.scryfall_printing_id)
      .filter((id: any): id is string => typeof id === 'string')
  )

  console.log(`[backfill] ${alreadyBackfilled.size} scryfall_printing_ids already backfilled (will skip).`)

  // -------------------------------------------------------------------------
  // Step 3: Process each collection row
  // -------------------------------------------------------------------------
  let skipped = 0
  let inserted = 0
  let failed = 0
  const failures: BackfillFailure[] = []

  for (let i = 0; i < collectionRows.length; i++) {
    const row = collectionRows[i] as CollectionRow
    const { id, card_name, scryfall_id, set_code, quantity, foil, condition, storage_location_id, collector_number, user_id } = row

    // Progress logging every 100 rows
    if (i > 0 && i % 100 === 0) {
      console.log(`[backfill] Progress: ${i}/${collectionRows.length} rows processed (inserted: ${inserted}, skipped: ${skipped}, failed: ${failed})`)
    }

    // Skip rows with quantity <= 0
    if (!quantity || quantity <= 0) {
      skipped++
      continue
    }

    // --- Identity resolution ---
    let resolvedScryfallId: string | null = scryfall_id ?? null
    let oracleId: string | null = null
    let resolvedCardName: string = card_name

    // Strategy 1: Use scryfall_id directly
    if (resolvedScryfallId) {
      // Check idempotency — skip if already backfilled
      if (alreadyBackfilled.has(resolvedScryfallId)) {
        skipped++
        continue
      }

      const result = await fetchOracleIdByScryfallId(resolvedScryfallId)
      if (result) {
        oracleId = result.oracleId
        resolvedCardName = result.cardName || card_name
      }
    }

    // Strategy 2: Fallback to set_code + collector_number (Req 2.7)
    if (!oracleId && set_code && collector_number) {
      const result = await fetchOracleIdBySetCollector(set_code, collector_number)
      if (result) {
        oracleId = result.oracleId
        resolvedCardName = result.cardName || card_name
        resolvedScryfallId = result.scryfallId

        // Check idempotency with the resolved scryfall_id
        if (alreadyBackfilled.has(resolvedScryfallId)) {
          skipped++
          continue
        }
      }
    }

    // If identity resolution failed entirely, log and skip (Req 2.8)
    if (!oracleId) {
      failed++
      failures.push({
        collectionId: id,
        cardName: card_name,
        setCode: set_code,
        collectorNumber: collector_number,
        reason: resolvedScryfallId
          ? `Scryfall API returned no oracle_id for scryfall_id: ${resolvedScryfallId}`
          : 'No scryfall_id and set_code+collector_number resolution failed',
      })
      continue
    }

    // --- Ensure card_definition exists (Req 2.2) ---
    let cardDefinitionId: number

    try {
      // Check if card_definition already exists
      const { data: existingDef } = await supabase
        .from('card_definitions')
        .select('id')
        .eq('oracle_id', oracleId)
        .maybeSingle()

      if (existingDef) {
        cardDefinitionId = existingDef.id
      } else {
        // Insert new card_definition
        const { data: newDef, error: defError } = await supabase
          .from('card_definitions')
          .insert({ oracle_id: oracleId, card_name: resolvedCardName, user_id })
          .select('id')
          .single()

        if (defError) {
          // Race condition: handle duplicate key
          if (defError.code === '23505') {
            const { data: retry } = await supabase
              .from('card_definitions')
              .select('id')
              .eq('oracle_id', oracleId)
              .single()
            if (retry) {
              cardDefinitionId = retry.id
            } else {
              throw new Error(`Failed to resolve card_definition after conflict: ${oracleId}`)
            }
          } else {
            throw new Error(`Failed to create card_definition: ${defError.message}`)
          }
        } else {
          cardDefinitionId = newDef.id
        }
      }
    } catch (err) {
      failed++
      failures.push({
        collectionId: id,
        cardName: card_name,
        setCode: set_code,
        collectorNumber: collector_number,
        reason: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    // --- Also ensure oracle_to_printings mapping exists ---
    if (resolvedScryfallId) {
      try {
        await supabase
          .from('oracle_to_printings')
          .upsert(
            { oracle_id: oracleId, scryfall_printing_id: resolvedScryfallId },
            { onConflict: 'oracle_id,scryfall_printing_id' }
          )
      } catch {
        // Non-fatal — just log and continue
        console.warn(`[backfill] Warning: Failed to upsert oracle_to_printings for ${oracleId} / ${resolvedScryfallId}`)
      }
    }

    // --- Insert N physical_copies rows (Req 2.3) ---
    const normalizedCondition = normalizeCondition(condition)
    const isFoil = Boolean(foil)

    // Build row objects. source_tag and storage_location_id may not be in
    // Supabase-generated types yet (added by migration 007), so we cast.
    const rowsToInsert = Array.from({ length: quantity }, () => ({
      card_definition_id: cardDefinitionId,
      scryfall_printing_id: resolvedScryfallId,
      is_foil: isFoil,
      is_proxy: false,
      condition: normalizedCondition,
      source_tag: 'backfill',
      storage_location_id: storage_location_id ?? null,
      user_id,
    }))

    try {
      // Insert in batches of 500 to avoid payload limits
      const BATCH_SIZE = 500
      for (let batchStart = 0; batchStart < rowsToInsert.length; batchStart += BATCH_SIZE) {
        const batch = rowsToInsert.slice(batchStart, batchStart + BATCH_SIZE)
        const { error: insertError } = await (supabase
          .from('physical_copies')
          .insert(batch as any))

        if (insertError) {
          throw new Error(`Insert batch failed: ${insertError.message}`)
        }
      }

      inserted += quantity

      // Track for future idempotency within this run
      if (resolvedScryfallId) {
        alreadyBackfilled.add(resolvedScryfallId)
      }
    } catch (err) {
      failed++
      failures.push({
        collectionId: id,
        cardName: card_name,
        setCode: set_code,
        collectorNumber: collector_number,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Summary
  // -------------------------------------------------------------------------
  const durationMs = Date.now() - startTime
  const summary: BackfillSummary = {
    totalCollectionRows: collectionRows.length,
    skipped,
    inserted,
    failed,
    failures,
    durationMs,
  }

  const elapsed = (durationMs / 1000).toFixed(1)
  console.log(`\n[backfill] ✅ Backfill complete in ${elapsed}s`)
  console.log(`  Total collection rows: ${summary.totalCollectionRows}`)
  console.log(`  Skipped (idempotent):  ${summary.skipped}`)
  console.log(`  Physical copies created: ${summary.inserted}`)
  console.log(`  Failed:                ${summary.failed}`)

  if (summary.failures.length > 0) {
    console.log(`\n  ⚠️  Failures (${summary.failures.length}):`)
    for (const f of summary.failures.slice(0, 20)) {
      console.log(`    - [${f.collectionId}] ${f.cardName} (${f.setCode ?? '?'}/${f.collectorNumber ?? '?'}) — ${f.reason}`)
    }
    if (summary.failures.length > 20) {
      console.log(`    ... and ${summary.failures.length - 20} more`)
    }
  }
}

main().catch(err => {
  console.error('[backfill] ❌ Unhandled error:', err)
  process.exit(1)
})
