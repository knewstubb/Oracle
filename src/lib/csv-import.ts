/**
 * Collection CSV Import — Parsing, Delta Computation, and Batch Upsert
 *
 * Handles the Archidekt collection export CSV format:
 * - Parses CSV into typed rows
 * - Computes delta against current Supabase collection state
 * - Applies collection import via chunked upserts (500 rows/batch)
 *   for Vercel serverless timeout compatibility
 *
 * Uses Supabase client for all database operations (async).
 *
 * Validates: Requirements 5.1, 5.5, 6.5
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of rows to process per INSERT batch to stay within Supabase payload limits */
const BATCH_SIZE = 200

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollectionCSVRow {
  quantity: number
  name: string
  finish: 'Normal' | 'Foil' | 'Etched'
  condition: string
  dateAdded: string
  language: string
  purchasePrice: number
  tags: string
  editionName: string
  editionCode: string
  multiverseId: string
  scryfallId: string
  collectorNumber: string
  identities: string
  types: string
}

export interface ImportDelta {
  added: CollectionCSVRow[]
  removed: CollectionCSVRow[]
  quantityChanged: Array<{
    entry: CollectionCSVRow
    previousQuantity: number
  }>
  totalEntries: number
  previousEntries: number
}

export interface BatchResult {
  batchIndex: number
  rowsProcessed: number
  errors: string[]
}

export interface ImportResult {
  totalInserted: number
  batches: BatchResult[]
  errors: string[]
}

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------

const REQUIRED_COLUMNS = [
  'Quantity',
  'Name',
  'Finish',
  'Condition',
  'Date Added',
  'Language',
  'Purchase Price',
  'Tags',
  'Edition Name',
  'Edition Code',
  'Multiverse Id',
  'Scryfall ID',
  'Collector Number',
]

/** Columns that enhance the data but aren't essential for import */
const OPTIONAL_COLUMNS = ['Identities', 'Types']

/**
 * Parse a single CSV line handling quoted fields (commas inside quotes).
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
 * Parse CSV content into typed CollectionCSVRow array.
 * Throws on invalid format (missing required columns).
 */
export function parseCollectionCSV(csvContent: string): CollectionCSVRow[] {
  const lines = csvContent.split('\n')
  const headerLine = lines[0]?.trim()
  if (!headerLine) {
    throw new Error('CSV is empty — no header row found')
  }
  const headers = parseCSVLine(headerLine)

  // Validate required columns
  const missingColumns = REQUIRED_COLUMNS.filter(
    (col) => !headers.includes(col)
  )
  if (missingColumns.length > 0) {
    throw new Error(
      `CSV is missing required columns: ${missingColumns.join(', ')}`
    )
  }

  // Build column index map (required + optional)
  const colIndex: Record<string, number> = {}
  for (const col of REQUIRED_COLUMNS) {
    colIndex[col] = headers.indexOf(col)
  }
  for (const col of OPTIONAL_COLUMNS) {
    colIndex[col] = headers.indexOf(col) // -1 if not present
  }

  const rows: CollectionCSVRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = parseCSVLine(line)

    const name = fields[colIndex['Name']] || ''
    if (!name) continue // Skip rows with no name

    const finish = fields[colIndex['Finish']] || 'Normal'
    const validFinishes = ['Normal', 'Foil', 'Etched']
    const normalizedFinish = validFinishes.includes(finish)
      ? (finish as 'Normal' | 'Foil' | 'Etched')
      : 'Normal'

    rows.push({
      quantity: parseInt(fields[colIndex['Quantity']] || '1', 10) || 1,
      name,
      finish: normalizedFinish,
      condition: fields[colIndex['Condition']] || '',
      dateAdded: fields[colIndex['Date Added']] || '',
      language: fields[colIndex['Language']] || '',
      purchasePrice:
        parseFloat(fields[colIndex['Purchase Price']] || '0') || 0,
      tags: fields[colIndex['Tags']] || '',
      editionName: fields[colIndex['Edition Name']] || '',
      editionCode: fields[colIndex['Edition Code']] || '',
      multiverseId: fields[colIndex['Multiverse Id']] || '',
      scryfallId: fields[colIndex['Scryfall ID']] || '',
      collectorNumber: fields[colIndex['Collector Number']] || '',
      identities: colIndex['Identities'] >= 0 ? (fields[colIndex['Identities']] || '') : '',
      types: colIndex['Types'] >= 0 ? (fields[colIndex['Types']] || '') : '',
    })
  }

  return rows
}

// ---------------------------------------------------------------------------
// Delta Computation
// ---------------------------------------------------------------------------

/**
 * Build a unique key for a collection row.
 * Uses name + editionCode + finish to identify unique entries.
 */
function rowKey(row: { name: string; editionCode: string; finish: string }): string {
  return `${row.name}|${row.editionCode}|${row.finish}`
}

/**
 * Compare new CSV rows against current Supabase collection state and return delta.
 */
