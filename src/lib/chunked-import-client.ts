/**
 * Chunked CSV Import — Client-Side Orchestration
 *
 * This module handles client-side CSV parsing and sequential chunk uploading
 * to the collection import API. It is designed for use in React components
 * (browser-only, no Node.js dependencies).
 *
 * Strategy:
 *   1. Parse CSV into rows using pure string processing (no Node.js APIs)
 *   2. Split rows into chunks of ~500
 *   3. POST each chunk sequentially to /api/collection/import
 *   4. Report progress via callback after each chunk
 *   5. Handle per-chunk errors (log, continue to next chunk)
 *   6. Return a summary with totals and per-chunk results
 *
 * Each chunk is processed as an independent server-side transaction,
 * so individual chunk failures are recoverable without losing prior progress.
 *
 * Validates: Requirements 6.3, 6.5
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of rows per chunk sent to the API */
const CHUNK_SIZE = 500

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Progress callback invoked after each chunk is processed */
export interface ChunkProgress {
  /** Current chunk index (0-based) */
  currentChunk: number
  /** Total number of chunks */
  totalChunks: number
  /** Total rows processed so far (including current chunk) */
  rowsProcessed: number
  /** Total rows to process */
  totalRows: number
  /** Whether the current chunk succeeded */
  chunkSuccess: boolean
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

  // Validate we have at least a Name column
  const headerFields = parseCSVLine(header)
  if (!headerFields.includes('Name')) {
    throw new Error('CSV is missing required "Name" column')
  }

  // Collect non-empty data lines
  const dataLines: string[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (line) {
      dataLines.push(line)
    }
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
    apiUrl = '/api/collection/import?mode=legacy&apply=true',
    chunkSize = CHUNK_SIZE,
    signal,
  } = options

  const startTime = Date.now()

  // Step 1: Parse CSV into header + data lines
  const { header, dataLines } = parseCSVRows(csvContent)
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
    }
  }

  // Step 2: Split into chunks
  const chunks = chunk(dataLines, chunkSize)
  const totalChunks = chunks.length

  // Step 3: Process each chunk sequentially
  const chunkResults: ChunkResult[] = []
  let totalImported = 0
  let totalErrored = 0
  let rowsProcessedSoFar = 0

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

    try {
      // For legacy mode: pass chunk_index so the server only clears on first chunk
      const urlWithChunk = apiUrl.includes('?')
        ? `${apiUrl}&chunk_index=${i}`
        : `${apiUrl}?chunk_index=${i}`
      const response = await fetch(urlWithChunk, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: chunkCSV,
        signal,
      })

      if (response.ok) {
        serverResponse = await response.json()
        chunkSuccess = true
        totalImported += chunkData.length
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

    // Report progress
    onProgress?.({
      currentChunk: i,
      totalChunks,
      rowsProcessed: rowsProcessedSoFar,
      totalRows,
      chunkSuccess,
    })
  }

  // Step 4: Build and return summary
  const chunksSucceeded = chunkResults.filter((r) => r.success).length
  const chunksFailed = chunkResults.filter((r) => !r.success).length

  return {
    totalRows,
    totalImported,
    totalErrored,
    chunksTotal: totalChunks,
    chunksSucceeded,
    chunksFailed,
    chunkResults,
    durationMs: Date.now() - startTime,
  }
}
