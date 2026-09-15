/**
 * Chunked CSV Import — Client-Side Orchestration
 *
 * This module handles client-side CSV parsing and sequential chunk uploading
 * to the collection import API. It is designed for use in React components
 * (browser-only, no Node.js dependencies).
 *
 * Strategy:
 *   1. Detect CSV format (Archidekt, Moxfield, etc.) and normalize to Archidekt format
 *   2. Parse CSV into rows using pure string processing (no Node.js APIs)
 *   3. Send the complete normalized CSV in one request for the default full-import path
 *   4. Split and POST chunks sequentially only for append-only or custom endpoints
 *   5. Report progress via callback after each request
 *   6. Return a summary with totals and per-request results
 *
 * The default full-import request must remain one server-side transaction. It
 * is intentionally not split into an independent replace request followed by
 * add requests, which could leave a partial collection after interruption.
 *
 * Validates: Requirements 6.3, 6.5
 */

import { normalizeCSV, type NormalizationResult } from './csv-normalizer'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of rows per chunk sent to the API */
const CHUNK_SIZE = 500

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportProgressPhase =
  | 'validating'
  | 'resolving'
  | 'preparing'
  | 'replacing'
  | 'complete'
  | 'error'

/** Progress callback invoked after each chunk or streamed progress event */
export interface ChunkProgress {
  /** Current chunk index (0-based) */
  currentChunk: number
  /** Total number of chunks */
  totalChunks: number
  /** Total source rows processed so far */
  rowsProcessed: number
  /** Total source rows to process */
  totalRows: number
  /** Whether the current chunk succeeded */
  chunkSuccess: boolean
  /** Current server-side import phase, when available */
  phase?: ImportProgressPhase
  /** Physical cards processed so far, when available */
  cardsProcessed?: number
  /** Total physical cards to import, when available */
  totalCards?: number
  /** Human-readable phase detail, when available */
  message?: string
}

/** Result of a single chunk upload */
export interface ChunkResult {
  /** Chunk index (0-based) */
  chunkIndex: number
  /** Number of rows in this chunk */
  rowCount: number
  /** Whether the chunk was processed successfully */
  success: boolean
  /** Error message if the chunk failed */
  error?: string
  /** Server response data (if successful) */
  serverResponse?: unknown
}

/** Final summary returned after all chunks are processed */
export interface ChunkedImportSummary {
  /** Total rows parsed from the CSV */
  totalRows: number
  /** Total physical cards represented by the CSV, when known */
  totalCards?: number
  /** Total rows successfully imported (from successful chunks) */
  totalImported: number
  /** Total rows that errored (from failed chunks) */
  totalErrored: number
  /** Number of chunks processed */
  chunksTotal: number
  /** Number of chunks that succeeded */
  chunksSucceeded: number
  /** Number of chunks that failed */
  chunksFailed: number
  /** Per-chunk results */
  chunkResults: ChunkResult[]
  /** Total duration in milliseconds */
  durationMs: number
  /** CSV format normalization info (if normalization was applied) */
  normalization?: {
    detectedFormat: string
    filteredRows: number
    warnings: string[]
  }
}

/** Options for the chunked import */
export interface ChunkedImportOptions {
  /** Raw CSV string content */
  csvContent: string
  /** Progress callback (optional) */
  onProgress?: (progress: ChunkProgress) => void
  /** API endpoint URL (defaults to /api/collection/import) */
  apiUrl?: string
  /** Chunk size override (defaults to 500) */
  chunkSize?: number
  /** AbortSignal for cancellation support */
  signal?: AbortSignal
  /** If true, adds to existing collection without deleting (all chunks use skipDelete) */
  addOnly?: boolean
}

// ---------------------------------------------------------------------------
// CSV Parsing (Client-Side, Pure String Processing)
// ---------------------------------------------------------------------------

/**
 * Parse a single CSV line handling quoted fields (commas inside quotes).
 * Pure string processing — no Node.js APIs.
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
 * Parse CSV content into an array of raw string arrays (header + data rows).
 * Returns the header row separately from the data rows.
 *
 * This is a lightweight client-side parse that preserves all fields as strings.
 * The server-side import engine handles type conversion and validation.
 */
