#!/usr/bin/env tsx

/**
 * Export ref_build_cards from Supabase into an immutable SQLite snapshot.
 *
 * Usage:
 *   npm run export:commander-context
 *   npm run export:commander-context -- --output-dir=/tmp/commander-context
 *
 * Publication is fail-closed. The versioned SQLite file and manifest are
 * written first; manifest.json is atomically replaced last and acts as the
 * current-snapshot pointer. Existing snapshots are never overwritten.
 */
import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Database from 'better-sqlite3'

const SCHEMA_VERSION = 1
const MAX_PAGE_SIZE = 1000
const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), 'data', 'commander-context')
const CURRENT_MANIFEST_NAME = 'manifest.json'
const SOURCE_TABLE = 'ref_build_cards'
const REQUIRED_SOURCE_COLUMNS = [
  'build_id',
  'card_name',
  'synergy_score',
  'inclusion_rate',
  'position',
  'is_signature',
  'is_staple',
  'updated_at',
] as const

const SQLITE_SCHEMA = `
CREATE TABLE build_cards (
  build_id TEXT NOT NULL,
  card_name TEXT NOT NULL,
  card_type TEXT,
  synergy_score REAL,
  inclusion_rate REAL,
  position INTEGER,
  is_signature INTEGER NOT NULL CHECK (is_signature IN (0, 1)),
  is_staple INTEGER NOT NULL CHECK (is_staple IN (0, 1)),
  PRIMARY KEY (build_id, card_name)
) WITHOUT ROWID;

CREATE INDEX build_cards_rank
  ON build_cards(build_id, synergy_score DESC, inclusion_rate DESC, position ASC, card_name ASC);
CREATE INDEX build_cards_type_rank
  ON build_cards(build_id, card_type, synergy_score DESC, position ASC, card_name ASC);
CREATE INDEX build_cards_signature_rank
  ON build_cards(build_id, is_signature, synergy_score DESC, position ASC, card_name ASC);
CREATE INDEX build_cards_staple_rank
  ON build_cards(build_id, is_staple, inclusion_rate DESC, position ASC, card_name ASC);
`

interface ExportOptions {
  outputDir: string
  pageSize: number
}

type SourceTypeColumn = 'card_type' | 'category'

type SqliteDatabase = InstanceType<typeof Database>

interface SourceSchema {
  columns: string[]
  typeColumns: SourceTypeColumn[]
  canonicalTypeColumn: SourceTypeColumn
}

interface SourceState {
  rowCount: number
  maxUpdatedAt: string | null
}

interface BuildCardRow {
  buildId: string
  cardName: string
  cardType: string | null
  synergyScore: number | null
  inclusionRate: number | null
  position: number | null
  isSignature: boolean
  isStaple: boolean
}

interface PublicBuildCard {
  cardName: string
  cardType: string
  synergyScore: number
  inclusionRate: number
  position: number
  isSignature: boolean
  isStaple: boolean
}

interface ValidationSummary {
  sqliteIntegrity: 'ok'
  rowCount: number
  uniqueRowCount: number
  contentSha256: string
  representativeBuildIds: string[]
  representativeQueriesChecked: number
  nullFlagsNormalizedToFalse: number
}

interface CommanderContextManifest {
  schemaVersion: number
  generatedAt: string
  artifact: string
  sourceProjectRefHash: string
  sourceTables: {
    ref_build_cards: {
      rowCount: number
      maxUpdatedAt: string | null
      typeColumn: SourceTypeColumn
      sourceColumns: string[]
      contentSha256: string
    }
  }
  snapshotBytes: number
  sha256: string
  validation: ValidationSummary
}

interface SqliteRawRow {
  build_id: string
  card_name: string
  card_type: string | null
  synergy_score: number | null
  inclusion_rate: number | null
  position: number | null
  is_signature: number
  is_staple: number
}

