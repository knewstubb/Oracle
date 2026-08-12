/**
 * Identity resolver for CSV collection import.
 *
 * Resolves parsed CSV rows to printing identities using Supabase's
 * oracle_to_printings table for oracle_id lookups, with fallback to
 * Scryfall bulk data when available.
 *
 * Pure utility functions (condition/foil mapping) remain synchronous.
 * Identity resolution functions are async (Supabase queries).
 *
 * Requirements: 5.1, 5.5
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedCSVRow {
  rowIndex: number
  quantity: number
  name: string
  finish: string
  condition: string
  editionCode: string
  collectorNumber: string
  scryfallId: string
  scryfallOracleId: string
}

export interface ResolvedRow {
  rowIndex: number
  scryfallPrintingId: string
  oracleId: string
  cardName: string
  quantity: number
  isFoil: boolean
  condition: PhysicalCondition
}

export type PhysicalCondition =
  | 'near_mint'
  | 'lightly_played'
  | 'moderately_played'
  | 'heavily_played'
  | 'damaged'

export interface ResolutionResult {
  resolved: ResolvedRow[]
  unmatched: UnmatchedRowDetail[]
}

export interface UnmatchedRowDetail {
  rowIndex: number
  cardName: string
  editionCode: string
  collectorNumber: string
  quantity: number
  reason: UnmatchedReason
}

export type UnmatchedReason =
  | 'invalid_scryfall_id'
  | 'missing_fallback_fields'
  | 'no_bulk_data_match'
  | 'oracle_id_resolution_failed'
  | 'invalid_quantity'

// ---------------------------------------------------------------------------
// Condition mapping
// ---------------------------------------------------------------------------

/**
 * Normalize a string for condition matching: lowercase, strip whitespace,
 * replace underscores with spaces.
 */
function normalizeConditionInput(input: string): string {
  return input.trim().toLowerCase().replace(/_/g, ' ')
}

/** Canonical condition mappings (normalized key → PhysicalCondition) */
const CONDITION_MAP: Record<string, PhysicalCondition> = {
  'nm': 'near_mint',
  'near mint': 'near_mint',
  'near_mint': 'near_mint',
  'lp': 'lightly_played',
  'lightly played': 'lightly_played',
  'lightly_played': 'lightly_played',
  'mp': 'moderately_played',
  'moderately played': 'moderately_played',
  'moderately_played': 'moderately_played',
  'hp': 'heavily_played',
  'heavily played': 'heavily_played',
  'heavily_played': 'heavily_played',
  'd': 'damaged',
  'damaged': 'damaged',
}

/**
 * Map a CSV condition string to the physical_copies condition enum.
 * Case-insensitive, normalizes whitespace and underscores.
 * Returns 'near_mint' for unrecognized/empty values with wasUnrecognized = true.
 */
export function mapCondition(csvCondition: string): {
  condition: PhysicalCondition
  wasUnrecognized: boolean
} {
  const normalized = normalizeConditionInput(csvCondition)

  // Empty or whitespace-only → default near_mint with unrecognized flag
  if (normalized === '') {
    return { condition: 'near_mint', wasUnrecognized: true }
  }

  const mapped = CONDITION_MAP[normalized]
  if (mapped) {
    return { condition: mapped, wasUnrecognized: false }
  }

  // Unrecognized value → default near_mint with unrecognized flag
  return { condition: 'near_mint', wasUnrecognized: true }
}

// ---------------------------------------------------------------------------
// Finish-to-Foil mapping
// ---------------------------------------------------------------------------

/**
 * Map a CSV finish string to is_foil boolean.
 * "Normal" (exact, case-sensitive) → false.
 * Any other non-empty string → true.
 * Empty/whitespace-only → false.
 * 
 * @deprecated Use mapFinishToFinishString for new code — returns string instead of boolean
 */
export function mapFinishToFoil(finish: string): boolean {
  const trimmed = finish.trim()

  // Empty or whitespace-only → false
  if (trimmed === '') {
    return false
  }

  // Exact case-sensitive "Normal" → false
  if (trimmed === 'Normal') {
    return false
  }

  // Any other non-empty value → true
  return true
}

/**
 * Map a CSV finish string to the collection.finish column value.
 * Normalizes various CSV formats to: 'nonfoil' | 'foil' | 'etched'
 *
 * Mapping:
 *   - "Normal", "normal", "", empty → "nonfoil"
 *   - "Foil", "foil", "true", "yes" → "foil"
 *   - "Etched", "etched" → "etched"
 *   - Any other non-empty string → "foil" (fallback for unknown foil types)
 */