function parseCSVRows(csvContent: string): { header: string; dataLines: string[] } {
  const lines = csvContent.split('\n')
  const header = lines[0]?.trim() ?? ''

  if (!header) {
    throw new Error('CSV is empty — no header row found')
  }

  // Validate we have a name column — check common aliases (case-insensitive)
  const headerFields = parseCSVLine(header)
  const nameAliases = ['name', 'card name', 'card_name', 'cardname', 'card']
  const hasNameColumn = headerFields.some(h => nameAliases.includes(h.toLowerCase().trim()))
  if (!hasNameColumn) {
    throw new Error('CSV is missing a card name column (expected: "Name", "Card Name", or similar)')
  }

  // Collect non-empty data lines
  const dataLines: string[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (line) {
      dataLines.push(line)
    }
  }

  // Deduplicate: merge rows with same (Name, Scryfall ID, Finish, Edition Code, Collector Number)
  // by summing their quantities
  const hdrFields = parseCSVLine(header)
  const nameIdx = hdrFields.indexOf('Name') >= 0 ? hdrFields.indexOf('Name') : hdrFields.indexOf('Card Name')
  const qtyIdx = hdrFields.indexOf('Quantity')
  const finishIdx = hdrFields.indexOf('Finish')
  const scryfallIdx = hdrFields.indexOf('Scryfall ID')
  const edCodeIdx = hdrFields.indexOf('Edition Code')
  const collNumIdx = hdrFields.indexOf('Collector Number')

  // Skip dedup for large CSVs to avoid hanging — the server handles duplicates
  if (nameIdx >= 0 && qtyIdx >= 0 && scryfallIdx >= 0 && dataLines.length <= 500) {
    const deduped = new Map<string, { fields: string[]; qty: number }>()

    for (const line of dataLines) {
      const fields = parseCSVLine(line)
      const key = [
        fields[nameIdx] || '',
        fields[scryfallIdx] || '',
        fields[finishIdx] || '',
        fields[edCodeIdx] || '',
        fields[collNumIdx] || '',
      ].join('||')

      const existing = deduped.get(key)
      const qty = parseInt(fields[qtyIdx] || '1', 10) || 1

      if (existing) {
        existing.qty += qty
      } else {
        deduped.set(key, { fields, qty })
      }
    }

    // Rebuild deduplicated data lines with merged quantities
    const dedupedLines: string[] = []
    for (const { fields, qty } of deduped.values()) {
      fields[qtyIdx] = String(qty)
      // Rebuild the CSV line (quote fields containing commas)
      dedupedLines.push(fields.map(f => f.includes(',') ? `"${f}"` : f).join(','))
    }

    return { header, dataLines: dedupedLines }
  }

  return { header, dataLines }
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

/**
 * Reassemble a chunk of data lines back into a CSV string with the header.
 */
function reassembleCSVChunk(header: string, dataLines: string[]): string {
  return [header, ...dataLines].join('\n')
}

interface StreamingProgressEvent {
  type: 'progress'
  phase: ImportProgressPhase
  processed: number
  total: number
  cardsProcessed: number
  totalCards: number
}

interface StreamingCompleteEvent {
  type: 'complete'
  summary: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseStreamingEvent(line: string): StreamingProgressEvent | StreamingCompleteEvent {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new Error('Collection import returned malformed progress data')
  }

  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('Collection import returned an invalid progress event')
  }

  if (value.type === 'progress') {
    if (
      typeof value.phase !== 'string' ||
      !Number.isInteger(value.processed) ||
      !Number.isInteger(value.total) ||
      !Number.isInteger(value.cardsProcessed) ||
      !Number.isInteger(value.totalCards)
    ) {
      throw new Error('Collection import returned an invalid progress event')
    }

    return value as unknown as StreamingProgressEvent
  }

  if (value.type === 'complete' && isRecord(value.summary)) {
    return value as unknown as StreamingCompleteEvent
  }

  if (value.type === 'error') {
    const message = typeof value.message === 'string' ? value.message : 'Collection import failed'
    throw new Error(message)
  }

  throw new Error('Collection import returned an unknown progress event')
}

