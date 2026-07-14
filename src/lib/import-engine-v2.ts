/**
 * Instance-Level Import Engine (v2)
 *
 * Replaces the original import-engine.ts for all new imports.
 * Creates individual physical_copies rows (one per card instance) instead
 * of the legacy printing-group model with quantity columns.
 *
 * Modes:
 *   - 'add': Pure append — each CSV row with quantity N inserts min(N, 100) rows
 *   - 'sync': Source-scoped upsert (implemented in task 7.5)
 *
 * Validates: Requirements 4.1, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9
 */

import { createAdminClient } from '@/lib/supabase'
import { detectSourceTag } from '@/lib/csv-normalizer'
import {
  resolveOracleIdFromPrinting,
  ensureOracleToPrintingMapping,
  batchResolveOracleIds,
  mapCondition,
  mapFinishToFoil,
} from '@/lib/identity-resolver'
import { ensureCardDefinition } from '@/lib/card-identity-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportEngineV2Options {
  csvContent: string
  mode: 'add' | 'sync'
  userId: string
  signal?: AbortSignal
}

export interface ImportSummaryV2 {
  inserted: number
  skipped: number
  removed: number       // sync mode only
  sourceTag: string
  errors: string[]
  durationMs: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum physical copies to create per CSV row (caps quantity) */
const MAX_COPIES_PER_ROW = 100

/** Batch size for bulk insert operations */
const INSERT_BATCH_SIZE = 500

/** Rate limit delay between Scryfall API calls (ms) */
const SCRYFALL_RATE_LIMIT_MS = 75

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ParsedImportRow {
  rowIndex: number
  name: string
  quantity: number
  scryfallId: string
  editionCode: string
  editionName: string
  collectorNumber: string
  finish: string
  condition: string
  isProxy: boolean
  oracleId: string  // Pre-resolved oracle_id (from CSV column like "Scryfall Oracle ID")
}

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a CSV line handling quoted fields.
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
 * Parse raw CSV content into rows for instance-level import.
 *
 * Unlike the v1 engine which requires strict Archidekt format,
 * this parser works with any format after detecting the source tag,
 * and extracts proxy signals from the raw (un-normalized) CSV.
 */
function parseCSVForInstanceImport(
  csvContent: string,
  sourceTag: string
): ParsedImportRow[] {
  const lines = csvContent.split('\n')
  const headerLine = lines[0]?.trim()
  if (!headerLine) return []

  const headers = parseCSVLine(headerLine)

  // Build column index map (case-sensitive)
  const colIdx: Record<string, number> = {}
  for (let i = 0; i < headers.length; i++) {
    colIdx[headers[i]] = i
  }

  const rows: ParsedImportRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (!line) continue

    const fields = parseCSVLine(line)

    // Extract fields based on source format
    const row = extractRowFields(fields, colIdx, sourceTag, i)
    if (row) {
      rows.push(row)
    }
  }

  return rows
}

/**
 * Extract row fields based on the detected source format.
 * Returns null if the row is invalid (no name).
 */
function extractRowFields(
  fields: string[],
  colIdx: Record<string, number>,
  sourceTag: string,
  rowIndex: number
): ParsedImportRow | null {
  switch (sourceTag) {
    case 'moxfield':
      return extractMoxfieldRow(fields, colIdx, rowIndex)
    case 'manabox':
      return extractManaboxRow(fields, colIdx, rowIndex)
    case 'archidekt':
      return extractArchidektRow(fields, colIdx, rowIndex)
    default:
      // Attempt archidekt-like extraction for 'manual' / unknown formats
      return extractArchidektRow(fields, colIdx, rowIndex)
  }
}