function parseOptions(argv: string[]): ExportOptions {
  let outputDir = DEFAULT_OUTPUT_DIR
  let pageSize = MAX_PAGE_SIZE

  for (const arg of argv) {
    if (arg.startsWith('--output-dir=')) {
      const value = arg.slice('--output-dir='.length).trim()
      if (!value) throw new Error('--output-dir requires a path')
      outputDir = resolve(value)
    } else if (arg.startsWith('--page-size=')) {
      const value = Number(arg.slice('--page-size='.length))
      if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
        throw new Error(`--page-size must be an integer between 1 and ${MAX_PAGE_SIZE}`)
      }
      pageSize = value
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return { outputDir, pageSize }
}

function loadLocalEnvironment(): void {
  const envPath = resolve(process.cwd(), '.env.local')
  if (existsSync(envPath)) loadEnvFile(envPath)
}

function createAdminSupabaseClient(): { client: SupabaseClient; projectRefHash: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  let sourceIdentity: string
  try {
    sourceIdentity = new URL(url).hostname.toLowerCase()
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not a valid URL')
  }

  return {
    client: createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    projectRefHash: createHash('sha256').update(sourceIdentity).digest('hex'),
  }
}

async function probeSourceSchema(client: SupabaseClient): Promise<SourceSchema> {
  const { data, error } = await client
    .from(SOURCE_TABLE)
    .select('*')
    .order('build_id', { ascending: true })
    .order('card_name', { ascending: true })
    .limit(1)

  if (error) throw new Error(`Could not inspect ${SOURCE_TABLE}: ${error.message}`)
  if (!data || data.length === 0) throw new Error(`${SOURCE_TABLE} is empty; refusing to publish an empty snapshot`)

  const columns = Object.keys(data[0] as Record<string, unknown>).sort()
  const missing = REQUIRED_SOURCE_COLUMNS.filter(column => !columns.includes(column))
  if (missing.length > 0) {
    throw new Error(`${SOURCE_TABLE} is missing required columns: ${missing.join(', ')}`)
  }

  const typeColumns = (['card_type', 'category'] as const).filter(column => columns.includes(column))
  if (typeColumns.length === 0) {
    throw new Error(`${SOURCE_TABLE} must contain either card_type or category`)
  }

  return {
    columns,
    typeColumns,
    canonicalTypeColumn: typeColumns.includes('card_type') ? 'card_type' : 'category',
  }
}

async function readSourceState(client: SupabaseClient): Promise<SourceState> {
  const countResult = await client
    .from(SOURCE_TABLE)
    .select('*', { count: 'exact', head: true })

  if (countResult.error) {
    throw new Error(`Could not count ${SOURCE_TABLE}: ${countResult.error.message}`)
  }
  if (countResult.count === null) {
    throw new Error(`Supabase did not return an exact count for ${SOURCE_TABLE}`)
  }

  const maxResult = await client
    .from(SOURCE_TABLE)
    .select('updated_at')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (maxResult.error) {
    throw new Error(`Could not read ${SOURCE_TABLE}.updated_at: ${maxResult.error.message}`)
  }

  return {
    rowCount: countResult.count,
    maxUpdatedAt: (maxResult.data?.updated_at as string | null | undefined) ?? null,
  }
}

function requireString(value: unknown, field: string, rowNumber: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Row ${rowNumber}: ${field} must be a non-empty string`)
  }
  return value
}

function nullableNumber(
  value: unknown,
  field: string,
  rowNumber: number,
  options: { integer?: boolean; min?: number; max?: number } = {}
): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`Row ${rowNumber}: ${field} must be numeric or null`)
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    throw new Error(`Row ${rowNumber}: ${field} must be finite`)
  }
  if (options.integer && !Number.isInteger(numeric)) {
    throw new Error(`Row ${rowNumber}: ${field} must be an integer`)
  }
  if (options.min !== undefined && numeric < options.min) {
    throw new Error(`Row ${rowNumber}: ${field} must be >= ${options.min}`)
  }
  if (options.max !== undefined && numeric > options.max) {
    throw new Error(`Row ${rowNumber}: ${field} must be <= ${options.max}`)
  }

  return numeric
}

function nullableType(value: unknown, field: string, rowNumber: number): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Row ${rowNumber}: ${field} must be a non-empty string or null`)
  }
  return value
}

function normalizedBoolean(value: unknown, field: string, rowNumber: number): { value: boolean; normalized: boolean } {
  if (value === null || value === undefined) return { value: false, normalized: true }
  if (typeof value !== 'boolean') {
    throw new Error(`Row ${rowNumber}: ${field} must be boolean or null`)
  }
  return { value, normalized: false }
}