async function readStreamingImportResponse(
  response: Response,
  onProgress: (event: StreamingProgressEvent) => void
): Promise<Record<string, unknown>> {
  if (!response.body) {
    throw new Error('Collection import returned an empty progress stream')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completeEvent: StreamingCompleteEvent | null = null

  const consumeLine = (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (!line.trim()) return

    const event = parseStreamingEvent(line)
    if (event.type === 'progress') {
      onProgress(event)
    } else {
      completeEvent = event
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })

    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      consumeLine(buffer.slice(0, newlineIndex))
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
    }

    if (done) break
  }

  if (buffer.trim()) consumeLine(buffer)
  const terminalEvent = completeEvent
  if (!terminalEvent) {
    throw new Error('Collection import progress stream ended before completion')
  }

  return (completeEvent as unknown as StreamingCompleteEvent).summary
}

// ---------------------------------------------------------------------------
// Main Export: Chunked Import Orchestrator
// ---------------------------------------------------------------------------

/**
 * Orchestrate a chunked CSV collection import from the client side.
 *
 * Parses the CSV, splits into ~500 row chunks, and POSTs each chunk
 * sequentially to the import API endpoint. Reports progress after each
 * chunk and handles per-chunk errors without aborting the entire import.
 *
 * @param options - Import configuration including CSV content and callbacks
 * @returns Summary of the import with per-chunk results
 *
 * @example
 * ```tsx
 * const summary = await chunkedImport({
 *   csvContent: fileText,
 *   onProgress: ({ currentChunk, totalChunks, rowsProcessed }) => {
 *     setProgress(`Chunk ${currentChunk + 1}/${totalChunks} (${rowsProcessed} rows)`)
 *   },
 * })
 * ```
 */