function extractArchidektRow(
  fields: string[],
  colIdx: Record<string, number>,
  rowIndex: number
): ParsedImportRow | null {
  const name = fields[colIdx['Name']] || ''
  if (!name) return null

  const rawQuantity = fields[colIdx['Quantity']] || '1'
  const quantity = parseInt(rawQuantity, 10)
  if (isNaN(quantity) || quantity < 1) return null

  return {
    rowIndex,
    name,
    quantity,
    scryfallId: fields[colIdx['Scryfall ID']] || '',
    editionCode: fields[colIdx['Edition Code']] || '',
    editionName: fields[colIdx['Edition Name']] || '',
    collectorNumber: fields[colIdx['Collector Number']] || '',
    finish: fields[colIdx['Finish']] || '',
    condition: fields[colIdx['Condition']] || '',
    isProxy: false, // Archidekt has no proxy column
    oracleId: fields[colIdx['Scryfall Oracle ID']] || '',
  }
}

function extractMoxfieldRow(
  fields: string[],
  colIdx: Record<string, number>,
  rowIndex: number
): ParsedImportRow | null {
  const name = fields[colIdx['Name']] || ''
  if (!name) return null

  const rawQuantity = fields[colIdx['Count']] || '1'
  const quantity = parseInt(rawQuantity, 10)
  if (isNaN(quantity) || quantity < 1) return null

  // Moxfield proxy signal: "Proxy" column with value "True" or "true"
  const proxyField = fields[colIdx['Proxy']] || ''
  const isProxy = proxyField.toLowerCase() === 'true'

  // Moxfield uses "Edition" for set code
  const editionCode = fields[colIdx['Edition']] || ''
  const collectorNumber = fields[colIdx['Collector Number']] || ''

  // Moxfield finish: "foil", "etched", "" → normalize later via mapFinishToFoil
  const rawFoil = (fields[colIdx['Foil']] || '').toLowerCase()
  let finish = 'Normal'
  if (rawFoil === 'foil') finish = 'Foil'
  else if (rawFoil === 'etched') finish = 'Etched'

  return {
    rowIndex,
    name,
    quantity,
    scryfallId: '', // Moxfield doesn't include Scryfall ID
    editionCode,
    editionName: '',
    collectorNumber,
    finish,
    condition: fields[colIdx['Condition']] || '',
    isProxy,
    oracleId: '',
  }
}

function extractManaboxRow(
  fields: string[],
  colIdx: Record<string, number>,
  rowIndex: number
): ParsedImportRow | null {
  const name = fields[colIdx['Name']] || ''
  if (!name) return null

  const rawQuantity = fields[colIdx['Quantity']] || '1'
  const quantity = parseInt(rawQuantity, 10)
  if (isNaN(quantity) || quantity < 1) return null

  // ManaBox proxy signal: check for "Misprint" or proxy-related columns
  // ManaBox uses a column that indicates proxy status
  const misprintField = fields[colIdx['Misprint']] || ''
  const isProxy = misprintField.toLowerCase() === 'true'

  const editionCode = fields[colIdx['Set code']] || ''
  const collectorNumber = fields[colIdx['Collector number']] || ''
  const scryfallId = fields[colIdx['Scryfall ID']] || ''

  // ManaBox foil field
  const rawFoil = (fields[colIdx['Foil']] || '').toLowerCase()
  let finish = 'Normal'
  if (rawFoil === 'foil') finish = 'Foil'
  else if (rawFoil === 'etched') finish = 'Etched'

  return {
    rowIndex,
    name,
    quantity,
    scryfallId,
    editionCode,
    editionName: fields[colIdx['Set name']] || '',
    collectorNumber,
    finish,
    condition: fields[colIdx['Condition']] || '',
    isProxy,
    oracleId: fields[colIdx['Scryfall Oracle ID']] || '',
  }
}

// ---------------------------------------------------------------------------
// Identity Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the oracle_id for a given row using Scryfall ID or set+collector lookup.
 *
 * Strategy:
 * 0. If row.oracleId is pre-populated (from CSV column) → use it directly, skip all API calls
 * 1. If scryfallId is present → query oracle_to_printings for oracle_id
 * 2. If no oracle_id found → call Scryfall API as fallback
 * 3. If no scryfallId → attempt Scryfall API lookup by set+collector
 *
 * Returns { cardDefinitionId, scryfallPrintingId } or null on failure.
 */
