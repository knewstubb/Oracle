/**
 * Transform exported SQLite JSON data for Postgres/Supabase import.
 *
 * Transformations applied:
 *   1. Boolean columns stored as INTEGER 0/1 → native true/false
 *   2. user_id UUID injected on all user-owned table rows
 *   3. ISO 8601 datetime strings passed through unchanged (valid for TIMESTAMPTZ)
 *
 * Usage:
 *   npx tsx scripts/transform-data.ts
 *
 * Reads from:   scripts/export/ (manifest.json + per-table JSON files)
 * Writes to:    scripts/transformed/ (same file structure + transform-manifest.json)
 *
 * Halts immediately on any transformation error with table + row + error detail.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const EXPORT_DIR = join(process.cwd(), 'scripts', 'export')
const TRANSFORMED_DIR = join(process.cwd(), 'scripts', 'transformed')

/**
 * Fixed migration UUID — generated once at script start and used consistently
 * across all user-owned table rows. This satisfies Requirement 3.2.
 */
const MIGRATION_USER_ID = randomUUID()

// ---------------------------------------------------------------------------
// Table Classification
// ---------------------------------------------------------------------------

/** User-owned tables — get user_id injected (24 tables) */
const USER_OWNED_TABLES = new Set([
  'card_definitions',
  'decks',
  'collection',
  'physical_copies',
  'deck_cards',
  'deck_allocations',
  'proxy_allocations',
  'deck_priority',
  'deck_strategy',
  'deck_health',
  'deck_documentation',
  'deck_notes',
  'deck_overview_content',
  'deck_combos',
  'deck_mana_analysis',
  'deck_upgrades',
  'deck_ratings',
  'dead_weight_dismissals',
  'debrief_sessions',
  'debrief_actions',
  'brew_sessions',
  'precon_mod_state',
  'upgrade_change_log',
  'sync_runs',
])

/**
 * Boolean column mapping — table → column names that need 0/1 → true/false conversion.
 * Derived from the DDL in the design document.
 */
