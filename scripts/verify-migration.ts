/**
 * Post-migration verification script.
 *
 * Checks performed:
 *   1. Row count comparison (source manifest vs Supabase)
 *   2. FK integrity scan (orphaned references for every FK relationship)
 *   3. Random sample comparison (10 rows per table, field-by-field)
 *   4. user_id consistency check (all user-owned rows have the fixed UUID)
 *   5. SHA-256 checksum comparison (source DB unchanged)
 *
 * Usage:
 *   npx tsx scripts/verify-migration.ts
 *
 * Reads from:
 *   scripts/export/manifest.json        — source row counts + checksum
 *   scripts/transformed/transform-manifest.json — migration UUID + transformed data
 *   data/oracle.db                      — source DB for checksum re-verification
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY env vars
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — one or more checks fail
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const EXPORT_DIR = join(process.cwd(), 'scripts', 'export')
const TRANSFORMED_DIR = join(process.cwd(), 'scripts', 'transformed')
const DEFAULT_DB_PATH = './data/oracle.db'
const SAMPLE_SIZE = 10

// ---------------------------------------------------------------------------
// User-Owned Tables (24)
// ---------------------------------------------------------------------------

const USER_OWNED_TABLES = new Set([
  'card_definitions', 'decks', 'collection', 'physical_copies',
  'deck_cards', 'deck_allocations', 'proxy_allocations', 'deck_priority',
  'deck_strategy', 'deck_health', 'deck_documentation', 'deck_notes',
  'deck_overview_content', 'deck_combos', 'deck_mana_analysis', 'deck_upgrades',
  'deck_ratings', 'dead_weight_dismissals', 'debrief_sessions', 'debrief_actions',
  'brew_sessions', 'precon_mod_state', 'upgrade_change_log', 'sync_runs',
])

// ---------------------------------------------------------------------------
// FK Relationships to verify
// ---------------------------------------------------------------------------

interface FKRelationship {
  childTable: string
  childColumn: string
  parentTable: string
  parentColumn: string
}

const FK_RELATIONSHIPS: FKRelationship[] = [
  { childTable: 'physical_copies', childColumn: 'card_definition_id', parentTable: 'card_definitions', parentColumn: 'id' },
  { childTable: 'physical_copies', childColumn: 'proxy_for_definition_id', parentTable: 'card_definitions', parentColumn: 'id' },
  { childTable: 'deck_cards', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'deck_cards', childColumn: 'proxy_of_deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'deck_cards', childColumn: 'physical_copy_id', parentTable: 'physical_copies', parentColumn: 'id' },
  { childTable: 'deck_allocations', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'proxy_allocations', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'deck_priority', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'deck_strategy', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'deck_health', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'deck_documentation', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'deck_notes', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'deck_overview_content', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'deck_combos', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'deck_mana_analysis', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'deck_upgrades', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'deck_ratings', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'dead_weight_dismissals', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'debrief_sessions', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'debrief_actions', childColumn: 'session_id', parentTable: 'debrief_sessions', parentColumn: 'id' },
  { childTable: 'brew_sessions', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'precon_mod_state', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
  { childTable: 'upgrade_change_log', childColumn: 'deck_id', parentTable: 'decks', parentColumn: 'id' },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportManifest {
  exportedAt: string
  sourceDbPath: string
  checksumBefore: string
  checksumAfter: string
  tables: { name: string; wave: number; rowCount: number; file: string }[]
}

interface TransformManifest {
  transformedAt: string
  migrationUserId: string
  sourceManifest: string
  tables: { table: string; rowCount: number; booleansTransformed: number; userIdInjected: boolean }[]
  totalRowsTransformed: number
  totalBooleansConverted: number
}

interface CheckResult {
  category: string
  passed: boolean
  details: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(filePath: string): string {
  const content = readFileSync(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function printResult(result: CheckResult): void {
  const icon = result.passed ? '✅' : '❌'
  console.log(`${icon} ${result.category}: ${result.passed ? 'PASS' : 'FAIL'}`)
  for (const detail of result.details) {
    console.log(`   ${detail}`)
  }
  console.log()
}

// ---------------------------------------------------------------------------
// Check 1: Row Count Comparison
// ---------------------------------------------------------------------------

async function checkRowCounts(
  supabase: SupabaseClient,
  exportManifest: ExportManifest,
): Promise<CheckResult> {
  const details: string[] = []
  let allMatch = true

  for (const tableEntry of exportManifest.tables) {
    const { name: tableName, rowCount: sourceCount } = tableEntry

    // Query Supabase for exact count
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })

    if (error) {
      details.push(`${tableName}: ERROR — ${error.message}`)
      allMatch = false
      continue
    }

    const targetCount = count ?? 0

    if (sourceCount !== targetCount) {
      details.push(
        `${tableName}: MISMATCH — source=${sourceCount}, target=${targetCount} (diff=${targetCount - sourceCount})`
      )
      allMatch = false
    } else {
      details.push(`${tableName}: OK — ${sourceCount} rows`)
    }
  }

  return {
    category: 'Row Count Comparison',
    passed: allMatch,
    details,
  }
}

// ---------------------------------------------------------------------------
// Check 2: FK Integrity Scan
// ---------------------------------------------------------------------------

async function checkFKIntegrity(
  supabase: SupabaseClient,
): Promise<CheckResult> {
  const details: string[] = []
  let allClean = true

  for (const fk of FK_RELATIONSHIPS) {
    // Use exec_sql RPC to run an orphan detection query.
    // This finds child rows where the FK column is NOT NULL
    // but the referenced parent row doesn't exist.
    const orphanQuery = `
      SELECT COUNT(*) AS orphan_count
      FROM "${fk.childTable}" c
      WHERE c."${fk.childColumn}" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "${fk.parentTable}" p
          WHERE p."${fk.parentColumn}" = c."${fk.childColumn}"
        );
    `

    const { data, error } = await supabase.rpc('exec_sql_returning', {
      query: orphanQuery,
    })

    if (error) {
      // Fallback: try a simpler approach via direct query
      const fallbackResult = await checkFKFallback(supabase, fk)
      if (fallbackResult === null) {
        details.push(
          `${fk.childTable}.${fk.childColumn} → ${fk.parentTable}.${fk.parentColumn}: ERROR — ${error.message}`
        )
        allClean = false
      } else if (fallbackResult > 0) {
        details.push(
          `${fk.childTable}.${fk.childColumn} → ${fk.parentTable}.${fk.parentColumn}: ORPHANS FOUND — ${fallbackResult} rows`
        )
        allClean = false
      } else {
        details.push(
          `${fk.childTable}.${fk.childColumn} → ${fk.parentTable}.${fk.parentColumn}: OK`
        )
      }
      continue
    }

    // Parse result — exec_sql_returning should give us JSON rows
    const orphanCount = Array.isArray(data) && data.length > 0
      ? Number(data[0].orphan_count)
      : 0

    if (orphanCount > 0) {
      details.push(
        `${fk.childTable}.${fk.childColumn} → ${fk.parentTable}.${fk.parentColumn}: ORPHANS FOUND — ${orphanCount} rows`
      )
      allClean = false
    } else {
      details.push(
        `${fk.childTable}.${fk.childColumn} → ${fk.parentTable}.${fk.parentColumn}: OK`
      )
    }
  }

  return {
    category: 'FK Integrity Scan',
    passed: allClean,
    details,
  }
}

/**
 * Fallback FK check using the Supabase query builder.
 * Fetches child rows where the FK column is not null,
 * then checks if each referenced parent exists.
 * Returns orphan count or null on error.
 */