async function resolveRowIdentity(
  row: ParsedImportRow,
  userId: string
): Promise<{ cardDefinitionId: number; scryfallPrintingId: string } | null> {
  let scryfallPrintingId = row.scryfallId.trim()
  let oracleId: string | null = row.oracleId?.trim() || null

  // Strategy 0: Oracle ID pre-populated from CSV (e.g., Archidekt's "Scryfall Oracle ID" column)
  // Skip all API lookups — just ensure card_definition exists
  if (oracleId && scryfallPrintingId) {
    // Cache the mapping for future use (non-blocking)
    await ensureOracleToPrintingMapping(oracleId, scryfallPrintingId).catch(() => {})
    const cardDefinitionId = await ensureCardDefinition(oracleId, row.name, userId)
    return { cardDefinitionId, scryfallPrintingId }
  }

  // Strategy 1: Use Scryfall ID directly if available
  if (scryfallPrintingId && !oracleId) {
    oracleId = await resolveOracleIdFromPrinting(scryfallPrintingId).catch(() => null)

    if (!oracleId) {
      // Fallback: query Scryfall API for oracle_id from printing ID
      oracleId = await resolveOracleIdFromScryfallApi(scryfallPrintingId)
      if (oracleId) {
        // Cache the mapping
        await ensureOracleToPrintingMapping(oracleId, scryfallPrintingId).catch(() => {})
      }
    }
  }

  // Strategy 2: No Scryfall ID or oracle_id still unresolved — use set + collector
  if (!oracleId && row.editionCode && row.collectorNumber) {
    const result = await resolveFromSetCollector(row.editionCode, row.collectorNumber)
    if (result) {
      scryfallPrintingId = result.scryfallPrintingId
      oracleId = result.oracleId
      // Cache the mapping
      await ensureOracleToPrintingMapping(oracleId, scryfallPrintingId).catch(() => {})
    }
  }

  // If still no oracle_id, resolution failed
  if (!oracleId || !scryfallPrintingId) {
    return null
  }

  // Ensure card_definition exists
  const cardDefinitionId = await ensureCardDefinition(oracleId, row.name, userId)

  return { cardDefinitionId, scryfallPrintingId }
}

/**
 * Query Scryfall API to get oracle_id from a printing UUID.
 */