export async function chunkedImport(
  options: ChunkedImportOptions
): Promise<ChunkedImportSummary> {
  const {
    csvContent,
    onProgress,
    apiUrl: userApiUrl,
    chunkSize = CHUNK_SIZE,
    signal,
    addOnly = false,
  } = options

  // Default mode: 'replace' for chunk 0 of full import (wipes existing then adds),
  // 'add' for subsequent chunks and for addOnly mode.
  // The legacy 'upsert' mode is broken (doesn't pass userId to the V1 engine).
  const baseApiUrl = userApiUrl ?? '/api/collection/import'

  const startTime = Date.now()

  // Step 0: Detect format and normalize to Archidekt canonical CSV format
  const normResult: NormalizationResult = normalizeCSV(csvContent)
  const normalizedCSV = normResult.csvContent

  // Step 1: Parse normalized CSV into header + data lines
  const { header, dataLines } = parseCSVRows(normalizedCSV)
  const totalRows = dataLines.length

  if (totalRows === 0) {
    return {
      totalRows: 0,
      totalImported: 0,
      totalErrored: 0,
      chunksTotal: 0,
      chunksSucceeded: 0,
      chunksFailed: 0,
      chunkResults: [],
      durationMs: Date.now() - startTime,
      normalization: {
        detectedFormat: normResult.format,
        filteredRows: normResult.filteredCount,
        warnings: normResult.warnings,
      },
    }
  }

  // Full replacement must reach the server as one complete CSV so the
  // server-side apply_collection_sync call can be all-or-nothing. Append-only
  // and custom endpoint imports retain chunking for request-size/timeout needs.
  const shouldUseChunks = addOnly || Boolean(userApiUrl)
  const chunks = shouldUseChunks ? chunk(dataLines, chunkSize) : [dataLines]
  const totalChunks = chunks.length

  // Step 3: Process each request sequentially
  const chunkResults: ChunkResult[] = []
  let totalImported = 0
  let totalErrored = 0
  let rowsProcessedSoFar = 0
  let totalCardsFromStream: number | undefined


  for (let i = 0; i < chunks.length; i++) {
    // Check for cancellation
    if (signal?.aborted) {
      // Mark remaining chunks as errored
      for (let j = i; j < chunks.length; j++) {
        chunkResults.push({
          chunkIndex: j,
          rowCount: chunks[j].length,
          success: false,
          error: 'Import cancelled',
        })
        totalErrored += chunks[j].length
      }
      break
    }

    const chunkData = chunks[i]
    const chunkCSV = reassembleCSVChunk(header, chunkData)
    let chunkSuccess = false
    let chunkError: string | undefined
    let serverResponse: unknown
    const isStreamingReplace = !shouldUseChunks && !userApiUrl && !addOnly

    try {
      // Determine mode for this chunk:
      // - addOnly=true: always 'add' (pure append)
      // - addOnly=false, chunk 0: 'replace' (wipe existing then add)
      // - addOnly=false, chunk 1+: 'add' (append to what chunk 0 started)
      let chunkUrl: string
      if (userApiUrl) {
        // If the user provided a custom URL, use their chunk_index logic
        const effectiveIndex = addOnly ? i + 1 : i
        chunkUrl = userApiUrl.includes('?')
          ? `${userApiUrl}&chunk_index=${effectiveIndex}`
          : `${userApiUrl}?chunk_index=${effectiveIndex}`
      } else if (addOnly) {
        chunkUrl = `${baseApiUrl}?mode=add`
      } else if (i === 0) {
        chunkUrl = `${baseApiUrl}?mode=replace`
      } else {
        chunkUrl = `${baseApiUrl}?mode=add`
      }

      const response = await fetch(chunkUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/csv',
          ...(isStreamingReplace ? { Accept: 'application/x-ndjson' } : {}),
        },
        body: chunkCSV,
        signal,
      })

      if (response.ok) {
        if (isStreamingReplace) {
          serverResponse = await readStreamingImportResponse(response, (event) => {
            onProgress?.({
              currentChunk: i,
              totalChunks,
              rowsProcessed: event.processed,
              totalRows: event.total,
              chunkSuccess: true,
              phase: event.phase,
              cardsProcessed: event.cardsProcessed,
              totalCards: event.totalCards,
            })
            totalCardsFromStream = event.totalCards
          })
        } else {
          serverResponse = await response.json()
        }
        chunkSuccess = true
        if (
          isStreamingReplace &&
          isRecord(serverResponse) &&
          Number.isInteger(serverResponse.inserted)
        ) {
          totalImported += serverResponse.inserted as number
        } else {
          totalImported += chunkData.length
        }
      } else {
        const errorBody = await response.text()
        let errorMessage: string
        try {
          const parsed = JSON.parse(errorBody)
          errorMessage = parsed.error || `HTTP ${response.status}`
        } catch {
          errorMessage = errorBody || `HTTP ${response.status}`
        }
        chunkError = `Chunk ${i}: ${errorMessage}`
        totalErrored += chunkData.length
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        chunkError = 'Import cancelled'
      } else {
        chunkError = `Chunk ${i}: ${err instanceof Error ? err.message : String(err)}`
      }
      totalErrored += chunkData.length
    }

    rowsProcessedSoFar += chunkData.length

    chunkResults.push({
      chunkIndex: i,
      rowCount: chunkData.length,
      success: chunkSuccess,
      error: chunkError,
      serverResponse: chunkSuccess ? serverResponse : undefined,
    })

    // Report progress for chunked paths. The streaming replace path already
    // reported server-side progress and must not overwrite its final phase.
    if (!isStreamingReplace || !chunkSuccess) {
      onProgress?.({
        currentChunk: i,
        totalChunks,
        rowsProcessed: rowsProcessedSoFar,
        totalRows,
        chunkSuccess,
      })
    }
  }

  // Step 4: Build and return summary
  const chunksSucceeded = chunkResults.filter((r) => r.success).length
  const chunksFailed = chunkResults.filter((r) => !r.success).length

  return {
    totalRows,
    totalCards: totalCardsFromStream,
    totalImported,
    totalErrored,
    chunksTotal: totalChunks,
    chunksSucceeded,
    chunksFailed,
    chunkResults,
    durationMs: Date.now() - startTime,
    normalization: {
      detectedFormat: normResult.format,
      filteredRows: normResult.filteredCount,
      warnings: normResult.warnings,
    },
  }
}