export function mapFinishToFinishString(finish: string): string {
  const trimmed = finish.trim().toLowerCase()

  // Empty or whitespace-only → nonfoil
  if (trimmed === '') {
    return 'nonfoil'
  }

  // Normal/non-foil variants
  if (trimmed === 'normal' || trimmed === 'non-foil' || trimmed === 'nonfoil' || trimmed === 'false' || trimmed === 'no') {
    return 'nonfoil'
  }

  // Etched
  if (trimmed === 'etched') {
    return 'etched'
  }

  // Any other non-empty value → foil (covers "foil", "true", "yes", unknown foil variants)
  return 'foil'
}

// ---------------------------------------------------------------------------
// Supabase-backed oracle_id resolution
// ---------------------------------------------------------------------------

/**
 * Look up an oracle_id for a given scryfall printing ID from the
 * ref_printings table in Supabase.
 *
 * Returns the oracle_id string, or null if no mapping exists.
 */
export async function resolveOracleIdFromPrinting(
  scryfallPrintingId: string
): Promise<string | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('ref_printings')
    .select('oracle_id')
    .eq('scryfall_id', scryfallPrintingId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `Failed to resolve oracle_id for printing ${scryfallPrintingId}: ${error.message}`
    )
  }

  return data?.oracle_id ?? null
}

/**
 * Look up all scryfall printing IDs for a given oracle_id from the
 * ref_printings table in Supabase.
 *
 * Returns an array of printing IDs, or empty array if none found.
 */
export async function resolvePrintingsForOracleId(
  oracleId: string
): Promise<string[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('ref_printings')
    .select('scryfall_id')
    .eq('oracle_id', oracleId)

  if (error) {
    throw new Error(
      `Failed to resolve printings for oracle_id ${oracleId}: ${error.message}`
    )
  }

  return (data ?? []).map((row) => row.scryfall_id)
}

/**
 * Resolve a user_cards entry from Supabase given an oracle_id.
 * Returns the card row, or null if not found.
 */
export async function resolveCardDefinitionByOracleId(
  oracleId: string
): Promise<{ id: number; cardName: string; oracleId: string } | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('user_cards')
    .select('id, oracle_id, card_name')
    .eq('oracle_id', oracleId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `Failed to resolve user_cards for oracle_id ${oracleId}: ${error.message}`
    )
  }

  if (!data) return null

  return {
    id: data.id,
    cardName: data.card_name,
    oracleId: data.oracle_id,
  }
}

/**
 * Resolve a user_cards entry from Supabase given a scryfall printing ID.
 * First resolves printing → oracle_id via ref_printings,
 * then looks up the user_cards by oracle_id.
 *
 * Returns the card row, or null if not found.
 */
export async function resolveCardDefinitionByPrintingId(
  scryfallPrintingId: string
): Promise<{ id: number; cardName: string; oracleId: string } | null> {
  const oracleId = await resolveOracleIdFromPrinting(scryfallPrintingId)
  if (!oracleId) return null

  return resolveCardDefinitionByOracleId(oracleId)
}

/**
 * Batch resolve oracle_ids for multiple scryfall printing IDs.
 * More efficient than calling resolveOracleIdFromPrinting in a loop.
 *
 * Returns a Map from scryfall_id → oracle_id.
 * Entries with no mapping are omitted from the result.
 */
export async function batchResolveOracleIds(
  scryfallPrintingIds: string[]
): Promise<Map<string, string>> {
  if (scryfallPrintingIds.length === 0) return new Map()

  const supabase = createAdminClient()
  const result = new Map<string, string>()

  // Process in chunks of 500 to stay within Supabase query limits
  const CHUNK_SIZE = 500
  for (let i = 0; i < scryfallPrintingIds.length; i += CHUNK_SIZE) {
    const chunk = scryfallPrintingIds.slice(i, i + CHUNK_SIZE)

    const { data, error } = await supabase
      .from('ref_printings')
      .select('oracle_id, scryfall_id')
      .in('scryfall_id', chunk)

    if (error) {
      throw new Error(
        `Failed to batch resolve oracle_ids: ${error.message}`
      )
    }

    for (const row of data ?? []) {
      if (row.oracle_id) {
        result.set(row.scryfall_id, row.oracle_id)
      }
    }
  }

  return result
}

/**
 * Ensure ref_printings has the mapping — no-op since ref_printings is read-only
 * and populated by sync jobs. This function is kept for API compatibility.
 */