function normalizeSourceRow(
  source: Record<string, unknown>,
  schema: SourceSchema,
  rowNumber: number
): { row: BuildCardRow; normalizedNullFlags: number } {
  const typeValues = schema.typeColumns.map(column => ({
    column,
    value: nullableType(source[column], column, rowNumber),
  }))
  const nonNullTypeValues = typeValues.filter(entry => entry.value !== null)
  if (
    nonNullTypeValues.length > 1 &&
    new Set(nonNullTypeValues.map(entry => entry.value)).size > 1
  ) {
    throw new Error(
      `Row ${rowNumber}: conflicting card_type/category values for ${String(source.card_name)}`
    )
  }

  const signature = normalizedBoolean(source.is_signature, 'is_signature', rowNumber)
  const staple = normalizedBoolean(source.is_staple, 'is_staple', rowNumber)

  const row: BuildCardRow = {
    buildId: requireString(source.build_id, 'build_id', rowNumber),
    cardName: requireString(source.card_name, 'card_name', rowNumber),
    cardType: nonNullTypeValues[0]?.value ?? null,
    synergyScore: nullableNumber(source.synergy_score, 'synergy_score', rowNumber),
    inclusionRate: nullableNumber(source.inclusion_rate, 'inclusion_rate', rowNumber, { min: 0, max: 1 }),
    position: nullableNumber(source.position, 'position', rowNumber, { integer: true, min: 0 }),
    isSignature: signature.value,
    isStaple: staple.value,
  }

  return {
    row,
    normalizedNullFlags: Number(signature.normalized) + Number(staple.normalized),
  }
}

function canonicalRowLine(row: BuildCardRow): string {
  return `${JSON.stringify([
    row.buildId,
    row.cardName,
    row.cardType,
    row.synergyScore,
    row.inclusionRate,
    row.position,
    row.isSignature,
    row.isStaple,
  ])}\n`
}