const BOOLEAN_COLUMNS: Record<string, string[]> = {
  collection: ['foil'],
  physical_copies: ['is_foil', 'is_proxy'],
  deck_cards: ['is_commander'],
  decks: ['is_precon_mod'],
  deck_allocations: ['priority_override', 'written_to_archidekt'],
  proxy_allocations: ['written_to_archidekt'],
  debrief_actions: ['notion_logged'],
  precon_mod_state: ['sol_ring_removed'],
  upgrade_change_log: ['skipped'],
  deck_upgrades: ['owned'],
  card_kingdom_prices: ['is_foil'],
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManifestTable {
  name: string
  wave: number
  rowCount: number
  file: string
}

interface ExportManifest {
  exportedAt: string
  sourceDbPath: string
  checksumBefore: string
  checksumAfter: string
  tables: ManifestTable[]
}

interface TransformStats {
  table: string
  rowCount: number
  booleansTransformed: number
  userIdInjected: boolean
}

interface TransformManifest {
  transformedAt: string
  migrationUserId: string
  sourceManifest: string
  tables: TransformStats[]
  totalRowsTransformed: number
  totalBooleansConverted: number
}

// ---------------------------------------------------------------------------
// Transformation Logic
// ---------------------------------------------------------------------------

/**
 * Convert a SQLite integer boolean (0/1) to native boolean.
 * Accepts 0, 1, null, true, false (for idempotency on re-runs).
 * Halts on unexpected values.
 */
function toBool(
  value: unknown,
  table: string,
  rowIndex: number,
  column: string
): boolean | null {
  if (value === null || value === undefined) return null
  if (value === 0 || value === false) return false
  if (value === 1 || value === true) return true

  throw new TransformError(
    table,
    rowIndex,
    `Boolean column "${column}" has unexpected value: ${JSON.stringify(value)} (type: ${typeof value})`
  )
}

class TransformError extends Error {
  constructor(
    public table: string,
    public rowIndex: number,
    public detail: string
  ) {
    super(`[${table}] row ${rowIndex}: ${detail}`)
    this.name = 'TransformError'
  }
}

function transformRow(
  row: Record<string, unknown>,
  table: string,
  rowIndex: number,
  isUserOwned: boolean,
  booleanColumns: string[]
): { transformed: Record<string, unknown>; booleansConverted: number } {
  const transformed = { ...row }
  let booleansConverted = 0

  // 1. Transform boolean columns
  for (const col of booleanColumns) {
    if (col in transformed) {
      transformed[col] = toBool(transformed[col], table, rowIndex, col)
      booleansConverted++
    }
  }

  // 2. Inject user_id for user-owned tables
  if (isUserOwned) {
    transformed.user_id = MIGRATION_USER_ID
  }

  // 3. Datetime strings pass through unchanged (ISO 8601 → TIMESTAMPTZ compatible)

  return { transformed, booleansConverted }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('🔄 Transform Data — SQLite export → Supabase-ready JSON')
  console.log()

  // Validate export directory
  if (!existsSync(EXPORT_DIR)) {
    console.error(`❌ Export directory not found: ${EXPORT_DIR}`)
    console.error('   Run "npx tsx scripts/export-sqlite.ts" first.')
    process.exit(1)
  }

  // Read export manifest
  const manifestPath = resolve(EXPORT_DIR, 'manifest.json')
  if (!existsSync(manifestPath)) {
    console.error(`❌ Export manifest not found: ${manifestPath}`)
    console.error('   Run "npx tsx scripts/export-sqlite.ts" first.')
    process.exit(1)
  }

  const manifest: ExportManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  console.log(`📂 Reading from: ${EXPORT_DIR}`)
  console.log(`📂 Writing to:   ${TRANSFORMED_DIR}`)
  console.log(`🔑 Migration UUID: ${MIGRATION_USER_ID}`)
  console.log(`📋 Tables to transform: ${manifest.tables.length}`)
  console.log()

  // Ensure output directory
  if (!existsSync(TRANSFORMED_DIR)) {
    mkdirSync(TRANSFORMED_DIR, { recursive: true })
  }

  const transformManifest: TransformManifest = {
    transformedAt: new Date().toISOString(),
    migrationUserId: MIGRATION_USER_ID,
    sourceManifest: manifestPath,
    tables: [],
    totalRowsTransformed: 0,
    totalBooleansConverted: 0,
  }

  // Process each table
  for (const tableEntry of manifest.tables) {
    const { name: tableName, file: fileName } = tableEntry
    const isUserOwned = USER_OWNED_TABLES.has(tableName)
    const booleanCols = BOOLEAN_COLUMNS[tableName] || []

    const inputPath = resolve(EXPORT_DIR, fileName)
    if (!existsSync(inputPath)) {
      console.error(`❌ Missing export file: ${inputPath}`)
      process.exit(1)
    }

    const rows: Record<string, unknown>[] = JSON.parse(readFileSync(inputPath, 'utf-8'))
    const transformedRows: Record<string, unknown>[] = []
    let tableBooleans = 0

    for (let i = 0; i < rows.length; i++) {
      try {
        const { transformed, booleansConverted } = transformRow(
          rows[i],
          tableName,
          i,
          isUserOwned,
          booleanCols
        )
        transformedRows.push(transformed)
        tableBooleans += booleansConverted
      } catch (err) {
        if (err instanceof TransformError) {
          console.error()
          console.error('❌ TRANSFORMATION ERROR — halting immediately')
          console.error(`   Table:  ${err.table}`)
          console.error(`   Row:    ${err.rowIndex}`)
          console.error(`   Detail: ${err.detail}`)
          process.exit(1)
        }
        throw err
      }
    }

    // Write transformed file
    const outputPath = resolve(TRANSFORMED_DIR, fileName)
    writeFileSync(outputPath, JSON.stringify(transformedRows, null, 2))

    // Record stats
    const stats: TransformStats = {
      table: tableName,
      rowCount: transformedRows.length,
      booleansTransformed: tableBooleans,
      userIdInjected: isUserOwned,
    }
    transformManifest.tables.push(stats)
    transformManifest.totalRowsTransformed += transformedRows.length
    transformManifest.totalBooleansConverted += tableBooleans

    // Log progress
    const flags: string[] = []
    if (isUserOwned) flags.push('user_id')
    if (booleanCols.length > 0) flags.push(`booleans: ${booleanCols.join(', ')}`)
    const flagStr = flags.length > 0 ? ` [${flags.join(' | ')}]` : ''
    console.log(`  ✅ ${tableName} — ${transformedRows.length} rows${flagStr}`)
  }

  // Write transform manifest
  const transformManifestPath = resolve(TRANSFORMED_DIR, 'transform-manifest.json')
  writeFileSync(transformManifestPath, JSON.stringify(transformManifest, null, 2))

  // Summary
  console.log()
  console.log('── Summary ──')
  console.log(`  Tables transformed:    ${transformManifest.tables.length}`)
  console.log(`  Total rows:            ${transformManifest.totalRowsTransformed}`)
  console.log(`  Booleans converted:    ${transformManifest.totalBooleansConverted}`)
  console.log(`  User-owned tables:     ${transformManifest.tables.filter(t => t.userIdInjected).length}`)
  console.log(`  Migration UUID:        ${MIGRATION_USER_ID}`)
  console.log(`  Manifest:              ${transformManifestPath}`)
  console.log()
  console.log('✅ Transformation complete.')
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