export async function ensureOracleToPrintingMapping(
  _oracleId: string,
  _scryfallPrintingId: string
): Promise<void> {
  // No-op: ref_printings is populated by sync jobs, not runtime imports
}

// ---------------------------------------------------------------------------
// Identity resolution (async, Supabase-backed with optional bulk index fallback)
// ---------------------------------------------------------------------------

/**
 * Optional in-memory index for fallback resolution.
 * When provided, rows that can't be resolved via CSV oracle_id field
 * will use this index for set+collector lookups.
 */
export interface ScryfallBulkIndex {
  /** Map from scryfall_id (printing UUID) → printing record */
  byPrintingId: Map<string, ScryfallPrintingRecord>
  /** Map from "set_code|collector_number" → scryfall_id (first match) */
  bySetCollector: Map<string, string>
}

export interface ScryfallPrintingRecord {
  scryfallId: string
  oracleId: string
  cardName: string
  set: string
  collectorNumber: string
}

/**
 * Resolve an array of parsed CSV rows to identity records.
 *
 * Resolution strategy (async, Supabase-backed):
 * 1. If row has scryfallOracleId → use directly (no DB lookup needed for oracle_id)
 * 2. If row has scryfallId → look up oracle_id from oracle_to_printings table
 * 3. If bulkIndex provided → fallback to set+collector resolution
 * 4. Otherwise → mark as unmatched
 *
 * The scryfall_printing_id is determined from:
 * - row.scryfallId if non-empty
 * - bulkIndex.bySetCollector fallback if available
 */
