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
import { assertAtomicRpcCount, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'
import type { Json } from '@/types/supabase'
import { mapCondition, mapFinishToFinishString } from './identity-resolver'

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
 * 
 * New schema: user_cards (oracle-level) + user_copies (individual copies)
 * Each copy is its own row, so we count copies per card_name|printing_id|finish
 */
export async function computeCollectionDelta(
  newRows: CollectionCSVRow[],
  userId?: string
): Promise<ImportDelta> {
  const supabase = createAdminClient()

  // Read current DB state by joining user_copies → user_cards for card_name.
  // Every API caller supplies the authenticated user so this read remains
  // tenant-scoped; the optional argument preserves the old unit-test helper
  // signature while those tests use an isolated mock client.
  let currentCopiesQuery = supabase
    .from('user_copies')
    .select(`
      id,
      printing_id,
      finish,
      user_cards!inner(card_name)
    `)

  if (userId) {
    currentCopiesQuery = currentCopiesQuery.eq('user_id', userId)
  }

  const { data: currentCopies, error } = await currentCopiesQuery

  if (error) {
    throw new Error(`Failed to read current collection: ${error.message}`)
  }

  // Build a map of current DB state keyed by name|printing_id|finish → count
  const currentMap = new Map<string, number>()
  for (const row of currentCopies ?? []) {
    const cardName = (row.user_cards as any)?.card_name || ''
    const key = `${cardName}|${row.printing_id || ''}|${row.finish || 'Normal'}`
    currentMap.set(key, (currentMap.get(key) ?? 0) + 1)
  }

  // Build a map of new rows
  const newMap = new Map<string, CollectionCSVRow>()
  for (const row of newRows) {
    const key = `${row.name}|${row.scryfallId || ''}|${row.finish}`
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
  const seenKeys = new Set<string>()
  for (const row of currentCopies ?? []) {
    const cardName = (row.user_cards as any)?.card_name || ''
    const key = `${cardName}|${row.printing_id || ''}|${row.finish || 'Normal'}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    
    if (!newMap.has(key)) {
      const qty = currentMap.get(key) ?? 1
      removed.push({
        quantity: qty,
        name: cardName,
        finish: (row.finish || 'Normal') as 'Normal' | 'Foil' | 'Etched',
        condition: '',
        dateAdded: '',
        language: '',
        purchasePrice: 0,
        tags: '',
        editionName: '',
        editionCode: '',
        multiverseId: '',
        scryfallId: row.printing_id || '',
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
    previousEntries: (currentCopies ?? []).length,
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
 * Apply the import — replace collection table contents.
 * 
 * New schema strategy:
 * 1. Delete all existing user_copies for the user
 * 2. Delete all existing user_cards for the user (orphaned after copies deleted)
 * 3. For each unique card, look up oracle_id from ref_printings and create user_cards entry
 * 4. For each copy (quantity), create individual user_copies rows
 * 5. Update sync_meta with timestamp
 *
 * Returns the result including total inserted count and per-batch status.
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

  if (!userId) {
    return { totalInserted: 0, batches: [], errors: ['No user ID provided'] }
  }

  // Step 1: The copy replacement is performed later, after the complete
  // payload is resolved. Keeping the read separate from the mutation means
  // the RPC can atomically clear affected deck links and insert every copy.

  // Step 2: Deduplicate rows — merge quantities for same (name, scryfallId, finish)
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

  // Step 3: Get unique card names and look up oracle_ids from ref_printings
  const uniqueCardNames = [...new Set(dedupedRows.map(r => r.name))]
  const oracleIdMap = new Map<string, string>()
  
  for (let i = 0; i < uniqueCardNames.length; i += 200) {
    const batch = uniqueCardNames.slice(i, i + 200)
    const { data: printings } = await supabase
      .from('ref_printings')
      .select('name, oracle_id')
      .in('name', batch)
    
    for (const p of printings ?? []) {
      if (p.oracle_id && !oracleIdMap.has(p.name)) {
        oracleIdMap.set(p.name, p.oracle_id)
      }
    }
  }

  // Step 4: Create user_cards entries (one per unique card name)
  const cardIdMap = new Map<string, number>() // card_name → user_cards.id
  const cardInsertBatches = chunk(uniqueCardNames, BATCH_SIZE)
  
  for (let i = 0; i < cardInsertBatches.length; i++) {
    const batch = cardInsertBatches[i]
    const insertRows = batch
      .filter(name => oracleIdMap.has(name))
      .map(name => ({
        card_name: name,
        oracle_id: oracleIdMap.get(name)!,
        user_id: userId,
      }))
    
    if (insertRows.length === 0) continue

    const { data: insertedCards, error: insertError } = await supabase
      .from('user_cards')
      .upsert(insertRows, { onConflict: 'oracle_id,user_id' })
      .select('id, card_name')

    if (insertError) {
      throw new Error(`user_cards upsert batch ${i} failed: ${insertError.message}`)
    }

    for (const card of insertedCards ?? []) {
      cardIdMap.set(card.card_name, card.id)
    }
  }

  // Step 5: Create user_copies entries (one per physical copy)
  // Expand quantity into individual rows
  const copyRows: Array<{ [key: string]: Json | undefined }> = []

  for (const row of dedupedRows) {
    const cardId = cardIdMap.get(row.name)
    if (!cardId) {
      // Card name not in ref_printings, skip
      errors.push(`Skipped "${row.name}": not found in ref_printings`)
      continue
    }

    const { condition } = mapCondition(row.condition)
    const finish = mapFinishToFinishString(row.finish)

    // Create one copy row per quantity. Null location_id means the RPC will
    // resolve the user's default storage location in the same transaction.
    for (let q = 0; q < row.quantity; q++) {
      copyRows.push({
        card_id: cardId,
        printing_id: row.scryfallId || null,
        finish,
        card_condition: condition,
        language: row.language?.trim().toLowerCase() || 'en',
        purchase_price: row.purchasePrice > 0 ? row.purchasePrice : null,
        acquired_at: row.dateAdded || null,
        source_tag: row.tags || 'legacy-csv',
        is_proxy: false,
        location_id: null,
      })
    }
  }

  // Step 5: Apply the copy mutation through one atomic RPC. Replacement uses
  // apply_collection_sync so slot links are cleared in the same transaction;
  // subsequent legacy chunks are append-only insert_user_copies calls.
  const copyIdsToRemove: number[] = []
  if (!options?.skipDelete) {
    let offset = 0
    while (true) {
      const { data: existingCopies, error: existingError } = await supabase
        .from('user_copies')
        .select('id')
        .eq('user_id', userId)
        .range(offset, offset + 999)

      if (existingError) {
        throw new Error(`Failed to read existing collection for replacement: ${existingError.message}`)
      }

      copyIdsToRemove.push(...(existingCopies ?? []).map(copy => copy.id))
      if (!existingCopies || existingCopies.length < 1000) break
      offset += 1000
    }
  }

  if (copyIdsToRemove.length > 0 || (!options?.skipDelete && copyRows.length > 0)) {
    const { data: mutationResult, error: mutationError } = options?.skipDelete
      ? await supabase.rpc('insert_user_copies', {
          p_user_id: userId,
          p_rows: copyRows,
        })
      : await supabase.rpc('apply_collection_sync', {
          p_user_id: userId,
          p_remove_copy_ids: copyIdsToRemove,
          p_insert_rows: copyRows,
        })

    if (mutationError) {
      throw new Error(`Atomic collection import failed: ${mutationError.message}`)
    }

    const result = assertAtomicRpcSuccess(mutationResult, options?.skipDelete ? 'insert_user_copies' : 'apply_collection_sync')
    totalInserted = assertAtomicRpcCount(
      result,
      'inserted_count',
      options?.skipDelete ? 'insert_user_copies' : 'apply_collection_sync',
      copyRows.length
    )
    if (!options?.skipDelete) {
      assertAtomicRpcCount(result, 'removed_count', 'apply_collection_sync', copyIdsToRemove.length)
    }

    batches.push({
      batchIndex: 0,
      rowsProcessed: totalInserted,
      errors: [],
    })
  } else if (copyRows.length > 0) {
    const { data: insertResult, error: insertError } = await supabase.rpc('insert_user_copies', {
      p_user_id: userId,
      p_rows: copyRows,
    })

    if (insertError) {
      throw new Error(`Atomic collection insert failed: ${insertError.message}`)
    }

    totalInserted = assertAtomicRpcCount(
      assertAtomicRpcSuccess(insertResult, 'insert_user_copies'),
      'inserted_count',
      'insert_user_copies',
      copyRows.length
    )

    batches.push({
      batchIndex: 0,
      rowsProcessed: totalInserted,
      errors: [],
    })
  }

  // Step 6: Update sync_meta with timestamp
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