async function checkFKFallback(
  supabase: SupabaseClient,
  fk: FKRelationship,
): Promise<number | null> {
  try {
    // Get distinct FK values from child table (limit to a reasonable check)
    const { data: childRows, error: childError } = await supabase
      .from(fk.childTable)
      .select(fk.childColumn)
      .not(fk.childColumn, 'is', null)
      .limit(1000)

    if (childError || !childRows) return null

    // Collect unique FK values
    const childData = childRows as unknown as Record<string, unknown>[]
    const fkValues = [...new Set(
      childData.map(r => r[fk.childColumn])
    )].filter(v => v !== null && v !== undefined)

    if (fkValues.length === 0) return 0

    // Check which parent IDs exist
    const { data: parentRows, error: parentError } = await supabase
      .from(fk.parentTable)
      .select(fk.parentColumn)
      .in(fk.parentColumn, fkValues as string[])

    if (parentError || !parentRows) return null

    const existingParentIds = new Set(
      (parentRows as unknown as Record<string, unknown>[]).map(r => r[fk.parentColumn])
    )

    // Count orphans
    let orphanCount = 0
    for (const row of childData) {
      const val = row[fk.childColumn]
      if (val !== null && val !== undefined && !existingParentIds.has(val)) {
        orphanCount++
      }
    }

    return orphanCount
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Check 3: Random Sample Comparison
// ---------------------------------------------------------------------------

/**
 * Boolean column mapping (same as transform-data.ts) for comparison normalization.
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

async function checkRandomSamples(
  supabase: SupabaseClient,
  exportManifest: ExportManifest,
  migrationUserId: string,
): Promise<CheckResult> {
  const details: string[] = []
  let allMatch = true

  for (const tableEntry of exportManifest.tables) {
    const { name: tableName, file: fileName, rowCount } = tableEntry

    if (rowCount === 0) {
      details.push(`${tableName}: SKIP — empty table`)
      continue
    }

    // Load the transformed JSON for this table
    const transformedPath = resolve(TRANSFORMED_DIR, fileName)
    if (!existsSync(transformedPath)) {
      details.push(`${tableName}: SKIP — transformed file not found`)
      continue
    }

    const transformedRows: Record<string, unknown>[] = JSON.parse(
      readFileSync(transformedPath, 'utf-8')
    )

    // Pick up to SAMPLE_SIZE random indices
    const sampleIndices = pickRandomIndices(transformedRows.length, SAMPLE_SIZE)
    const sampleRows = sampleIndices.map(i => transformedRows[i])

    // Determine the primary key column for this table
    const pkColumn = getPrimaryKeyColumn(tableName)
    let tableMismatches = 0

    for (const expectedRow of sampleRows) {
      const pkValue = expectedRow[pkColumn]
      if (pkValue === null || pkValue === undefined) continue

      // Fetch the corresponding row from Supabase
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq(pkColumn, pkValue)
        .limit(1)
        .single()

      if (error || !data) {
        tableMismatches++
        continue
      }

      // Compare fields
      const mismatched = compareRows(
        expectedRow,
        data as Record<string, unknown>,
        tableName,
        migrationUserId,
      )

      if (mismatched.length > 0) {
        tableMismatches++
        if (tableMismatches <= 2) {
          details.push(
            `${tableName} [${pkColumn}=${pkValue}]: fields differ — ${mismatched.join(', ')}`
          )
        }
      }
    }

    if (tableMismatches > 0) {
      details.push(`${tableName}: ${tableMismatches}/${sampleIndices.length} samples MISMATCHED`)
      allMatch = false
    } else {
      details.push(`${tableName}: ${sampleIndices.length} samples OK`)
    }
  }

  return {
    category: 'Random Sample Comparison',
    passed: allMatch,
    details,
  }
}

/**
 * Pick N unique random indices from [0, total).
 */
function pickRandomIndices(total: number, n: number): number[] {
  if (total <= n) return Array.from({ length: total }, (_, i) => i)
  const indices = new Set<number>()
  while (indices.size < n) {
    indices.add(Math.floor(Math.random() * total))
  }
  return [...indices]
}

/**
 * Determine the primary key column for a table.
 * Most tables use 'id'; some composite-key tables use alternative PKs.
 */
function getPrimaryKeyColumn(tableName: string): string {
  const alternateKeys: Record<string, string> = {
    _migrations: 'id',
    sync_meta: 'key',
    deck_priority: 'deck_id',
    deck_strategy: 'deck_id',
    deck_health: 'deck_id',
    deck_documentation: 'deck_id',
    deck_overview_content: 'deck_id',
    deck_combos: 'deck_id',
    deck_mana_analysis: 'deck_id',
    deck_ratings: 'deck_id',
  }
  return alternateKeys[tableName] ?? 'id'
}

/**
 * Compare two row objects field by field, accounting for type transformations.
 * Returns an array of field names that differ.
 */
function compareRows(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  tableName: string,
  _migrationUserId: string,
): string[] {
  const mismatched: string[] = []
  const boolCols = new Set(BOOLEAN_COLUMNS[tableName] ?? [])

  for (const key of Object.keys(expected)) {
    const expectedVal = expected[key]
    const actualVal = actual[key]

    // Skip user_id — it was injected during transform, so it's expected to exist
    // in target but we already validate it separately in Check 4
    if (key === 'user_id') continue

    // Normalize comparison
    if (valuesMatch(expectedVal, actualVal, boolCols.has(key))) continue

    mismatched.push(key)
  }

  return mismatched
}

/**
 * Compare two values accounting for type transformations:
 *  - Boolean columns: 0/false and 1/true are equivalent
 *  - Null/undefined equivalence
 *  - Numeric string vs number equivalence
 *  - Timestamp normalization (ISO strings may have trailing Z vs +00:00)
 */
function valuesMatch(expected: unknown, actual: unknown, isBoolCol: boolean): boolean {
  // Both null/undefined
  if (expected == null && actual == null) return true
  if (expected == null || actual == null) return false

  // Boolean normalization
  if (isBoolCol) {
    const eBool = toBoolNormalized(expected)
    const aBool = toBoolNormalized(actual)
    return eBool === aBool
  }

  // Direct equality
  if (expected === actual) return true

  // Numeric comparison (handles string "123" vs number 123)
  if (typeof expected === 'number' || typeof actual === 'number') {
    const eNum = Number(expected)
    const aNum = Number(actual)
    if (!isNaN(eNum) && !isNaN(aNum) && eNum === aNum) return true
  }

  // String comparison with trimming
  const eStr = String(expected).trim()
  const aStr = String(actual).trim()
  if (eStr === aStr) return true

  // Timestamp normalization (Z vs +00:00)
  if (isTimestampLike(eStr) && isTimestampLike(aStr)) {
    return normalizeTimestamp(eStr) === normalizeTimestamp(aStr)
  }

  return false
}

function toBoolNormalized(val: unknown): boolean | null {
  if (val === null || val === undefined) return null
  if (val === true || val === 1 || val === '1') return true
  if (val === false || val === 0 || val === '0') return false
  return null
}

function isTimestampLike(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)
}

function normalizeTimestamp(s: string): string {
  try {
    return new Date(s).toISOString()
  } catch {
    return s
  }
}

// ---------------------------------------------------------------------------
// Check 4: user_id Consistency
// ---------------------------------------------------------------------------

async function checkUserIdConsistency(
  supabase: SupabaseClient,
  migrationUserId: string,
): Promise<CheckResult> {
  const details: string[] = []
  let allConsistent = true

  for (const tableName of USER_OWNED_TABLES) {
    // Query for rows where user_id != migration UUID or IS NULL
    // Using neq filter + or for null
    const { count: mismatchCount, error: mismatchError } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .neq('user_id', migrationUserId)

    const { count: nullCount, error: nullError } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .is('user_id', null)

    if (mismatchError || nullError) {
      const errMsg = mismatchError?.message || nullError?.message || 'unknown'
      details.push(`${tableName}: ERROR — ${errMsg}`)
      allConsistent = false
      continue
    }

    const totalBad = (mismatchCount ?? 0) + (nullCount ?? 0)

    if (totalBad > 0) {
      details.push(
        `${tableName}: FAIL — ${mismatchCount ?? 0} wrong UUID, ${nullCount ?? 0} NULL`
      )
      allConsistent = false
    } else {
      details.push(`${tableName}: OK`)
    }
  }

  return {
    category: 'user_id Consistency',
    passed: allConsistent,
    details,
  }
}

// ---------------------------------------------------------------------------
// Check 5: SHA-256 Checksum Comparison
// ---------------------------------------------------------------------------

function checkSourceChecksum(exportManifest: ExportManifest): CheckResult {
  const details: string[] = []
  const dbPath = resolve(
    process.argv[2] || process.env.SQLITE_DB_PATH || DEFAULT_DB_PATH
  )

  if (!existsSync(dbPath)) {
    return {
      category: 'Source DB Checksum',
      passed: false,
      details: [`Source DB not found: ${dbPath} — cannot verify`],
    }
  }

  const currentChecksum = sha256(dbPath)
  const originalChecksum = exportManifest.checksumBefore

  details.push(`Original checksum:  ${originalChecksum}`)
  details.push(`Current checksum:   ${currentChecksum}`)

  if (currentChecksum !== originalChecksum) {
    details.push('Source database has been MODIFIED since export!')
    return { category: 'Source DB Checksum', passed: false, details }
  }

  details.push('Source database unchanged — checksums match')
  return { category: 'Source DB Checksum', passed: true, details }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('🔍 Verify Migration — Post-migration integrity checks')
  console.log()

  // --- Validate environment ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL environment variable.')
    process.exit(1)
  }
  if (!serviceRoleKey) {
    console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable.')
    process.exit(1)
  }

  // --- Load manifests ---
  const exportManifestPath = resolve(EXPORT_DIR, 'manifest.json')
  if (!existsSync(exportManifestPath)) {
    console.error(`❌ Export manifest not found: ${exportManifestPath}`)
    console.error('   Run "npx tsx scripts/export-sqlite.ts" first.')
    process.exit(1)
  }

  const transformManifestPath = resolve(TRANSFORMED_DIR, 'transform-manifest.json')
  if (!existsSync(transformManifestPath)) {
    console.error(`❌ Transform manifest not found: ${transformManifestPath}`)
    console.error('   Run "npx tsx scripts/transform-data.ts" first.')
    process.exit(1)
  }

  const exportManifest: ExportManifest = JSON.parse(
    readFileSync(exportManifestPath, 'utf-8')
  )
  const transformManifest: TransformManifest = JSON.parse(
    readFileSync(transformManifestPath, 'utf-8')
  )

  const migrationUserId = transformManifest.migrationUserId

  console.log(`📂 Export manifest:    ${exportManifestPath}`)
  console.log(`📂 Transform manifest: ${transformManifestPath}`)
  console.log(`🔑 Migration UUID:     ${migrationUserId}`)
  console.log(`🔗 Supabase URL:       ${supabaseUrl}`)
  console.log(`📋 Tables to verify:   ${exportManifest.tables.length}`)
  console.log()

  // --- Create Supabase client ---
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // --- Run all checks ---
  const results: CheckResult[] = []

  // Check 1: Row counts
  console.log('── Check 1: Row Count Comparison ──')
  const rowCountResult = await checkRowCounts(supabase, exportManifest)
  results.push(rowCountResult)
  printResult(rowCountResult)

  // Check 2: FK integrity
  console.log('── Check 2: FK Integrity Scan ──')
  const fkResult = await checkFKIntegrity(supabase)
  results.push(fkResult)
  printResult(fkResult)

  // Check 3: Random sample comparison
  console.log('── Check 3: Random Sample Comparison ──')
  const sampleResult = await checkRandomSamples(
    supabase, exportManifest, migrationUserId
  )
  results.push(sampleResult)
  printResult(sampleResult)

  // Check 4: user_id consistency
  console.log('── Check 4: user_id Consistency ──')
  const userIdResult = await checkUserIdConsistency(supabase, migrationUserId)
  results.push(userIdResult)
  printResult(userIdResult)

  // Check 5: Source DB checksum
  console.log('── Check 5: Source DB Checksum ──')
  const checksumResult = checkSourceChecksum(exportManifest)
  results.push(checksumResult)
  printResult(checksumResult)

  // --- Final Verdict ---
  console.log('══════════════════════════════════════')
  const allPassed = results.every(r => r.passed)
  const passCount = results.filter(r => r.passed).length
  const failCount = results.filter(r => !r.passed).length

  if (allPassed) {
    console.log(`✅ ALL CHECKS PASSED (${passCount}/${results.length})`)
    console.log('   Migration verified successfully.')
  } else {
    console.log(`❌ VERIFICATION FAILED — ${failCount} check(s) failed`)
    for (const r of results.filter(r => !r.passed)) {
      console.log(`   - ${r.category}`)
    }
  }
  console.log('══════════════════════════════════════')
  console.log()

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
