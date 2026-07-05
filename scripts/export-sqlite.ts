/**
 * Export all tables from SQLite to JSON in FK_Dependency_Order.
 *
 * Usage:
 *   npx tsx scripts/export-sqlite.ts [path-to-db]
 *
 * Defaults to data/oracle.db if no path is provided.
 * Also respects the SQLITE_DB_PATH environment variable.
 *
 * Output:
 *   scripts/export/<table_name>.json  — one file per table
 *   scripts/export/manifest.json      — metadata + checksums
 */
import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DB_PATH = process.argv[2] || process.env.SQLITE_DB_PATH || './data/oracle.db'
const EXPORT_DIR = join(process.cwd(), 'scripts', 'export')

/**
 * FK_Dependency_Order — tables grouped into waves so that parent tables
 * are exported before their dependents. Matches the design document.
 */
const FK_DEPENDENCY_ORDER: string[][] = [
  // Wave 1: No FK dependencies
  ['_migrations', 'sets', 'sync_meta', 'card_metadata', 'precon_cards', 'card_kingdom_prices', 'oracle_to_printings'],
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(filePath: string): string {
  const content = readFileSync(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function ensureExportDir(): void {
  if (!existsSync(EXPORT_DIR)) {
    mkdirSync(EXPORT_DIR, { recursive: true })
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const resolvedDbPath = resolve(DB_PATH)

  // Validate database exists
  if (!existsSync(resolvedDbPath)) {
    console.error(`❌ Database file not found: ${resolvedDbPath}`)
    process.exit(1)
  }

  console.log(`📦 Exporting SQLite database: ${resolvedDbPath}`)
  console.log(`📂 Output directory: ${EXPORT_DIR}`)
  console.log()

  // Compute SHA-256 checksum BEFORE export
  const checksumBefore = sha256(resolvedDbPath)
  console.log(`🔒 SHA-256 (before): ${checksumBefore}`)
  console.log()

  // Open database in read-only mode
  const db = new Database(resolvedDbPath, { readonly: true })

  // Ensure output directory exists
  ensureExportDir()

  // Get list of tables actually present in the database
  const existingTables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[])
      .map(row => row.name)
  )

  const manifest: {
    exportedAt: string
    sourceDbPath: string
    checksumBefore: string
    checksumAfter: string
    tables: { name: string; wave: number; rowCount: number; file: string }[]
  } = {
    exportedAt: new Date().toISOString(),
    sourceDbPath: resolvedDbPath,
    checksumBefore,
    checksumAfter: '', // filled after export
    tables: [],
  }

  let totalRows = 0

  // Export tables wave by wave
  for (let waveIdx = 0; waveIdx < FK_DEPENDENCY_ORDER.length; waveIdx++) {
    const wave = FK_DEPENDENCY_ORDER[waveIdx]
    const waveNum = waveIdx + 1
    console.log(`── Wave ${waveNum} ──`)

    for (const tableName of wave) {
      if (!existingTables.has(tableName)) {
        console.log(`  ⏭️  ${tableName} — not found in database, skipping`)
        continue
      }

      try {
        const rows = db.prepare(`SELECT * FROM "${tableName}"`).all()
        const rowCount = rows.length
        const fileName = `${tableName}.json`
        const filePath = resolve(EXPORT_DIR, fileName)

        writeFileSync(filePath, JSON.stringify(rows, null, 2))

        manifest.tables.push({
          name: tableName,
          wave: waveNum,
          rowCount,
          file: fileName,
        })

        totalRows += rowCount
        console.log(`  ✅ ${tableName} — ${rowCount} rows`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`  ❌ ${tableName} — FAILED: ${message}`)
        db.close()
        process.exit(1)
      }
    }

    console.log()
  }

  db.close()

  // Compute SHA-256 checksum AFTER export
  const checksumAfter = sha256(resolvedDbPath)
  console.log(`🔒 SHA-256 (after):  ${checksumAfter}`)

  // Compare checksums — abort if source was modified
  if (checksumBefore !== checksumAfter) {
    console.error()
    console.error('❌ ABORT: Source database was modified during export!')
    console.error(`   Before: ${checksumBefore}`)
    console.error(`   After:  ${checksumAfter}`)
    process.exit(1)
  }

  console.log('✅ Source database unchanged — checksums match')
  console.log()

  // Write manifest
  manifest.checksumAfter = checksumAfter
  const manifestPath = resolve(EXPORT_DIR, 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  // Summary
  console.log('── Summary ──')
  console.log(`  Tables exported: ${manifest.tables.length}`)
  console.log(`  Total rows:      ${totalRows}`)
  console.log(`  Manifest:        ${manifestPath}`)
  console.log()
  console.log('✅ Export complete.')
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
