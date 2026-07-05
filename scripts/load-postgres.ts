/**
 * Bulk insert transformed data into Supabase (Postgres).
 *
 * Loads tables in FK_Dependency_Order (7 waves, parents before children).
 * Uses the service role key for direct inserts bypassing RLS.
 *
 * Special handling:
 *   - Tables with GENERATED ALWAYS AS IDENTITY columns use raw SQL
 *     via OVERRIDING SYSTEM VALUE to preserve original IDs.
 *   - Duplicate key violations: logged and skipped (safe for re-runs).
 *   - FK constraint violations: halt immediately with detailed error.
 *   - Connection failures: retry with exponential backoff (3 attempts).
 *
 * Usage:
 *   npx tsx scripts/load-postgres.ts
 *
 * Reads from: scripts/transformed/ (transform-manifest.json + per-table JSON)
 * Requires:   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY env vars
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TRANSFORMED_DIR = join(process.cwd(), 'scripts', 'transformed')
const BATCH_SIZE = 500
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000

/**
 * FK_Dependency_Order — tables grouped into waves so that parent tables
 * are loaded before their dependents. Matches the design document.
 */
const FK_DEPENDENCY_ORDER: string[][] = [
  // Wave 1: No FK dependencies
  ['_migrations', 'sets', 'sync_meta', 'card_metadata', 'precon_cards',
   'card_kingdom_prices', 'oracle_to_printings'],
  // Wave 2: Depends on sets / card_metadata
  ['card_definitions'],
  // Wave 3: Standalone or depends on wave 2
  ['decks'],
  // Wave 4: Depends on decks, card_definitions
  ['collection', 'physical_copies'],
  // Wave 5: Depends on decks, card_definitions, collection
  [
    'deck_cards', 'deck_allocations', 'proxy_allocations', 'deck_priority',
    'deck_strategy', 'deck_health', 'deck_documentation', 'deck_notes',
    'deck_overview_content', 'deck_combos', 'deck_mana_analysis', 'deck_upgrades',
    'deck_ratings', 'dead_weight_dismissals', 'precon_mod_state',
    'upgrade_change_log', 'sync_runs',
  ],
  // Wave 6: Depends on decks
  ['debrief_sessions'],
  // Wave 7: Depends on debrief_sessions, decks
  ['debrief_actions', 'brew_sessions'],
]

/**
 * Tables with INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY.
 * These require OVERRIDING SYSTEM VALUE in INSERT to preserve original IDs.
 */
const IDENTITY_TABLES = new Set([
  'precon_cards',
  'card_definitions',
  'collection',
  'physical_copies',
  'deck_cards',
  'deck_allocations',
  'proxy_allocations',
  'deck_notes',
  'dead_weight_dismissals',
  'debrief_sessions',
  'debrief_actions',
  'brew_sessions',
  'precon_mod_state',
  'upgrade_change_log',
  'sync_runs',
])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransformManifestTable {
  table: string
  rowCount: number
  booleansTransformed: number
  userIdInjected: boolean
}

interface TransformManifest {
  transformedAt: string
  migrationUserId: string
  sourceManifest: string
  tables: TransformManifestTable[]
  totalRowsTransformed: number
  totalBooleansConverted: number
}

interface TableLoadStats {
  table: string
  rowsInserted: number
  rowsSkipped: number
  rowsTotal: number
  durationMs: number
}

interface LoadManifest {
  loadedAt: string
  supabaseUrl: string
  tables: TableLoadStats[]
  totalInserted: number
  totalSkipped: number
  totalDurationMs: number
}

// ---------------------------------------------------------------------------
// Error Classification
// ---------------------------------------------------------------------------

/** Check if an error is a duplicate key violation (Postgres error code 23505) */
function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as Record<string, unknown>
  // Supabase REST API returns the PG error code in the `code` field
  if (err.code === '23505') return true
  // Also check message patterns for safety
  const msg = String(err.message || '').toLowerCase()
  return msg.includes('duplicate key') || msg.includes('unique constraint')
}

/** Check if an error is a FK constraint violation (Postgres error code 23503) */
function isFKConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as Record<string, unknown>
  if (err.code === '23503') return true
  const msg = String(err.message || '').toLowerCase()
  return msg.includes('foreign key') || msg.includes('violates foreign key')
}

/** Check if an error is a connection/network failure */
function isConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as Record<string, unknown>
  const msg = String(err.message || '').toLowerCase()
  return (
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('network') ||
    msg.includes('socket hang up')
  )
}

// ---------------------------------------------------------------------------
// Retry Logic
// ---------------------------------------------------------------------------

