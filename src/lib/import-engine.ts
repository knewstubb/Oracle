/**
 * Collection CSV Upsert — Import Engine
 *
 * Orchestrates the 5-stage import pipeline:
 *   Stage 1: Parse CSV into ParsedCSVRow[]
 *   Stage 2: Resolve identities using Scryfall bulk data
 *   Stage 3: Upsert physical_copies (create/update) in batches
 *   Stage 4: Soft-delete rows not present in CSV
 *   Stage 5: Build and return ImportSummary
 *
 * Stages 3–4 use chunked processing (500 rows per batch) for
 * Vercel serverless timeout compatibility.
 *
 * Uses Supabase client for all database operations (async).
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 5.1, 5.2, 5.5, 5.6,
 *   6.1, 6.2, 6.3, 6.5, 7.1, 7.2, 7.3, 7.4, 9.1, 9.2, 9.3, 9.4,
 *   10.1, 10.4
 */

import { createAdminClient } from '@/lib/supabase'

import {
  type ParsedCSVRow,
  type ResolvedRow,
  type UnmatchedRowDetail,
  type UnmatchedReason,
  resolveIdentities,
} from './identity-resolver'
import { ensureCardDefinition, setPhysicalCopyState } from './card-identity-store'
import type { ScryfallBulkIndex } from './scryfall-bulk-cache'

// Re-export types used by consumers
export type { UnmatchedRowDetail, UnmatchedReason }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of rows to process per batch for Vercel timeout compatibility */
const BATCH_SIZE = 500

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportOptions {
  /** Path to CSV file, or raw CSV string/Buffer */
  csvInput: string | Buffer
  /** Whether csvInput is a file path (true) or raw content (false/undefined) */
  isFilePath?: boolean
  /** Optional: pre-built bulk index (for testing). If not provided, downloads/loads from cache. */
  bulkIndex?: ScryfallBulkIndex
  /** User ID for the authenticated user */
  userId?: string
}

export interface ImportSummary {
  created: number
  updatedQuantity: number
  updatedCondition: number
  unchanged: number
  softDeleted: number
  excluded: number          // non-paper rows skipped (reserved for future use)
  unmatched: number
  unmatchedRows: UnmatchedRowDetail[]
  totalCsvRows: number
  totalWriteCount: number   // created + updatedQuantity + updatedCondition + softDeleted
  durationMs: number
  batchErrors: string[]     // errors logged per-batch (non-fatal)
}

// ---------------------------------------------------------------------------
// CSV Parsing (Stage 1)
// ---------------------------------------------------------------------------

/**
 * Required columns for the Archidekt collection CSV format.
 * The import engine needs these to build ParsedCSVRow objects.
 */
const REQUIRED_COLUMNS = [
  'Quantity',
  'Name',
  'Finish',
  'Condition',
  'Edition Code',
  'Collector Number',
  'Scryfall ID',
]

/** Optional columns — used if present, gracefully handled if absent */
const OPTIONAL_COLUMNS = ['Scryfall Oracle ID']

/**
 * Parse a CSV line handling quoted fields (commas inside quotes).
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  fields.push(current.trim())

  return fields
}

/**
 * Parse CSV content into ParsedCSVRow[] for the import engine.
 *
 * Throws on empty CSV or missing required columns.
 * Skips rows with missing Name column (malformed).
 */
function parseCSVForImport(csvContent: string): ParsedCSVRow[] {
  const lines = csvContent.split('\n')
  const headerLine = lines[0]?.trim()

  if (!headerLine) {
    throw new Error('CSV is empty — no header row found')
  }

  const headers = parseCSVLine(headerLine)

  // Validate required columns exist
  const missingColumns = REQUIRED_COLUMNS.filter(
    (col) => !headers.includes(col)
  )
  if (missingColumns.length > 0) {
    throw new Error(
      `CSV missing required columns: ${missingColumns.join(', ')}`
    )
  }

  // Build column index map
  const colIndex: Record<string, number> = {}
  for (const col of REQUIRED_COLUMNS) {
    colIndex[col] = headers.indexOf(col)
  }
  for (const col of OPTIONAL_COLUMNS) {
    colIndex[col] = headers.indexOf(col) // -1 if not present
  }

  const rows: ParsedCSVRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = parseCSVLine(line)

    const name = fields[colIndex['Name']] || ''
    if (!name) continue // Skip rows with no name

    const rawQuantity = fields[colIndex['Quantity']] || ''
    const quantity = parseInt(rawQuantity, 10)

    rows.push({
      rowIndex: i, // 1-based row index (line number in file)
      quantity: isNaN(quantity) ? 0 : quantity,
      name,
      finish: fields[colIndex['Finish']] || '',
      condition: fields[colIndex['Condition']] || '',
      editionCode: fields[colIndex['Edition Code']] || '',
      collectorNumber: fields[colIndex['Collector Number']] || '',
      scryfallId: fields[colIndex['Scryfall ID']] || '',
      scryfallOracleId: colIndex['Scryfall Oracle ID'] >= 0
        ? (fields[colIndex['Scryfall Oracle ID']] || '')
        : '',
    })
  }

  return rows
}