async function resolveOracleIdFromScryfallApi(
  scryfallPrintingId: string
): Promise<string | null> {
  await new Promise(resolve => setTimeout(resolve, SCRYFALL_RATE_LIMIT_MS))

  try {
    const response = await fetch(
      `https://api.scryfall.com/cards/${scryfallPrintingId}`,
      { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
    )
    if (!response.ok) return null
    const card = await response.json() as { oracle_id?: string }
    return card.oracle_id ?? null
  } catch {
    return null
  }
}

/**
 * Resolve a card's identity from set code + collector number via Scryfall API.
 */
async function resolveFromSetCollector(
  setCode: string,
  collectorNumber: string
): Promise<{ scryfallPrintingId: string; oracleId: string } | null> {
  await new Promise(resolve => setTimeout(resolve, SCRYFALL_RATE_LIMIT_MS))

  try {
    const response = await fetch(
      `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${collectorNumber}`,
      { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
    )
    if (!response.ok) return null
    const card = await response.json() as { id?: string; oracle_id?: string }
    if (!card.id || !card.oracle_id) return null
    return { scryfallPrintingId: card.id, oracleId: card.oracle_id }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Batch Insert Helper
// ---------------------------------------------------------------------------

/**
 * Chunk an array into batches of a given size.
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

// ---------------------------------------------------------------------------
// Sync Mode — Source-Scoped Upsert
// ---------------------------------------------------------------------------

/**
 * Represents a resolved CSV row ready for sync matching.
 */
interface ResolvedSyncRow {
  scryfallPrintingId: string
  cardDefinitionId: number
  isFoil: boolean
  isProxy: boolean
  condition: string
  quantity: number
}

/**
 * Execute sync mode: source-scoped upsert.
 *
 * Algorithm:
 * 1. Detect sourceTag from CSV headers
 * 2. Parse and resolve identity for each CSV row
 * 3. Fetch all existing physical_copies with same user_id + source_tag
 * 4. Match by scryfall_printing_id — determine inserts and removals
 * 5. Insert new instances (in CSV but not in DB for this source_tag)
 * 6. Remove instances no longer in CSV (in DB but not in CSV for this source_tag)
 * 7. Before removing assigned copies: unlink from deck_cards
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.9
 */
async function executeSyncMode(
  options: ImportEngineV2Options,
  startTime: number
): Promise<ImportSummaryV2> {
  // -------------------------------------------------------------------
  // Stage 1: Detect source tag from CSV headers
  // -------------------------------------------------------------------
  const firstLine = options.csvContent.split('\n')[0]?.trim() ?? ''
  const headers = parseCSVLine(firstLine)
  const sourceTag = detectSourceTag(headers)

  // -------------------------------------------------------------------
  // Stage 2: Parse CSV rows
  // -------------------------------------------------------------------
  const parsedRows = parseCSVForInstanceImport(options.csvContent, sourceTag)

  if (parsedRows.length === 0) {
    return {
      inserted: 0,
      skipped: 0,
      removed: 0,
      sourceTag,
      errors: ['No valid rows found in CSV'],
      durationMs: Date.now() - startTime,
    }
  }

  // -------------------------------------------------------------------
  // Stage 3: Resolve identity for each CSV row
  // -------------------------------------------------------------------
  let skipped = 0
  const errors: string[] = []
  const resolvedRows: ResolvedSyncRow[] = []

  for (const row of parsedRows) {
    if (options.signal?.aborted) {
      errors.push('Import aborted by user')
      break
    }

    let identity: { cardDefinitionId: number; scryfallPrintingId: string } | null = null
    try {
      identity = await resolveRowIdentity(row, options.userId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Row ${row.rowIndex} (${row.name}): identity resolution error — ${message}`)
      skipped++
      continue
    }

    if (!identity) {
      errors.push(
        `Row ${row.rowIndex} (${row.name}): identity resolution failed — ` +
        `set=${row.editionCode}, collector=${row.collectorNumber}, scryfall_id=${row.scryfallId}`
      )
      skipped++
      continue
    }

    const isFoil = mapFinishToFoil(row.finish)
    const { condition } = mapCondition(row.condition)

    resolvedRows.push({
      scryfallPrintingId: identity.scryfallPrintingId,
      cardDefinitionId: identity.cardDefinitionId,
      isFoil,
      isProxy: row.isProxy,
      condition,
      quantity: Math.min(row.quantity, MAX_COPIES_PER_ROW),
    })
  }

  // -------------------------------------------------------------------
  // Stage 4: Fetch existing physical_copies for this user + source_tag
  // -------------------------------------------------------------------
  const supabase = createAdminClient()

  // NOTE: source_tag was added in migration 007 but the generated supabase types
  // haven't been regenerated yet. Cast query to `any` to allow the extra column filter.
  const { data: existingCopies, error: fetchError } = await (supabase
    .from('physical_copies')
    .select('id, scryfall_printing_id, is_foil, is_proxy, condition, card_definition_id')
    .eq('user_id', options.userId) as any)
    .eq('source_tag', sourceTag)

  if (fetchError) {
    return {
      inserted: 0,
      skipped,
      removed: 0,
      sourceTag,
      errors: [...errors, `Failed to fetch existing copies: ${fetchError.message}`],
      durationMs: Date.now() - startTime,
    }
  }

  const existingRows = existingCopies ?? []

  // -------------------------------------------------------------------
  // Stage 5: Build match maps to determine inserts and removals
  //
  // Match key: scryfall_printing_id
  // For each printing, the CSV wants N copies and the DB has M copies.
  // - If N > M: insert (N - M) new rows
  // - If N < M: remove (M - N) rows
  // - If N == M: no change (skip)
  // -------------------------------------------------------------------

  // Build CSV demand map: scryfall_printing_id → total quantity wanted
  const csvDemandMap = new Map<string, ResolvedSyncRow & { totalQuantity: number }>()
  for (const row of resolvedRows) {
    const key = row.scryfallPrintingId
    const existing = csvDemandMap.get(key)
    if (existing) {
      existing.totalQuantity += row.quantity
    } else {
      csvDemandMap.set(key, { ...row, totalQuantity: row.quantity })
    }
  }

  // Build DB supply map: scryfall_printing_id → list of existing copy IDs
  const dbSupplyMap = new Map<string, number[]>()
  for (const copy of existingRows) {
    const key = copy.scryfall_printing_id ?? ''
    if (!key) continue
    const list = dbSupplyMap.get(key)
    if (list) {
      list.push(copy.id)
    } else {
      dbSupplyMap.set(key, [copy.id])
    }
  }

  // -------------------------------------------------------------------
  // Stage 6: Determine inserts and removals
  // -------------------------------------------------------------------

  // Rows to insert (in CSV but not enough in DB)
  const rowsToInsert: any[] = []
  for (const [printingId, demand] of csvDemandMap) {
    const dbCopies = dbSupplyMap.get(printingId) ?? []
    const deficit = demand.totalQuantity - dbCopies.length
    if (deficit > 0) {
      for (let i = 0; i < deficit; i++) {
        rowsToInsert.push({
          card_definition_id: demand.cardDefinitionId,
          scryfall_printing_id: printingId,
          is_foil: demand.isFoil,
          is_proxy: demand.isProxy,
          condition: demand.condition,
          source_tag: sourceTag,
          user_id: options.userId,
        })
      }
    }
  }

  // Copy IDs to remove (in DB but not enough in CSV, or not in CSV at all)
  const copyIdsToRemove: number[] = []
  for (const [printingId, dbCopyIds] of dbSupplyMap) {
    const demand = csvDemandMap.get(printingId)
    const wantedCount = demand?.totalQuantity ?? 0
    const surplus = dbCopyIds.length - wantedCount
    if (surplus > 0) {
      // Remove the excess copies (take from the end of the array)
      const toRemove = dbCopyIds.slice(dbCopyIds.length - surplus)
      copyIdsToRemove.push(...toRemove)
    }
  }

  // -------------------------------------------------------------------
  // Stage 7: Before removing assigned copies, unlink from deck_cards
  //
  // Requirement 4.3: If a physical copy to be removed is currently assigned
  // to a deck_cards row, set physical_copy_id = NULL and
  // ownership_status = NULL before deleting.
  // -------------------------------------------------------------------
  if (copyIdsToRemove.length > 0) {
    // Unlink any deck_cards rows that reference copies we're about to remove
    const { error: unlinkError } = await supabase
      .from('deck_cards')
      .update({
        physical_copy_id: null,
        ownership_status: null,
      })
      .in('physical_copy_id', copyIdsToRemove)

    if (unlinkError) {
      errors.push(`Warning: failed to unlink deck_cards before removal: ${unlinkError.message}`)
      // Continue with removal anyway — the FK constraint may prevent deletion
      // but we should try
    }
  }

  // -------------------------------------------------------------------
  // Stage 8: Delete physical copies that are no longer in the CSV
  // -------------------------------------------------------------------
  let removed = 0
  if (copyIdsToRemove.length > 0) {
    // Delete in batches to avoid hitting query size limits
    const deleteBatches = chunk(copyIdsToRemove, INSERT_BATCH_SIZE)
    for (const batch of deleteBatches) {
      const { error: deleteError, count } = await supabase
        .from('physical_copies')
        .delete()
        .in('id', batch)

      if (deleteError) {
        errors.push(`Failed to remove ${batch.length} copies: ${deleteError.message}`)
      } else {
        removed += count ?? batch.length
      }
    }
  }

  // -------------------------------------------------------------------
  // Stage 9: Insert new copies
  // -------------------------------------------------------------------
  let inserted = 0
  if (rowsToInsert.length > 0) {
    const insertBatches = chunk(rowsToInsert, INSERT_BATCH_SIZE)
    for (const batch of insertBatches) {
      const { error: insertError } = await supabase
        .from('physical_copies')
        .insert(batch)

      if (insertError) {
        errors.push(`Failed to insert ${batch.length} copies: ${insertError.message}`)
      } else {
        inserted += batch.length
      }
    }
  }

  // -------------------------------------------------------------------
  // Stage 10: Return summary
  // -------------------------------------------------------------------
  return {
    inserted,
    skipped,
    removed,
    sourceTag,
    errors,
    durationMs: Date.now() - startTime,
  }
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Execute instance-level import pipeline.
 *
 * Mode 'add': Pure append — each CSV row inserts min(quantity, 100) individual rows.
 * Mode 'sync': Source-scoped upsert — matches by source_tag + scryfall_printing_id.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9
 */
export async function executeInstanceLevelImport(
  options: ImportEngineV2Options
): Promise<ImportSummaryV2> {
  const startTime = Date.now()

  if (options.mode === 'sync') {
    return executeSyncMode(options, startTime)
  }

  // -------------------------------------------------------------------
  // Stage 1: Detect source tag from CSV headers
  // -------------------------------------------------------------------
  const firstLine = options.csvContent.split('\n')[0]?.trim() ?? ''
  const headers = parseCSVLine(firstLine)
  const sourceTag = detectSourceTag(headers)

  // -------------------------------------------------------------------
  // Stage 2: Parse CSV rows (format-aware, including proxy detection)
  // -------------------------------------------------------------------
  const parsedRows = parseCSVForInstanceImport(options.csvContent, sourceTag)

  if (parsedRows.length === 0) {
    return {
      inserted: 0,
      skipped: 0,
      removed: 0,
      sourceTag,
      errors: ['No valid rows found in CSV'],
      durationMs: Date.now() - startTime,
    }
  }

  // -------------------------------------------------------------------
  // Stage 3: Batch resolve identities (card_definitions + oracle mappings)
  //
  // Instead of per-row DB calls, we:
  // a) Collect all unique oracle_ids from CSV rows
  // b) Pre-fetch existing card_definitions in one query
  // c) Batch-insert missing card_definitions
  // d) Batch-upsert oracle_to_printings mappings
  // e) Build physical_copies insert payload
  // f) Bulk-insert physical_copies
  // -------------------------------------------------------------------
  const supabase = createAdminClient()
  const errors: string[] = []
  let skipped = 0

  // 3a: Collect unique oracle_ids and resolve rows that have oracle_id from CSV
  const resolvedRows: Array<{
    oracleId: string
    cardName: string
    scryfallPrintingId: string
    isFoil: boolean
    isProxy: boolean
    condition: string
    quantity: number
    editionCode: string
    editionName: string
  }> = []

  const needsApiResolution: ParsedImportRow[] = []
  const needsOracleIdOnly: ParsedImportRow[] = [] // Have scryfallId but no oracleId

  for (const row of parsedRows) {
    const oracleId = row.oracleId?.trim() || ''
    const scryfallId = row.scryfallId?.trim() || ''

    if (oracleId && scryfallId) {
      // Strategy 0: Both oracle_id and scryfall_id from CSV — no API needed
      const isFoil = mapFinishToFoil(row.finish)
      const { condition } = mapCondition(row.condition)
      resolvedRows.push({
        oracleId,
        cardName: row.name,
        scryfallPrintingId: scryfallId,
        isFoil,
        isProxy: row.isProxy,
        condition,
        quantity: Math.min(row.quantity, MAX_COPIES_PER_ROW),
        editionCode: row.editionCode,
        editionName: row.editionName,
      })
    } else if (scryfallId && !oracleId) {
      // Has scryfall_id but no oracle_id — can batch-resolve from oracle_to_printings
      needsOracleIdOnly.push(row)
    } else {
      // No scryfall_id at all — needs Scryfall API (sequential, rate-limited)
      needsApiResolution.push(row)
    }
  }

  // 3b: Batch-resolve oracle_ids for rows that have scryfallId but no oracleId
  if (needsOracleIdOnly.length > 0) {
    const printingIds = needsOracleIdOnly.map(r => r.scryfallId.trim())
    const oracleIdMap = await batchResolveOracleIds(printingIds)

    for (const row of needsOracleIdOnly) {
      const scryfallId = row.scryfallId.trim()
      const oracleId = oracleIdMap.get(scryfallId)
      if (oracleId) {
        const isFoil = mapFinishToFoil(row.finish)
        const { condition } = mapCondition(row.condition)
        resolvedRows.push({
          oracleId,
          cardName: row.name,
          scryfallPrintingId: scryfallId,
          isFoil,
          isProxy: row.isProxy,
          condition,
          quantity: Math.min(row.quantity, MAX_COPIES_PER_ROW),
          editionCode: row.editionCode,
          editionName: row.editionName,
        })
      } else {
        // Couldn't resolve via DB — fall through to API resolution
        needsApiResolution.push(row)
      }
    }
  }

  // 3c: Process remaining rows that need Scryfall API (sequential, rate-limited)
  // This should be very few rows (cards not in oracle_to_printings yet)
  for (const row of needsApiResolution) {
    if (options.signal?.aborted) {
      errors.push('Import aborted by user')
      break
    }

    let identity: { cardDefinitionId: number; scryfallPrintingId: string } | null = null
    try {
      identity = await resolveRowIdentity(row, options.userId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Row ${row.rowIndex} (${row.name}): identity resolution error — ${message}`)
      skipped++
      continue
    }

    if (!identity) {
      skipped++
      continue
    }

    const oracleId = await resolveOracleIdFromPrinting(identity.scryfallPrintingId).catch(() => null)
    if (!oracleId) {
      skipped++
      continue
    }

    const isFoil = mapFinishToFoil(row.finish)
    const { condition } = mapCondition(row.condition)
    resolvedRows.push({
      oracleId,
      cardName: row.name,
      scryfallPrintingId: identity.scryfallPrintingId,
      isFoil,
      isProxy: row.isProxy,
      condition,
      quantity: Math.min(row.quantity, MAX_COPIES_PER_ROW),
      editionCode: row.editionCode,
      editionName: row.editionName,
    })
  }

  // 3c: Pre-fetch ALL existing card_definitions for this user in one query
  const cardDefMap = new Map<string, number>() // oracle_id → card_definition_id
  const { data: existingDefs } = await supabase
    .from('card_definitions')
    .select('id, oracle_id')
    .eq('user_id', options.userId)

  for (const def of existingDefs ?? []) {
    cardDefMap.set(def.oracle_id, def.id)
  }

  // 3d: Collect unique oracle_ids that need card_definitions created
  const uniqueOracleIds = new Map<string, string>() // oracle_id → card_name
  for (const row of resolvedRows) {
    if (!uniqueOracleIds.has(row.oracleId)) {
      uniqueOracleIds.set(row.oracleId, row.cardName)
    }
  }

  const missingDefs = Array.from(uniqueOracleIds.entries())
    .filter(([oracleId]) => !cardDefMap.has(oracleId))
    .map(([oracleId, cardName]) => ({
      oracle_id: oracleId,
      card_name: cardName,
      user_id: options.userId,
    }))

  // 3e: Batch-insert missing card_definitions
  if (missingDefs.length > 0) {
    const defBatches = chunk(missingDefs, INSERT_BATCH_SIZE)
    for (const batch of defBatches) {
      const { data: inserted, error: defErr } = await supabase
        .from('card_definitions')
        .upsert(batch, { onConflict: 'oracle_id' })
        .select('id, oracle_id')

      if (defErr) {
        errors.push(`card_definitions upsert: ${defErr.message}`)
      } else {
        for (const row of inserted ?? []) {
          cardDefMap.set(row.oracle_id, row.id)
        }
      }
    }
  }

  // 3f: Batch-upsert oracle_to_printings mappings (non-fatal)
  const printingMappings = resolvedRows
    .filter(r => r.oracleId && r.scryfallPrintingId)
    .map(r => ({ oracle_id: r.oracleId, scryfall_printing_id: r.scryfallPrintingId }))

  // Deduplicate
  const mappingSet = new Map<string, { oracle_id: string; scryfall_printing_id: string }>()
  for (const m of printingMappings) {
    mappingSet.set(`${m.oracle_id}|${m.scryfall_printing_id}`, m)
  }
  const uniqueMappings = Array.from(mappingSet.values())

  if (uniqueMappings.length > 0) {
    // Fire-and-forget — these are just cache entries for future imports.
    // Don't await; the import result doesn't depend on them.
    const mappingBatches = chunk(uniqueMappings, INSERT_BATCH_SIZE)
    for (const batch of mappingBatches) {
      void supabase
        .from('oracle_to_printings')
        .upsert(batch, { onConflict: 'oracle_id,scryfall_printing_id' })
        .then(() => {}, () => {}) // Non-fatal, fire-and-forget
    }
  }

  // -------------------------------------------------------------------
  // Stage 4: Build physical_copies insert payload (one row per instance)
  // -------------------------------------------------------------------
  const physicalCopyRows: any[] = []

  for (const row of resolvedRows) {
    const cardDefId = cardDefMap.get(row.oracleId)
    if (!cardDefId) {
      skipped++
      continue
    }

    for (let i = 0; i < row.quantity; i++) {
      physicalCopyRows.push({
        card_definition_id: cardDefId,
        scryfall_printing_id: row.scryfallPrintingId,
        is_foil: row.isFoil,
        is_proxy: row.isProxy,
        condition: row.condition,
        source_tag: sourceTag,
        user_id: options.userId,
      })
    }
  }

  // -------------------------------------------------------------------
  // Stage 5: Bulk-insert physical_copies in batches
  // -------------------------------------------------------------------
  let inserted = 0
  if (physicalCopyRows.length > 0) {
    const insertBatches = chunk(physicalCopyRows, INSERT_BATCH_SIZE)
    for (const batch of insertBatches) {
      const { error: insertError } = await supabase
        .from('physical_copies')
        .insert(batch)

      if (insertError) {
        errors.push(`physical_copies insert (${batch.length} rows): ${insertError.message}`)
      } else {
        inserted += batch.length
      }
    }
  }

  // -------------------------------------------------------------------
  // Stage 5b: Populate collection table with set metadata (fire-and-forget)
  // The printings route uses collection as a lookup for set_code/edition_name.
  // Build unique (scryfall_id → set_code, edition_name) entries.
  // -------------------------------------------------------------------
  const setInfoEntries = new Map<string, { scryfall_id: string; set_code: string; edition_name: string; card_name: string }>()
  for (const row of resolvedRows) {
    if (row.scryfallPrintingId && !setInfoEntries.has(row.scryfallPrintingId)) {
      setInfoEntries.set(row.scryfallPrintingId, {
        scryfall_id: row.scryfallPrintingId,
        set_code: row.editionCode,
        edition_name: row.editionName,
        card_name: row.cardName,
      })
    }
  }

  if (setInfoEntries.size > 0) {
    const setInfoRows = Array.from(setInfoEntries.values()).map(e => ({
      scryfall_printing_id: e.scryfall_id,
      set_code: e.set_code,
      edition_name: e.edition_name,
    }))

    // Write to printing_set_info reference table (no RLS, no user_id)
    const setInfoBatches = chunk(setInfoRows, INSERT_BATCH_SIZE)
    for (const batch of setInfoBatches) {
      const { error: setErr } = await (supabase
        .from('printing_set_info' as any)
        .upsert(batch, { onConflict: 'scryfall_printing_id' }) as any)

      if (setErr) {
        errors.push(`printing_set_info upsert: ${setErr.message}`)
      }
    }
  }

  // -------------------------------------------------------------------
  // Stage 6: Build and return summary
  // -------------------------------------------------------------------
  return {
    inserted,
    skipped,
    removed: 0, // 'add' mode never removes
    sourceTag,
    errors,
    durationMs: Date.now() - startTime,
  }
}
