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

import { createServerClient } from '@/lib/supabase'

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

/** Default user ID for single-user operation */
const DEFAULT_USER_ID = process.env.SUPABASE_DEFAULT_USER_ID ?? '00000000-0000-0000-0000-000000000000'

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

  // Stage 3: Upsert resolved rows in batches of BATCH_SIZE
  const resolvedChunks = chunk(resolved, BATCH_SIZE)

  for (let batchIdx = 0; batchIdx < resolvedChunks.length; batchIdx++) {
    const batch = resolvedChunks[batchIdx]

    try {
      for (const row of batch) {
        // Ensure card_definition exists for this oracle_id
        const cardDefinitionId = await ensureCardDefinition(row.oracleId, row.cardName)

        // Set the physical copy state (authoritative overwrite)
        const result = await setPhysicalCopyState({
          cardDefinitionId,
          scryfallPrintingId: row.scryfallPrintingId,
          isFoil: row.isFoil,
          quantity: row.quantity,
          condition: row.condition,
        })

        // Track the touched row id for soft-delete exclusion
        touchedIds.add(result.id)

        // Increment counters by action
        switch (result.action) {
          case 'created':
            created++
            break
          case 'updated_quantity':
            updatedQuantity++
            break
          case 'updated_condition':
            updatedCondition++
            break
          case 'unchanged':
            unchanged++
            break
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      batchErrors.push(`Batch ${batchIdx}: ${message}`)
      // Log and continue — don't abort the entire import for one bad batch
      console.error(`[import-engine] Batch ${batchIdx} error:`, message)
    }
  }

  // Stage 4: Soft-delete scan
  // Set quantity = 0 on physical_copies rows that weren't touched by the import
  // IMPORTANT: Skip soft-delete if no resolved rows (avoid wiping everything
  // on an empty/bad parse)
  if (resolved.length > 0 && touchedIds.size > 0) {
    try {
      softDeleted = await softDeleteAbsentCopies(touchedIds)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      batchErrors.push(`Soft-delete: ${message}`)
      console.error(`[import-engine] Soft-delete error:`, message)
    }
  }

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
async function softDeleteAbsentCopies(touchedIds: Set<number>): Promise<number> {
  const supabase = createServerClient()

  // Get all non-proxy physical copies with quantity > 0
  const { data: allCopies, error: fetchError } = await supabase
    .from('physical_copies')
    .select('id')
    .eq('is_proxy', false)
    .gt('quantity', 0)
    .eq('user_id', DEFAULT_USER_ID)

  if (fetchError) {
    throw new Error(`Failed to fetch physical copies for soft-delete: ${fetchError.message}`)
  }

  if (!allCopies || allCopies.length === 0) return 0

  // Find IDs that should be soft-deleted (not in touchedIds)
  const toDelete = allCopies
    .map(row => row.id)
    .filter(id => !touchedIds.has(id))

  if (toDelete.length === 0) return 0

  // Process soft-deletes in batches to stay within query limits
  let totalDeleted = 0
  const deleteChunks = chunk(toDelete, BATCH_SIZE)

  for (const batch of deleteChunks) {
    const { error: updateError } = await supabase
      .from('physical_copies')
      .update({ quantity: 0 })
      .in('id', batch)

    if (updateError) {
      throw new Error(`Failed to soft-delete physical copies batch: ${updateError.message}`)
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