export async function computeCollectionDelta(
  newRows: CollectionCSVRow[]
): Promise<ImportDelta> {
  const supabase = createAdminClient()

  // Read current DB state
  const { data: currentDbRows, error } = await supabase
    .from('collection')
    .select('card_name, set_code, quantity, finish')

  if (error) {
    throw new Error(`Failed to read current collection: ${error.message}`)
  }

  // Build a map of current DB state keyed by name|set_code|finish
  const currentMap = new Map<string, number>()
  for (const row of currentDbRows ?? []) {
    const key = `${row.card_name}|${row.set_code}|${row.finish || 'Normal'}`
    currentMap.set(key, row.quantity)
  }

  // Build a map of new rows
  const newMap = new Map<string, CollectionCSVRow>()
  for (const row of newRows) {
    const key = rowKey({ name: row.name, editionCode: row.editionCode, finish: row.finish })
    newMap.set(key, row)
  }

  const added: CollectionCSVRow[] = []
  const removed: CollectionCSVRow[] = []
  const quantityChanged: Array<{ entry: CollectionCSVRow; previousQuantity: number }> = []

  // Find additions and quantity changes
  for (const [key, row] of newMap) {
    const prevQty = currentMap.get(key)
    if (prevQty === undefined) {
      added.push(row)
    } else if (row.quantity !== prevQty) {
      quantityChanged.push({ entry: row, previousQuantity: prevQty })
    }
  }

  // Find removals — entries in current DB but not in new rows
  for (const row of currentDbRows ?? []) {
    const key = `${row.card_name}|${row.set_code}|${row.finish || 'Normal'}`
    if (!newMap.has(key)) {
      removed.push({
        quantity: row.quantity,
        name: row.card_name,
        finish: (row.finish || 'Normal') as 'Normal' | 'Foil' | 'Etched',
        condition: '',
        dateAdded: '',
        language: '',
        purchasePrice: 0,
        tags: '',
        editionName: '',
        editionCode: row.set_code || '',
        multiverseId: '',
        scryfallId: '',
        collectorNumber: '',
        identities: '',
        types: '',
      })
    }
  }

  return {
    added,
    removed,
    quantityChanged,
    totalEntries: newRows.length,
    previousEntries: (currentDbRows ?? []).length,
  }
}

// ---------------------------------------------------------------------------
// Chunked Import
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

/**
 * Apply the import — replace collection table contents using chunked upserts.
 * Processes 500 rows per batch for Vercel timeout compatibility.
 *
 * Strategy:
 * 1. Delete all existing collection rows for the user
 * 2. Insert new rows in batches of 500
 * 3. Update sync_meta with timestamp
 *
 * Returns the result including total inserted count and per-batch status.
 * Errors per batch are logged and processing continues (best-effort).
 */
export async function applyCollectionImport(
  rows: CollectionCSVRow[],
  options?: { skipDelete?: boolean; userId?: string }
): Promise<ImportResult> {
  const supabase = createAdminClient()
  const batches: BatchResult[] = []
  const errors: string[] = []
  let totalInserted = 0
  const userId = options?.userId ?? ''

  // Step 1: Delete ALL existing collection data (only on first chunk)
  if (!options?.skipDelete) {
    // Delete all collection rows — loop until table is empty
    // Supabase PostgREST may cap deletes at 1000 rows per request
    for (let attempt = 0; attempt < 20; attempt++) {
      const { error: deleteError } = await supabase
        .from('collection')
        .delete()
        .neq('id', 0) // match all rows (id is never 0 since it's auto-generated starting from 1)

      if (deleteError) {
        throw new Error(`Failed to clear collection before import: ${deleteError.message}`)
      }

      // Check if any rows remain
      const { count } = await supabase
        .from('collection')
        .select('*', { count: 'exact', head: true })

      if (!count || count === 0) break
    }
  }

  // Step 2: Deduplicate rows — merge quantities for same (name, scryfall_id, finish)
  const deduped = new Map<string, typeof rows[0]>()
  for (const row of rows) {
    const key = `${row.name}||${row.scryfallId || ''}||${row.finish || ''}||${row.editionCode || ''}||${row.collectorNumber || ''}`
    const existing = deduped.get(key)
    if (existing) {
      existing.quantity += row.quantity
    } else {
      deduped.set(key, { ...row })
    }
  }
  const dedupedRows = Array.from(deduped.values())

  // Step 3: Insert deduplicated rows in chunks of BATCH_SIZE
  const chunks = chunk(dedupedRows, BATCH_SIZE)

  for (let i = 0; i < chunks.length; i++) {
    const batch = chunks[i]
    const batchErrors: string[] = []

    try {
      const insertRows = batch.map((row) => ({
        card_name: row.name,
        scryfall_id: row.scryfallId || null,
        set_code: row.editionCode || null,
        quantity: row.quantity,
        foil: row.finish === 'Foil',
        finish: row.finish,
        condition: row.condition || 'Near Mint',
        date_added: row.dateAdded || null,
        language: row.language || 'English',
        purchase_price: row.purchasePrice,
        collector_number: row.collectorNumber || null,
        color_identity: row.identities || null,
        types: row.types || null,
        edition_name: row.editionName || null,
        user_id: userId,
      }))

      const { error: insertError } = await supabase
        .from('collection')
        .insert(insertRows)

      if (insertError) {
        // Log the specific error with sample data for debugging
        const sampleNames = batch.slice(0, 3).map(r => r.name).join(', ')
        const errorDetail = `Batch ${i} (rows ${i * BATCH_SIZE}–${i * BATCH_SIZE + batch.length - 1}, e.g. ${sampleNames}): ${insertError.message} [code: ${insertError.code}]`
        batchErrors.push(errorDetail)
        errors.push(errorDetail)
        console.error(`[csv-import] ${errorDetail}`)
      } else {
        totalInserted += batch.length
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      batchErrors.push(`Batch ${i}: Unexpected error — ${message}`)
      errors.push(`Batch ${i}: Unexpected error — ${message}`)
    }

    batches.push({
      batchIndex: i,
      rowsProcessed: batchErrors.length === 0 ? batch.length : 0,
      errors: batchErrors,
    })
  }

  // Step 3: Update sync_meta with timestamp
  const now = new Date().toISOString()
  const { error: metaError } = await supabase
    .from('sync_meta')
    .upsert(
      { key: 'last_collection_import', value: now, updated_at: now },
      { onConflict: 'key' }
    )

  if (metaError) {
    errors.push(`sync_meta update failed: ${metaError.message}`)
  }

  return { totalInserted, batches, errors }
}