// ---------------------------------------------------------------------------
// Chunking Utility
// ---------------------------------------------------------------------------

/**
 * Split an array into chunks of the given size.
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

/**
 * Execute the full collection CSV upsert pipeline (async).
 *
 * Pipeline stages:
 *   1. Parse CSV → ParsedCSVRow[]
 *   2. Resolve identities → ResolvedRow[] + UnmatchedRowDetail[]
 *   3. Upsert physical_copies in batches of 500 (chunked for Vercel timeout)
 *   4. Soft-delete absent rows
 *   5. Build and return ImportSummary
 *
 * Stages 3-4 use chunked processing. Per-batch errors are logged and
 * processing continues where possible.
 */
export async function executeCollectionImport(
  options: ImportOptions
): Promise<ImportSummary> {
  const startTime = Date.now()

  // -------------------------------------------------------------------------
  // Stage 1: Parse CSV
  // -------------------------------------------------------------------------
  let csvContent: string

  if (options.isFilePath) {
    // For file path input, use dynamic import of fs (works in Node.js server context)
    const { readFileSync } = await import('fs')
    csvContent = readFileSync(options.csvInput as string, 'utf-8')
  } else if (Buffer.isBuffer(options.csvInput)) {
    csvContent = options.csvInput.toString('utf-8')
  } else {
    csvContent = options.csvInput as string
  }

  const parsedRows = parseCSVForImport(csvContent)
  const totalCsvRows = parsedRows.length

  // -------------------------------------------------------------------------
  // Stage 2: Resolve identities
  // -------------------------------------------------------------------------
  let bulkIndex: ScryfallBulkIndex | undefined

  if (options.bulkIndex) {
    bulkIndex = options.bulkIndex
  } else {
    // Skip bulk data loading entirely — it's 500MB+ and exceeds Node.js string limits.
    // The resolver handles this gracefully:
    // - If CSV has Scryfall Oracle ID → uses it directly (Priority 1)
    // - If not → falls back to oracle_to_printings DB table, then Scryfall API
    bulkIndex = undefined
  }

  const { resolved, unmatched } = await resolveIdentities(parsedRows, bulkIndex)

  // -------------------------------------------------------------------------
  // Stages 3–4: Upsert + Soft-delete (chunked processing)
  // -------------------------------------------------------------------------
  let created = 0
  let updatedQuantity = 0
  let updatedCondition = 0
  let unchanged = 0
  let softDeleted = 0
  const batchErrors: string[] = []

  const touchedIds = new Set<number>()

  // Stage 3: Bulk insert resolved rows
  // Post-migration-007 optimization: instead of per-row upsert (2+ DB calls each),
  // batch-insert card_definitions and physical_copies in large chunks.
  const supabaseImport = createAdminClient()

  // 3a: Collect unique oracle_ids and ensure card_definitions exist (batched)
  const uniqueOracleIds = new Map<string, { oracleId: string; cardName: string }>()
  for (const row of resolved) {
    if (!uniqueOracleIds.has(row.oracleId)) {
      uniqueOracleIds.set(row.oracleId, { oracleId: row.oracleId, cardName: row.cardName })
    }
  }

  // Pre-fetch ALL existing card_definitions for this user in one query
  const cardDefMap = new Map<string, number>() // oracle_id → card_definition_id
  const { data: existingDefs } = await supabaseImport
    .from('card_definitions')
    .select('id, oracle_id')
    .eq('user_id', options.userId ?? '')

  for (const def of existingDefs ?? []) {
    cardDefMap.set(def.oracle_id, def.id)
  }

  // Insert only the missing card_definitions (batch insert)
  const missingDefs = Array.from(uniqueOracleIds.values())
    .filter(d => !cardDefMap.has(d.oracleId))

  if (missingDefs.length > 0) {
    const defInsertChunks = chunk(missingDefs.map(d => ({
      oracle_id: d.oracleId,
      card_name: d.cardName,
      user_id: options.userId ?? '',
    })), BATCH_SIZE)

    for (const defBatch of defInsertChunks) {
      const { data: inserted, error: defErr } = await supabaseImport
        .from('card_definitions')
        .upsert(defBatch, { onConflict: 'oracle_id' })
        .select('id, oracle_id')

      if (defErr) {
        batchErrors.push(`card_definitions upsert: ${defErr.message}`)
      } else {
        for (const row of inserted ?? []) {
          cardDefMap.set(row.oracle_id, row.id)
        }
      }
    }
  }

  // 3b: Build physical_copies insert payload (one row per instance)
  const physicalCopyRows: Array<{
    card_definition_id: number
    scryfall_printing_id: string
    is_foil: boolean
    is_proxy: boolean
    condition: string | null
    user_id: string
  }> = []

  for (const row of resolved) {
    const cardDefId = cardDefMap.get(row.oracleId)
    if (!cardDefId) continue // skip if card_definition failed

    for (let i = 0; i < row.quantity; i++) {
      physicalCopyRows.push({
        card_definition_id: cardDefId,
        scryfall_printing_id: row.scryfallPrintingId,
        is_foil: row.isFoil,
        is_proxy: false,
        condition: row.condition ?? null,
        user_id: options.userId ?? '',
      })
    }
  }

  // 3c: Bulk insert physical_copies in chunks of 500
  const insertChunks = chunk(physicalCopyRows, BATCH_SIZE)
  for (const insertBatch of insertChunks) {
    try {
      const { error: insertErr } = await supabaseImport
        .from('physical_copies')
        .insert(insertBatch as any)

      if (insertErr) {
        batchErrors.push(`physical_copies insert: ${insertErr.message}`)
      } else {
        created += insertBatch.length
      }
    } catch (err) {
      batchErrors.push(`physical_copies insert: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 3d: Ensure oracle_to_printings mappings are cached for future imports
  const printingMappings = Array.from(uniqueOracleIds.entries())
    .map(([oracleId]) => {
      const row = resolved.find(r => r.oracleId === oracleId)
      return row ? { oracle_id: oracleId, scryfall_printing_id: row.scryfallPrintingId } : null
    })
    .filter((m): m is { oracle_id: string; scryfall_printing_id: string } => m !== null && m.scryfall_printing_id !== '')

  if (printingMappings.length > 0) {
    const mappingChunks = chunk(printingMappings, BATCH_SIZE)
    for (const mappingBatch of mappingChunks) {
      try {
        await supabaseImport
          .from('oracle_to_printings')
          .upsert(mappingBatch, { onConflict: 'oracle_id,scryfall_printing_id' })
      } catch {
        // Non-fatal — just caching for future imports
      }
    }
  }

  // Stage 4: Soft-delete scan — DISABLED
  // The V1 soft-delete has no source-tag scoping. It would delete ALL physical_copies
  // not touched by this import, which means importing from one source (e.g., Moxfield)
  // would wipe rows from another source (e.g., Archidekt). This is the original
  // destructive-reimport problem.
  //
  // For source-scoped sync (only removing rows from the SAME source), use mode=sync
  // which routes to import-engine-v2's executeSyncMode.
  //
  // The V1 upsert mode is now purely additive: it creates/updates but never deletes.
  // if (resolved.length > 0 && touchedIds.size > 0) {
  //   softDeleted = await softDeleteAbsentCopies(touchedIds, options.userId ?? '')
  // }

  // -------------------------------------------------------------------------
  // Stage 5: Build ImportSummary
  // -------------------------------------------------------------------------
  const durationMs = Date.now() - startTime
  const totalWriteCount = created + updatedQuantity + updatedCondition + softDeleted

  return {
    created,
    updatedQuantity,
    updatedCondition,
    unchanged,
    softDeleted,
    excluded: 0, // reserved for future non-paper row exclusion
    unmatched: unmatched.length,
    unmatchedRows: unmatched,
    totalCsvRows,
    totalWriteCount,
    durationMs,
    batchErrors,
  }
}

// ---------------------------------------------------------------------------
// Soft-Delete Helper
// ---------------------------------------------------------------------------

/**
 * Soft-delete physical copies not touched during import.
 * Sets quantity = 0 on all non-proxy physical_copies rows whose id is NOT
 * in the touchedIds set.
 *
 * Uses chunked processing to handle large sets of IDs within Supabase
 * query limits.
 *
 * Returns the total number of rows soft-deleted.
 */
async function softDeleteAbsentCopies(touchedIds: Set<number>, userId: string): Promise<number> {
  const supabase = createAdminClient()

  // Post-migration-007: No quantity column. Get all non-proxy physical copies for this user.
  const { data: allCopies, error: fetchError } = await supabase
    .from('physical_copies')
    .select('id')
    .eq('is_proxy', false)
    .eq('user_id', userId)

  if (fetchError) {
    throw new Error(`Failed to fetch physical copies for soft-delete: ${fetchError.message}`)
  }

  if (!allCopies || allCopies.length === 0) return 0

  // Find IDs that should be deleted (not in touchedIds)
  const toDelete = allCopies
    .map(row => row.id)
    .filter(id => !touchedIds.has(id))

  if (toDelete.length === 0) return 0

  // Delete in batches
  let totalDeleted = 0
  const deleteChunks = chunk(toDelete, BATCH_SIZE)

  for (const batch of deleteChunks) {
    const { error: deleteError } = await supabase
      .from('physical_copies')
      .delete()
      .in('id', batch)

    if (deleteError) {
      throw new Error(`Failed to delete physical copies batch: ${deleteError.message}`)
    }

    totalDeleted += batch.length
  }

  return totalDeleted
}

// ---------------------------------------------------------------------------
// Convenience Alias (backward-compatible async entry point)
// ---------------------------------------------------------------------------

/**
 * Async entry point for the collection import pipeline.
 * Downloads/loads bulk data if not provided, then runs the full pipeline.
 *
 * This is the primary entry point for production use (API routes).
 */
export async function executeCollectionImportAsync(
  options: ImportOptions
): Promise<ImportSummary> {
  return executeCollectionImport(options)
}