function binaryTextCompare(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

function sourceContentHash(rowsByBuild: Map<string, BuildCardRow[]>): string {
  const rows = [...rowsByBuild.values()].flat()
  rows.sort((a, b) => (
    binaryTextCompare(a.buildId, b.buildId) || binaryTextCompare(a.cardName, b.cardName)
  ))

  const hash = createHash('sha256')
  for (const row of rows) hash.update(canonicalRowLine(row))
  return hash.digest('hex')
}

function sqliteRawToRow(row: SqliteRawRow): BuildCardRow {
  return {
    buildId: row.build_id,
    cardName: row.card_name,
    cardType: row.card_type,
    synergyScore: row.synergy_score,
    inclusionRate: row.inclusion_rate,
    position: row.position,
    isSignature: row.is_signature === 1,
    isStaple: row.is_staple === 1,
  }
}

function toPublicBuildCard(row: BuildCardRow): PublicBuildCard {
  return {
    cardName: row.cardName,
    cardType: row.cardType ?? 'unknown',
    synergyScore: row.synergyScore ?? 0,
    inclusionRate: row.inclusionRate ?? 0,
    position: row.position ?? 0,
    isSignature: row.isSignature,
    isStaple: row.isStaple,
  }
}

function synergySort(a: BuildCardRow, b: BuildCardRow): number {
  return (
    (b.synergyScore ?? 0) - (a.synergyScore ?? 0) ||
    (b.inclusionRate ?? 0) - (a.inclusionRate ?? 0) ||
    (a.position ?? 0) - (b.position ?? 0) ||
    binaryTextCompare(a.cardName, b.cardName)
  )
}

function stapleSort(a: BuildCardRow, b: BuildCardRow): number {
  return (
    (b.inclusionRate ?? 0) - (a.inclusionRate ?? 0) ||
    (b.synergyScore ?? 0) - (a.synergyScore ?? 0) ||
    (a.position ?? 0) - (b.position ?? 0) ||
    binaryTextCompare(a.cardName, b.cardName)
  )
}

function assertEquivalent(label: string, expected: unknown, actual: unknown): void {
  const expectedJson = JSON.stringify(expected)
  const actualJson = JSON.stringify(actual)
  if (expectedJson !== actualJson) {
    throw new Error(`${label} mismatch\nExpected: ${expectedJson}\nActual:   ${actualJson}`)
  }
}

function queryBuildCards(
  db: SqliteDatabase,
  whereClause: string,
  params: Array<string | number>,
  orderBy: string,
  limit: number
): PublicBuildCard[] {
  const rows = db.prepare(`
    SELECT build_id, card_name, card_type, synergy_score, inclusion_rate,
           position, is_signature, is_staple
    FROM build_cards
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ?
  `).all(...params, limit) as SqliteRawRow[]

  return rows.map(row => toPublicBuildCard(sqliteRawToRow(row)))
}

function representativeBuildIds(rowsByBuild: Map<string, BuildCardRow[]>): string[] {
  const buildIds = [...rowsByBuild.keys()].sort(binaryTextCompare)
  if (buildIds.length === 0) throw new Error('Snapshot contains no build IDs')

  const maxCountBuild = buildIds.reduce((best, current) => {
    const bestCount = rowsByBuild.get(best)?.length ?? 0
    const currentCount = rowsByBuild.get(current)?.length ?? 0
    return currentCount > bestCount ? current : best
  }, buildIds[0])

  const firstWithType = buildIds.find(id => rowsByBuild.get(id)?.some(row => row.cardType !== null))
  const firstWithSignature = buildIds.find(id => rowsByBuild.get(id)?.some(row => row.isSignature))
  const firstWithStaple = buildIds.find(id => rowsByBuild.get(id)?.some(row => row.isStaple))

  return [...new Set([
    buildIds[0],
    buildIds[buildIds.length - 1],
    maxCountBuild,
    firstWithType,
    firstWithSignature,
    firstWithStaple,
  ].filter((id): id is string => Boolean(id)))]
}

function validateRepresentativeQueries(
  db: SqliteDatabase,
  rowsByBuild: Map<string, BuildCardRow[]>
): { buildIds: string[]; queryCount: number } {
  const buildIds = representativeBuildIds(rowsByBuild)
  let queryCount = 0

  for (const buildId of buildIds) {
    const sourceRows = rowsByBuild.get(buildId) ?? []
    const expectedAll = [...sourceRows].sort(synergySort).slice(0, 100).map(toPublicBuildCard)
    const actualAll = queryBuildCards(
      db,
      'build_id = ?',
      [buildId],
      'COALESCE(synergy_score, 0) DESC, COALESCE(inclusion_rate, 0) DESC, COALESCE(position, 0) ASC, card_name ASC',
      100
    )
    assertEquivalent(`all-cards query for ${buildId}`, expectedAll, actualAll)
    queryCount += 1

    const type = sourceRows.find(row => row.cardType !== null)?.cardType
    if (type) {
      const expectedByType = sourceRows
        .filter(row => row.cardType?.toLowerCase() === type.toLowerCase())
        .sort(synergySort)
        .slice(0, 100)
        .map(toPublicBuildCard)
      const actualByType = queryBuildCards(
        db,
        'build_id = ? AND LOWER(card_type) = LOWER(?)',
        [buildId, type],
        'COALESCE(synergy_score, 0) DESC, COALESCE(inclusion_rate, 0) DESC, COALESCE(position, 0) ASC, card_name ASC',
        100
      )
      assertEquivalent(`type-filter query for ${buildId}`, expectedByType, actualByType)
      queryCount += 1
    }

    const expectedMinimum = sourceRows
      .filter(row => row.inclusionRate !== null && row.inclusionRate >= 0.5)
      .sort(synergySort)
      .slice(0, 100)
      .map(toPublicBuildCard)
    const actualMinimum = queryBuildCards(
      db,
      'build_id = ? AND inclusion_rate >= ?',
      [buildId, 0.5],
      'COALESCE(synergy_score, 0) DESC, COALESCE(inclusion_rate, 0) DESC, COALESCE(position, 0) ASC, card_name ASC',
      100
    )
    assertEquivalent(`minimum-inclusion query for ${buildId}`, expectedMinimum, actualMinimum)
    queryCount += 1

    const expectedSignatures = sourceRows
      .filter(row => row.isSignature)
      .sort(synergySort)
      .slice(0, 20)
      .map(toPublicBuildCard)
    const actualSignatures = queryBuildCards(
      db,
      'build_id = ? AND is_signature = 1',
      [buildId],
      'COALESCE(synergy_score, 0) DESC, COALESCE(inclusion_rate, 0) DESC, COALESCE(position, 0) ASC, card_name ASC',
      20
    )
    assertEquivalent(`signature query for ${buildId}`, expectedSignatures, actualSignatures)
    queryCount += 1

    const expectedStaples = sourceRows
      .filter(row => row.isStaple)
      .sort(stapleSort)
      .slice(0, 30)
      .map(toPublicBuildCard)
    const actualStaples = queryBuildCards(
      db,
      'build_id = ? AND is_staple = 1',
      [buildId],
      'COALESCE(inclusion_rate, 0) DESC, COALESCE(synergy_score, 0) DESC, COALESCE(position, 0) ASC, card_name ASC',
      30
    )
    assertEquivalent(`staple query for ${buildId}`, expectedStaples, actualStaples)
    queryCount += 1

    const lookupNames = [...sourceRows]
      .sort((a, b) => binaryTextCompare(a.cardName, b.cardName))
      .slice(0, 3)
      .map(row => row.cardName)
    if (lookupNames.length > 0) {
      const placeholders = lookupNames.map(() => '?').join(', ')
      const actualLookup = (db.prepare(`
        SELECT card_name, synergy_score
        FROM build_cards
        WHERE build_id = ? AND card_name IN (${placeholders})
        ORDER BY card_name ASC
      `).all(buildId, ...lookupNames) as Array<{ card_name: string; synergy_score: number | null }>)
      const expectedLookup = sourceRows
        .filter(row => lookupNames.includes(row.cardName))
        .sort((a, b) => binaryTextCompare(a.cardName, b.cardName))
        .map(row => ({ card_name: row.cardName, synergy_score: row.synergyScore }))
      assertEquivalent(`synergy lookup for ${buildId}`, expectedLookup, actualLookup)
      queryCount += 1
    }
  }

  const missingRows = db.prepare('SELECT card_name FROM build_cards WHERE build_id = ?').all('__missing_build__')
  assertEquivalent('empty-build query', [], missingRows)
  queryCount += 1

  return { buildIds, queryCount }
}

function createSnapshotDatabase(path: string): SqliteDatabase {
  const db = new Database(path)
  db.pragma('journal_mode = DELETE')
  db.pragma('synchronous = FULL')
  db.pragma('temp_store = MEMORY')
  db.pragma('page_size = 4096')
  db.exec(SQLITE_SCHEMA)
  return db
}

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function fsyncPath(path: string): void {
  const fd = openSync(path, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function safeRemove(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    // Preserve the original failure; stale temporary files remain hidden.
  }
}

function sqliteContentHash(db: SqliteDatabase): string {
  const hash = createHash('sha256')
  const rows = db.prepare(`
    SELECT build_id, card_name, card_type, synergy_score, inclusion_rate,
           position, is_signature, is_staple
    FROM build_cards
    ORDER BY build_id ASC, card_name ASC
  `).iterate() as Iterable<SqliteRawRow>

  for (const rawRow of rows) hash.update(canonicalRowLine(sqliteRawToRow(rawRow)))
  return hash.digest('hex')
}

async function exportSnapshot(
  client: SupabaseClient,
  schema: SourceSchema,
  options: ExportOptions,
  projectRefHash: string
): Promise<{ manifestPath: string; manifest: CommanderContextManifest }> {
  mkdirSync(options.outputDir, { recursive: true })

  const generatedAt = new Date().toISOString()
  const temporaryPrefix = `.commander-context-${process.pid}-${Date.now()}`
  const temporaryDatabasePath = resolve(options.outputDir, `${temporaryPrefix}.tmp.sqlite`)
  const sourceStateBefore = await readSourceState(client)
  const rowsByBuild = new Map<string, BuildCardRow[]>()
  const seenKeys = new Set<string>()
  let fetchedRows = 0
  let normalizedNullFlags = 0
  let db: SqliteDatabase | null = null
  let transactionOpen = false

  console.log(`Source rows: ${sourceStateBefore.rowCount.toLocaleString()}`)
  console.log(`Source type column: ${schema.canonicalTypeColumn}`)
  console.log(`Page size: ${options.pageSize}`)
  console.log(`Temporary snapshot: ${temporaryDatabasePath}`)

  try {
    db = createSnapshotDatabase(temporaryDatabasePath)
    const insert = db.prepare(`
      INSERT INTO build_cards (
        build_id, card_name, card_type, synergy_score, inclusion_rate,
        position, is_signature, is_staple
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const projection = [
      'build_id',
      'card_name',
      ...schema.typeColumns,
      'synergy_score',
      'inclusion_rate',
      'position',
      'is_signature',
      'is_staple',
    ].join(', ')

    db.exec('BEGIN IMMEDIATE')
    transactionOpen = true

    for (let offset = 0; ; offset += options.pageSize) {
      const { data, error } = await client
        .from(SOURCE_TABLE)
        .select(projection)
        .order('build_id', { ascending: true })
        .order('card_name', { ascending: true })
        .range(offset, offset + options.pageSize - 1)

      if (error) throw new Error(`Source page at offset ${offset} failed: ${error.message}`)
      const sourceRows = (data ?? []) as unknown as Array<Record<string, unknown>>
      if (sourceRows.length === 0) break

      for (const sourceRow of sourceRows) {
        const normalized = normalizeSourceRow(sourceRow, schema, fetchedRows + 1)
        const row = normalized.row
        const key = `${row.buildId}\u0000${row.cardName}`
        if (seenKeys.has(key)) {
          throw new Error(`Duplicate source key at row ${fetchedRows + 1}: ${row.buildId}/${row.cardName}`)
        }
        seenKeys.add(key)
        normalizedNullFlags += normalized.normalizedNullFlags

        insert.run(
          row.buildId,
          row.cardName,
          row.cardType,
          row.synergyScore,
          row.inclusionRate,
          row.position,
          row.isSignature ? 1 : 0,
          row.isStaple ? 1 : 0
        )

        const buildRows = rowsByBuild.get(row.buildId)
        if (buildRows) buildRows.push(row)
        else rowsByBuild.set(row.buildId, [row])
        fetchedRows += 1
      }

      if (fetchedRows % 10_000 < sourceRows.length) {
        console.log(`Fetched ${fetchedRows.toLocaleString()} rows...`)
      }
      if (sourceRows.length < options.pageSize) break
    }

    db.exec('COMMIT')
    transactionOpen = false

    const sourceStateAfter = await readSourceState(client)
    if (
      sourceStateBefore.rowCount !== sourceStateAfter.rowCount ||
      sourceStateBefore.maxUpdatedAt !== sourceStateAfter.maxUpdatedAt
    ) {
      throw new Error(
        `Source changed during export: before=${JSON.stringify(sourceStateBefore)}, after=${JSON.stringify(sourceStateAfter)}`
      )
    }
    if (fetchedRows !== sourceStateBefore.rowCount) {
      throw new Error(`Count mismatch: source=${sourceStateBefore.rowCount}, fetched=${fetchedRows}`)
    }

    const countRow = db.prepare(`
      SELECT COUNT(*) AS row_count,
             COUNT(DISTINCT build_id || char(31) || card_name) AS unique_row_count
      FROM build_cards
    `).get() as { row_count: number; unique_row_count: number }
    if (countRow.row_count !== fetchedRows || countRow.unique_row_count !== fetchedRows) {
      throw new Error(
        `SQLite count mismatch: fetched=${fetchedRows}, rows=${countRow.row_count}, unique=${countRow.unique_row_count}`
      )
    }

    const integrityRows = db.pragma('integrity_check') as Array<{ integrity_check: string }>
    if (integrityRows.length !== 1 || integrityRows[0].integrity_check !== 'ok') {
      throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrityRows)}`)
    }

    const expectedIndexes = [
      'build_cards_rank',
      'build_cards_signature_rank',
      'build_cards_staple_rank',
      'build_cards_type_rank',
    ]
    const actualIndexes = (db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `).all() as Array<{ name: string }>).map(row => row.name)
    assertEquivalent('SQLite index set', expectedIndexes, actualIndexes)

    const sourceContentSha256 = sourceContentHash(rowsByBuild)
    const snapshotContentSha256 = sqliteContentHash(db)
    if (snapshotContentSha256 !== sourceContentSha256) {
      throw new Error(
        `Content checksum mismatch: source=${sourceContentSha256}, snapshot=${snapshotContentSha256}`
      )
    }

    const representative = validateRepresentativeQueries(db, rowsByBuild)
    db.exec('VACUUM')
    db.close()
    db = null

    fsyncPath(temporaryDatabasePath)
    const snapshotSha256 = hashFile(temporaryDatabasePath)
    const snapshotBytes = statSync(temporaryDatabasePath).size
    const timestamp = generatedAt.replace(/[-:.]/g, '').replace('Z', 'Z')
    const version = `commander-context-v${SCHEMA_VERSION}-${timestamp}-${sourceContentSha256.slice(0, 12)}`
    const artifactName = `${version}.sqlite`
    const versionedManifestName = `${version}.manifest.json`
    const finalDatabasePath = resolve(options.outputDir, artifactName)
    const finalVersionedManifestPath = resolve(options.outputDir, versionedManifestName)
    const finalCurrentManifestPath = resolve(options.outputDir, CURRENT_MANIFEST_NAME)
    const temporaryVersionedManifestPath = resolve(options.outputDir, `${temporaryPrefix}.tmp.manifest.json`)
    const temporaryCurrentManifestPath = resolve(options.outputDir, `${temporaryPrefix}.tmp.current.json`)

    if (existsSync(finalDatabasePath) || existsSync(finalVersionedManifestPath)) {
      throw new Error(`Immutable snapshot version already exists: ${version}`)
    }

    const manifest: CommanderContextManifest = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt,
      artifact: artifactName,
      sourceProjectRefHash: projectRefHash,
      sourceTables: {
        ref_build_cards: {
          rowCount: fetchedRows,
          maxUpdatedAt: sourceStateAfter.maxUpdatedAt,
          typeColumn: schema.canonicalTypeColumn,
          sourceColumns: schema.columns,
          contentSha256: sourceContentSha256,
        },
      },
      snapshotBytes,
      sha256: snapshotSha256,
      validation: {
        sqliteIntegrity: 'ok',
        rowCount: countRow.row_count,
        uniqueRowCount: countRow.unique_row_count,
        contentSha256: snapshotContentSha256,
        representativeBuildIds: representative.buildIds,
        representativeQueriesChecked: representative.queryCount,
        nullFlagsNormalizedToFalse: normalizedNullFlags,
      },
    }

    const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`
    writeFileSync(temporaryVersionedManifestPath, serializedManifest, { flag: 'wx' })
    writeFileSync(temporaryCurrentManifestPath, serializedManifest, { flag: 'wx' })
    fsyncPath(temporaryVersionedManifestPath)
    fsyncPath(temporaryCurrentManifestPath)

    let databasePublished = false
    let versionedManifestPublished = false
    let currentManifestPublished = false
    try {
      renameSync(temporaryDatabasePath, finalDatabasePath)
      databasePublished = true
      renameSync(temporaryVersionedManifestPath, finalVersionedManifestPath)
      versionedManifestPublished = true
      renameSync(temporaryCurrentManifestPath, finalCurrentManifestPath)
      currentManifestPublished = true
      fsyncPath(options.outputDir)
    } catch (error) {
      if (!currentManifestPublished) {
        if (versionedManifestPublished) safeRemove(finalVersionedManifestPath)
        if (databasePublished) safeRemove(finalDatabasePath)
      }
      throw error
    }

    return { manifestPath: finalCurrentManifestPath, manifest }
  } catch (error) {
    if (db) {
      if (transactionOpen) {
        try {
          db.exec('ROLLBACK')
        } catch {
          // The original export failure is more useful.
        }
      }
      db.close()
    }
    safeRemove(temporaryDatabasePath)
    for (const file of [
      `${temporaryPrefix}.tmp.manifest.json`,
      `${temporaryPrefix}.tmp.current.json`,
    ]) safeRemove(resolve(options.outputDir, file))
    throw error
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2))
  loadLocalEnvironment()
  const { client, projectRefHash } = createAdminSupabaseClient()

  console.log('Exporting commander context from Supabase')
  console.log(`Output directory: ${options.outputDir}`)

  const schema = await probeSourceSchema(client)
  const result = await exportSnapshot(client, schema, options, projectRefHash)

  console.log('\nCommander-context snapshot published')
  console.log(`Artifact: ${result.manifest.artifact}`)
  console.log(`Manifest: ${result.manifestPath}`)
  console.log(`Rows: ${result.manifest.sourceTables.ref_build_cards.rowCount.toLocaleString()}`)
  console.log(`Size: ${(result.manifest.snapshotBytes / 1024 / 1024).toFixed(2)} MiB`)
  console.log(`SHA-256: ${result.manifest.sha256}`)
  console.log(`Representative queries: ${result.manifest.validation.representativeQueriesChecked}`)
}

main().catch(error => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(`\nCommander-context export failed:\n${message}`)
  process.exitCode = 1
})