export async function resolveIdentities(
  rows: ParsedCSVRow[],
  bulkIndex?: ScryfallBulkIndex
): Promise<ResolutionResult> {
  const resolved: ResolvedRow[] = []
  const unmatched: UnmatchedRowDetail[] = []

  // Batch pre-fetch oracle_ids for all rows that have scryfallId but no scryfallOracleId
  const printingIdsToLookup = rows
    .filter((r) => r.scryfallId.trim() !== '' && r.scryfallOracleId.trim() === '')
    .map((r) => r.scryfallId.trim())

  const oracleIdMap = printingIdsToLookup.length > 0
    ? await batchResolveOracleIds(printingIdsToLookup)
    : new Map<string, string>()

  for (const row of rows) {
    // Step 1: Validate quantity >= 1 (integer)
    if (!Number.isInteger(row.quantity) || row.quantity < 1) {
      unmatched.push({
        rowIndex: row.rowIndex,
        cardName: row.name,
        editionCode: row.editionCode,
        collectorNumber: row.collectorNumber,
        quantity: row.quantity,
        reason: 'invalid_quantity',
      })
      continue
    }

    // Step 2: Resolve printing ID
    const printingResult = resolvePrintingId(row, bulkIndex)
    if (!printingResult.success) {
      unmatched.push({
        rowIndex: row.rowIndex,
        cardName: row.name,
        editionCode: row.editionCode,
        collectorNumber: row.collectorNumber,
        quantity: row.quantity,
        reason: printingResult.reason,
      })
      continue
    }

    const scryfallPrintingId = printingResult.scryfallPrintingId

    // Step 3: Resolve oracle_id
    const oracleId = await resolveOracleIdForRow(row, scryfallPrintingId, oracleIdMap, bulkIndex)
    if (!oracleId) {
      unmatched.push({
        rowIndex: row.rowIndex,
        cardName: row.name,
        editionCode: row.editionCode,
        collectorNumber: row.collectorNumber,
        quantity: row.quantity,
        reason: 'oracle_id_resolution_failed',
      })
      continue
    }

    // Step 4: Map finish to isFoil
    const isFoil = mapFinishToFoil(row.finish)

    // Step 5: Map condition
    const { condition } = mapCondition(row.condition)

    resolved.push({
      rowIndex: row.rowIndex,
      scryfallPrintingId,
      oracleId,
      cardName: row.name,
      quantity: row.quantity,
      isFoil,
      condition,
    })
  }

  return { resolved, unmatched }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface PrintingResolutionSuccess {
  success: true
  scryfallPrintingId: string
}

interface PrintingResolutionFailure {
  success: false
  reason: UnmatchedReason
}

type PrintingResolutionResult = PrintingResolutionSuccess | PrintingResolutionFailure

/**
 * Resolve a CSV row to a scryfall_printing_id.
 *
 * Strategy:
 * 1. If scryfallId is non-empty, use it directly
 * 2. If scryfallId is empty, try fallback (editionCode + collectorNumber via bulkIndex)
 * 3. If fallback fields are empty/missing, mark unmatched with 'missing_fallback_fields'
 * 4. If fallback doesn't match, mark unmatched with 'no_bulk_data_match'
 */
function resolvePrintingId(
  row: ParsedCSVRow,
  bulkIndex?: ScryfallBulkIndex
): PrintingResolutionResult {
  const hasScryfallId = row.scryfallId.trim() !== ''

  if (hasScryfallId) {
    return { success: true, scryfallPrintingId: row.scryfallId.trim() }
  }

  // No Scryfall ID — try fallback via bulk index
  if (bulkIndex) {
    const fallbackResult = tryFallbackResolution(row, bulkIndex)
    if (fallbackResult) {
      return { success: true, scryfallPrintingId: fallbackResult }
    }
  }

  // Check if fallback fields were even present
  const hasEdition = row.editionCode.trim() !== ''
  const hasCollector = row.collectorNumber.trim() !== ''

  if (!hasEdition || !hasCollector) {
    return { success: false, reason: 'missing_fallback_fields' }
  }

  // Fallback fields present but no match found (or no bulk index)
  return { success: false, reason: 'no_bulk_data_match' }
}

/**
 * Attempt fallback resolution using editionCode + collectorNumber via bulk index.
 * Returns the scryfall_printing_id if found, null otherwise.
 */
function tryFallbackResolution(
  row: ParsedCSVRow,
  index: ScryfallBulkIndex
): string | null {
  const editionCode = row.editionCode.trim().toLowerCase()
  const collectorNumber = row.collectorNumber.trim()

  if (editionCode === '' || collectorNumber === '') {
    return null
  }

  const setCollectorKey = `${editionCode}|${collectorNumber}`
  return index.bySetCollector.get(setCollectorKey) ?? null
}

/**
 * Resolve oracle_id for a given row.
 *
 * Priority:
 * 1. CSV row's scryfallOracleId (if non-empty)
 * 2. Pre-fetched batch lookup from oracle_to_printings (oracleIdMap)
 * 3. Bulk index record's oracleId (if bulkIndex provided)
 * 4. Single lookup from Supabase oracle_to_printings (fallback)
 * 5. Scryfall API lookup (last resort, caches result in oracle_to_printings)
 *
 * Returns null if no source provides an oracle_id.
 */
async function resolveOracleIdForRow(
  row: ParsedCSVRow,
  scryfallPrintingId: string,
  oracleIdMap: Map<string, string>,
  bulkIndex?: ScryfallBulkIndex
): Promise<string | null> {
  // Priority 1: CSV row's Scryfall Oracle ID
  const csvOracleId = row.scryfallOracleId.trim()
  if (csvOracleId !== '') {
    return csvOracleId
  }

  // Priority 2: Pre-fetched batch lookup
  const batchResult = oracleIdMap.get(scryfallPrintingId)
  if (batchResult) {
    return batchResult
  }

  // Priority 3: Bulk index record (in-memory fallback)
  if (bulkIndex) {
    const record = bulkIndex.byPrintingId.get(scryfallPrintingId)
    if (record?.oracleId) {
      return record.oracleId
    }
  }

  // Priority 4: Single Supabase lookup (fallback for rows not in batch)
  try {
    const oracleId = await resolveOracleIdFromPrinting(scryfallPrintingId)
    if (oracleId) return oracleId
  } catch {
    // Non-fatal — continue to Priority 5
  }

  // Priority 5: Scryfall API lookup (last resort)
  try {
    const oracleId = await resolveOracleIdFromScryfallApi(scryfallPrintingId)
    if (oracleId) {
      // Cache the mapping for future imports
      await ensureOracleToPrintingMapping(oracleId, scryfallPrintingId)
      return oracleId
    }
  } catch {
    // Non-fatal — return null to mark as unmatched
  }

  return null
}

/**
 * Query the Scryfall API directly to resolve an oracle_id from a printing ID.
 * This is used as a last-resort fallback when the bulk index is unavailable
 * and the oracle_to_printings table doesn't have the mapping yet.
 *
 * Rate-limits: Scryfall asks for 50-100ms between requests.
 */
async function resolveOracleIdFromScryfallApi(
  scryfallPrintingId: string
): Promise<string | null> {
  // Rate limit: 75ms delay between Scryfall API calls
  await new Promise(resolve => setTimeout(resolve, 75))

  const response = await fetch(
    `https://api.scryfall.com/cards/${scryfallPrintingId}`,
    { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
  )

  if (!response.ok) return null

  const card = await response.json() as { oracle_id?: string }
  return card.oracle_id ?? null
}