async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation()
    } catch (err) {
      lastError = err
      if (!isConnectionError(err) || attempt === MAX_RETRIES) {
        throw err
      }
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1)
      console.warn(
        `  ⚠️  Connection error on ${context} (attempt ${attempt}/${MAX_RETRIES}). ` +
        `Retrying in ${backoff}ms...`
      )
      await sleep(backoff)
    }
  }
  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// SQL Insert for IDENTITY tables (OVERRIDING SYSTEM VALUE)
// ---------------------------------------------------------------------------

/**
 * Build a raw SQL INSERT with OVERRIDING SYSTEM VALUE for tables that have
 * GENERATED ALWAYS AS IDENTITY columns. This allows preserving original IDs.
 *
 * Uses Supabase's .rpc() is not suitable here — we use the REST API's
 * raw SQL endpoint via the pg_net extension, but that's not available.
 * Instead, we temporarily alter the column to GENERATED BY DEFAULT,
 * insert normally, then alter back. This is the simplest approach for
 * a one-time migration script.
 *
 * Actually, the cleanest approach: use supabase-js .insert() but first
 * ALTER the identity column to GENERATED BY DEFAULT for the duration of load,
 * then revert after. This avoids raw SQL INSERT gymnastics.
 */

/**
 * Alter identity columns to GENERATED BY DEFAULT before load,
 * so we can insert explicit ID values via the normal REST API.
 */
async function alterIdentityToByDefault(
  supabase: SupabaseClient,
  tableName: string,
): Promise<void> {
  const { error } = await supabase.rpc('exec_sql', {
    query: `ALTER TABLE "${tableName}" ALTER COLUMN id SET GENERATED BY DEFAULT;`,
  })
  if (error) {
    // If exec_sql doesn't exist, we need a different approach
    throw new Error(
      `Failed to alter identity column on ${tableName}: ${error.message}. ` +
      `Ensure the exec_sql RPC function exists in the database.`
    )
  }
}

/**
 * Revert identity columns back to GENERATED ALWAYS after load.
 */
async function alterIdentityToAlways(
  supabase: SupabaseClient,
  tableName: string,
): Promise<void> {
  const { error } = await supabase.rpc('exec_sql', {
    query: `ALTER TABLE "${tableName}" ALTER COLUMN id SET GENERATED ALWAYS;`,
  })
  if (error) {
    console.warn(`  ⚠️  Failed to revert identity on ${tableName}: ${error.message}`)
  }
}

/**
 * Reset the identity sequence to the max ID value after inserting explicit IDs.
 * This ensures future inserts (without explicit IDs) get correct auto-values.
 */
async function resetSequence(
  supabase: SupabaseClient,
  tableName: string,
): Promise<void> {
  const { error } = await supabase.rpc('exec_sql', {
    query: `SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), COALESCE((SELECT MAX(id) FROM "${tableName}"), 0));`,
  })
  if (error) {
    console.warn(`  ⚠️  Failed to reset sequence on ${tableName}: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// Batch Insert Logic
// ---------------------------------------------------------------------------

interface InsertResult {
  error: { message: string; code?: string; details?: string } | null
}

/**
 * Wrapper to execute a Supabase insert and return the result.
 * Handles the PostgrestFilterBuilder thenable properly.
 */
async function executeInsert(
  supabase: SupabaseClient,
  tableName: string,
  data: Record<string, unknown> | Record<string, unknown>[],
): Promise<InsertResult> {
  const result = await supabase.from(tableName).insert(data)
  return { error: result.error }
}

/**
 * Insert a batch of rows into a table.
 * Returns the count of inserted rows and skipped (duplicate) rows.
 */
async function insertBatch(
  supabase: SupabaseClient,
  tableName: string,
  batch: Record<string, unknown>[],
  batchIndex: number,
): Promise<{ inserted: number; skipped: number }> {
  // Try bulk insert first
  const { error } = await withRetry(
    () => executeInsert(supabase, tableName, batch),
    `${tableName} batch ${batchIndex}`,
  )

  if (!error) {
    return { inserted: batch.length, skipped: 0 }
  }

  // If FK constraint violation, halt immediately
  if (isFKConstraintError(error)) {
    throw new FKConstraintError(tableName, batchIndex, error as Record<string, unknown>)
  }

  // If duplicate key error on the whole batch, fall back to row-by-row
  if (isDuplicateKeyError(error)) {
    return await insertRowByRow(supabase, tableName, batch, batchIndex)
  }

  // Unknown error — throw
  throw new Error(
    `[${tableName}] Batch ${batchIndex} failed: ${error.message} (code: ${error.code})`
  )
}

/**
 * Insert rows one at a time, skipping duplicates.
 * Used when a batch fails due to duplicate key violations.
 */
async function insertRowByRow(
  supabase: SupabaseClient,
  tableName: string,
  rows: Record<string, unknown>[],
  batchIndex: number,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0
  let skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const { error } = await withRetry(
      () => executeInsert(supabase, tableName, rows[i]),
      `${tableName} batch ${batchIndex} row ${i}`,
    )

    if (!error) {
      inserted++
      continue
    }

    if (isDuplicateKeyError(error)) {
      skipped++
      continue
    }

    if (isFKConstraintError(error)) {
      throw new FKConstraintError(tableName, batchIndex, error as Record<string, unknown>, rows[i])
    }

    // Unknown error on individual row
    throw new Error(
      `[${tableName}] Row ${i} in batch ${batchIndex} failed: ${error.message} (code: ${error.code})`
    )
  }

  return { inserted, skipped }
}

class FKConstraintError extends Error {
  constructor(
    public table: string,
    public batchIndex: number,
    public originalError: Record<string, unknown>,
    public offendingRow?: Record<string, unknown>,
  ) {
    const detail = originalError.details || originalError.message || 'Unknown FK violation'
    super(
      `FK CONSTRAINT VIOLATION — halting migration.\n` +
      `  Table: ${table}\n` +
      `  Batch: ${batchIndex}\n` +
      `  Detail: ${detail}\n` +
      (offendingRow ? `  Row: ${JSON.stringify(offendingRow, null, 2)}\n` : '') +
      `  This indicates incorrect load order or missing parent data.`
    )
    this.name = 'FKConstraintError'
  }
}

// ---------------------------------------------------------------------------
// Table Load Orchestrator
// ---------------------------------------------------------------------------

async function loadTable(
  supabase: SupabaseClient,
  tableName: string,
  rows: Record<string, unknown>[],
): Promise<TableLoadStats> {
  const start = Date.now()
  let totalInserted = 0
  let totalSkipped = 0

  if (rows.length === 0) {
    console.log(`  ⏭️  ${tableName} — 0 rows (empty), skipping`)
    return {
      table: tableName,
      rowsInserted: 0,
      rowsSkipped: 0,
      rowsTotal: 0,
      durationMs: Date.now() - start,
    }
  }

  const isIdentityTable = IDENTITY_TABLES.has(tableName)

  // For identity tables, temporarily switch to GENERATED BY DEFAULT
  if (isIdentityTable) {
    await alterIdentityToByDefault(supabase, tableName)
  }

  try {
    // Split into batches
    const batches: Record<string, unknown>[][] = []
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      batches.push(rows.slice(i, i + BATCH_SIZE))
    }

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const { inserted, skipped } = await insertBatch(
        supabase,
        tableName,
        batches[batchIdx],
        batchIdx,
      )
      totalInserted += inserted
      totalSkipped += skipped
    }
  } finally {
    // Always revert identity column and reset sequence
    if (isIdentityTable) {
      await alterIdentityToAlways(supabase, tableName)
      await resetSequence(supabase, tableName)
    }
  }

  const duration = Date.now() - start
  const skipMsg = totalSkipped > 0 ? ` (${totalSkipped} skipped)` : ''
  console.log(
    `  ✅ ${tableName} — ${totalInserted} inserted${skipMsg} [${duration}ms]`
  )

  return {
    table: tableName,
    rowsInserted: totalInserted,
    rowsSkipped: totalSkipped,
    rowsTotal: rows.length,
    durationMs: duration,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('🚀 Load Postgres — Bulk insert into Supabase')
  console.log()

  // Validate environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL environment variable.')
    console.error('   Set it in .env.local or export it before running.')
    process.exit(1)
  }
  if (!serviceRoleKey) {
    console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable.')
    console.error('   Set it in .env.local or export it before running.')
    process.exit(1)
  }

  // Validate transform directory
  if (!existsSync(TRANSFORMED_DIR)) {
    console.error(`❌ Transformed directory not found: ${TRANSFORMED_DIR}`)
    console.error('   Run "npx tsx scripts/transform-data.ts" first.')
    process.exit(1)
  }

  // Read transform manifest
  const manifestPath = resolve(TRANSFORMED_DIR, 'transform-manifest.json')
  if (!existsSync(manifestPath)) {
    console.error(`❌ Transform manifest not found: ${manifestPath}`)
    console.error('   Run "npx tsx scripts/transform-data.ts" first.')
    process.exit(1)
  }

  const manifest: TransformManifest = JSON.parse(
    readFileSync(manifestPath, 'utf-8')
  )

  // Build lookup of table name → file name from manifest
  const tableFileMap = new Map<string, string>(
    manifest.tables.map((t) => [t.table, `${t.table}.json`])
  )

  console.log(`📂 Reading from: ${TRANSFORMED_DIR}`)
  console.log(`🔗 Supabase URL: ${supabaseUrl}`)
  console.log(`🔑 Migration UUID: ${manifest.migrationUserId}`)
  console.log(`📋 Tables in manifest: ${manifest.tables.length}`)
  console.log()

  // Create Supabase client with service role key
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // Ensure the exec_sql RPC function exists for identity column management
  await ensureExecSqlFunction(supabase)

  const loadManifest: LoadManifest = {
    loadedAt: new Date().toISOString(),
    supabaseUrl,
    tables: [],
    totalInserted: 0,
    totalSkipped: 0,
    totalDurationMs: 0,
  }

  const overallStart = Date.now()

  // Load tables wave by wave
  for (let waveIdx = 0; waveIdx < FK_DEPENDENCY_ORDER.length; waveIdx++) {
    const wave = FK_DEPENDENCY_ORDER[waveIdx]
    const waveNum = waveIdx + 1
    console.log(`── Wave ${waveNum} ──`)

    for (const tableName of wave) {
      // Check if table exists in the manifest
      if (!tableFileMap.has(tableName)) {
        console.log(`  ⏭️  ${tableName} — not in transform manifest, skipping`)
        continue
      }

      // Read transformed data
      const filePath = resolve(TRANSFORMED_DIR, tableFileMap.get(tableName)!)
      if (!existsSync(filePath)) {
        console.log(`  ⏭️  ${tableName} — file not found, skipping`)
        continue
      }

      const rows: Record<string, unknown>[] = JSON.parse(
        readFileSync(filePath, 'utf-8')
      )

      try {
        const stats = await loadTable(supabase, tableName, rows)
        loadManifest.tables.push(stats)
        loadManifest.totalInserted += stats.rowsInserted
        loadManifest.totalSkipped += stats.rowsSkipped
      } catch (err) {
        if (err instanceof FKConstraintError) {
          console.error()
          console.error('❌ ' + err.message)
          writePartialManifest(loadManifest, overallStart)
          process.exit(1)
        }
        // Connection failure after retries exhausted
        if (isConnectionError(err)) {
          console.error()
          console.error(`❌ Connection failed after ${MAX_RETRIES} attempts.`)
          console.error(`   Table: ${tableName}`)
          console.error(`   Error: ${(err as Error).message}`)
          console.error()
          console.error('   Progress checkpoint saved to load-manifest.json')
          writePartialManifest(loadManifest, overallStart)
          process.exit(1)
        }
        throw err
      }
    }

    console.log()
  }

  loadManifest.totalDurationMs = Date.now() - overallStart

  // Write final load manifest
  const loadManifestPath = resolve(TRANSFORMED_DIR, 'load-manifest.json')
  writeFileSync(loadManifestPath, JSON.stringify(loadManifest, null, 2))

  // Summary
  console.log('── Summary ──')
  console.log(`  Tables loaded:    ${loadManifest.tables.length}`)
  console.log(`  Total inserted:   ${loadManifest.totalInserted}`)
  console.log(`  Total skipped:    ${loadManifest.totalSkipped}`)
  console.log(`  Duration:         ${loadManifest.totalDurationMs}ms`)
  console.log(`  Load manifest:    ${loadManifestPath}`)
  console.log()
  console.log('✅ Load complete.')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writePartialManifest(manifest: LoadManifest, startTime: number): void {
  manifest.totalDurationMs = Date.now() - startTime
  const path = resolve(TRANSFORMED_DIR, 'load-manifest.json')
  writeFileSync(path, JSON.stringify(manifest, null, 2))
  console.error(`   Partial manifest saved: ${path}`)
}

/**
 * Ensure the exec_sql RPC function exists in the database.
 * This is a helper function that allows running arbitrary SQL
 * from the Supabase JS client — needed for ALTER TABLE on identity columns.
 *
 * If it doesn't exist, create it. Requires the service role key.
 */
async function ensureExecSqlFunction(supabase: SupabaseClient): Promise<void> {
  // Test if exec_sql exists by calling it with a no-op
  const { error } = await supabase.rpc('exec_sql', {
    query: 'SELECT 1;',
  })

  if (!error) return // Already exists

  // If the function doesn't exist, create it via raw SQL
  // We use the Supabase management API to run this DDL
  console.log('  📝 Creating exec_sql helper function...')

  const createFnSql = `
    CREATE OR REPLACE FUNCTION exec_sql(query text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE query;
    END;
    $$;
  `

  // Try to create via the REST API's SQL endpoint
  // The service role key gives us superuser-like access
  const { error: createError } = await supabase.rpc('exec_sql', {
    query: createFnSql,
  })

  if (createError) {
    // If we can't create it via rpc (chicken-and-egg), provide instructions
    console.error()
    console.error('❌ Cannot create exec_sql function automatically.')
    console.error('   Please run the following SQL in Supabase SQL Editor:')
    console.error()
    console.error(createFnSql)
    console.error()
    console.error('   Then re-run this script.')
    process.exit(1)
  }

  console.log('  ✅ exec_sql function created')
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
