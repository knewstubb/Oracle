/**
 * Tests for chunked-import-client.ts
 *
 * These tests verify the client-side CSV chunking orchestration logic
 * including parsing, chunking, progress reporting, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  chunkedImport,
  type ChunkProgress,
} from './chunked-import-client'

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function buildCSV(rowCount: number): string {
  const header = 'Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types,Scryfall Oracle ID'
  const lines = [header]
  for (let i = 1; i <= rowCount; i++) {
    lines.push(
      `1,Card ${i},Normal,Near Mint,2024-01-01,English,0,,Test Set,tst,${i},scryfall-${i},${i},G,Creature,oracle-${i}`
    )
  }
  return lines.join('\n')
}

function makeStreamingResponse(inserted: number, totalCards = inserted, split = false) {
  const body = [
    JSON.stringify({
      type: 'progress',
      phase: 'resolving',
      processed: totalCards,
      total: totalCards,
      cardsProcessed: totalCards,
      totalCards,
    }),
    JSON.stringify({
      type: 'complete',
      summary: { inserted, removed: 0, skipped: 0, sourceTag: 'archidekt', errors: [], durationMs: 1 },
    }),
  ].join('\n')
  const encoded = new TextEncoder().encode(body)

  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        if (split) {
          const midpoint = Math.floor(encoded.length / 2)
          controller.enqueue(encoded.slice(0, midpoint))
          controller.enqueue(encoded.slice(midpoint))
        } else {
          controller.enqueue(encoded)
        }
        controller.close()
      },
    }),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chunkedImport', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty summary for empty CSV (header only)', async () => {
    const csvContent = 'Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types,Scryfall Oracle ID\n'

    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({ csvContent })

    expect(result.totalRows).toBe(0)
    expect(result.totalImported).toBe(0)
    expect(result.chunksTotal).toBe(0)
    expect(result.chunkResults).toHaveLength(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws on CSV with no header', async () => {
    await expect(
      chunkedImport({ csvContent: '' })
    ).rejects.toThrow('CSV is empty')
  })

  it('throws on CSV missing Name column', async () => {
    await expect(
      chunkedImport({ csvContent: 'Quantity,Finish\n1,Normal' })
    ).rejects.toThrow('CSV is missing a card name column')
  })

  it('sends a single chunk for small CSV (< 500 rows)', async () => {
    const csvContent = buildCSV(10)

    const mockFetch = vi.fn().mockResolvedValue(makeStreamingResponse(10))
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({ csvContent })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result.totalRows).toBe(10)
    expect(result.totalImported).toBe(10)
    expect(result.totalErrored).toBe(0)
    expect(result.chunksTotal).toBe(1)
    expect(result.chunksSucceeded).toBe(1)
    expect(result.chunksFailed).toBe(0)
  })

  it('splits into multiple chunks for large CSV', async () => {
    const csvContent = buildCSV(1200)

    const mockFetch = vi.fn().mockResolvedValue(makeStreamingResponse(1200))
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({ csvContent, chunkSize: 500 })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result.totalRows).toBe(1200)
    expect(result.totalImported).toBe(1200)
    expect(result.chunksTotal).toBe(1)
    expect(result.chunksSucceeded).toBe(1)
    expect(result.chunksFailed).toBe(0)
    expect(result.chunkResults[0].rowCount).toBe(1200)
  })

  it('reports progress after each chunk', async () => {
    const csvContent = buildCSV(1000)
    const progressUpdates: ChunkProgress[] = []

    const mockFetch = vi.fn().mockResolvedValue(makeStreamingResponse(1000))
    vi.stubGlobal('fetch', mockFetch)

    await chunkedImport({
      csvContent,
      chunkSize: 500,
      onProgress: (p) => progressUpdates.push({ ...p }),
    })

    expect(progressUpdates).toHaveLength(1)
    expect(progressUpdates[0]).toEqual({
      currentChunk: 0,
      totalChunks: 1,
      rowsProcessed: 1000,
      totalRows: 1000,
      chunkSuccess: true,
      phase: 'resolving',
      cardsProcessed: 1000,
      totalCards: 1000,
    })
  })

  it('handles per-chunk HTTP errors and continues', async () => {
    const csvContent = buildCSV(1000)

    const mockFetch = vi.fn()
      // First chunk succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ created: 500 }),
      })
      // Second chunk fails with HTTP 500
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ error: 'Database timeout' })),
      })
    vi.stubGlobal('fetch', mockFetch)

    await chunkedImport({
      csvContent,
      chunkSize: 500,
      apiUrl: '/api/custom-import',
    })
  })

  it('handles network errors per chunk and continues', async () => {
    const csvContent = buildCSV(1000)

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ created: 500 }),
      })
      .mockRejectedValueOnce(new Error('Network failure'))
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({
      csvContent,
      chunkSize: 500,
      apiUrl: '/api/custom-import',
    })

    expect(result.totalImported).toBe(500)
    expect(result.totalErrored).toBe(500)
    expect(result.chunkResults[1].error).toContain('Network failure')
  })

  it('sends CSV data with text/csv content type', async () => {
    const csvContent = buildCSV(5)

    const mockFetch = vi.fn().mockResolvedValue(makeStreamingResponse(5))
    vi.stubGlobal('fetch', mockFetch)

    await chunkedImport({ csvContent })

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/collection/import?mode=replace')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('text/csv')
    // Body should include the header + data lines
    expect(options.body).toContain('Quantity,Name,')
    expect(options.body).toContain('Card 1')
  })

  it('parses NDJSON progress when records are split across stream chunks', async () => {
    const progressUpdates: ChunkProgress[] = []
    const mockFetch = vi.fn().mockResolvedValue(makeStreamingResponse(2, 2, true))
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({
      csvContent: buildCSV(2),
      onProgress: (progress) => progressUpdates.push(progress),
    })

    expect(result.totalImported).toBe(2)
    expect(progressUpdates).toHaveLength(1)
    expect(progressUpdates[0].cardsProcessed).toBe(2)
    expect(mockFetch.mock.calls[0][1].headers.Accept).toBe('application/x-ndjson')
  })

  it('surfaces a streamed protocol error as an import failure', async () => {
    const errorLine = JSON.stringify({ type: 'error', message: 'Identity resolution failed' })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`${errorLine}\n`))
          controller.close()
        },
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({ csvContent: buildCSV(1) })

    expect(result.totalErrored).toBe(1)
    expect(result.chunkResults[0].error).toContain('Identity resolution failed')
  })

  it('rejects a streamed response that never reaches completion', async () => {
    const progressLine = JSON.stringify({
      type: 'progress',
      phase: 'resolving',
      processed: 1,
      total: 1,
      cardsProcessed: 1,
      totalCards: 1,
    })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`${progressLine}\n`))
          controller.close()
        },
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({ csvContent: buildCSV(1) })

    expect(result.totalErrored).toBe(1)
    expect(result.chunkResults[0].error).toContain('ended before completion')
  })

  it('uses custom API URL when provided', async () => {
    const csvContent = buildCSV(3)

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: 3 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await chunkedImport({ csvContent, apiUrl: '/api/custom-import' })

    expect(mockFetch.mock.calls[0][0]).toBe('/api/custom-import?chunk_index=0')
  })

  it('uses custom chunk size when provided', async () => {
    const csvContent = buildCSV(10)

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: 3 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({ csvContent, chunkSize: 3, apiUrl: '/api/custom-import' })

    // 10 rows / 3 per chunk = 4 chunks (3, 3, 3, 1)
    expect(mockFetch).toHaveBeenCalledTimes(4)
    expect(result.chunksTotal).toBe(4)
    expect(result.chunkResults[3].rowCount).toBe(1)
  })

  it('includes header in every chunk body', async () => {
    const csvContent = buildCSV(6)

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: 3 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await chunkedImport({ csvContent, chunkSize: 3, apiUrl: '/api/custom-import' })

    // Each chunk should start with the header row
    for (const [, options] of mockFetch.mock.calls) {
      expect(options.body.startsWith('Quantity,Name,')).toBe(true)
    }
  })

  it('handles abort signal cancellation', async () => {
    const csvContent = buildCSV(1500)
    const controller = new AbortController()

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ created: 500 }),
      })
      .mockImplementationOnce(() => {
        // Simulate abort during second chunk
        controller.abort()
        throw new DOMException('The operation was aborted.', 'AbortError')
      })
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({
      csvContent,
      chunkSize: 500,
      signal: controller.signal,
      apiUrl: '/api/custom-import',
    })

    // First chunk succeeded, second aborted, third should be marked as cancelled
    expect(result.chunksSucceeded).toBe(1)
    expect(result.chunksFailed).toBeGreaterThanOrEqual(1)
    expect(result.totalImported).toBe(500)
  })

  it('tracks duration in durationMs', async () => {
    const csvContent = buildCSV(5)

    const mockFetch = vi.fn().mockResolvedValue(makeStreamingResponse(5))
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({ csvContent })

    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(typeof result.durationMs).toBe('number')
  })

  it('handles CSV with quoted fields containing commas', async () => {
    const header = 'Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types,Scryfall Oracle ID'
    const csvContent = `${header}\n1,"Card, The Great",Normal,Near Mint,2024-01-01,English,0,,Test Set,tst,1,scryfall-1,1,G,Creature,oracle-1`

    const mockFetch = vi.fn().mockResolvedValue(makeStreamingResponse(1))
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({ csvContent })

    expect(result.totalRows).toBe(1)
    expect(result.totalImported).toBe(1)
    // The body should contain the original quoted CSV line
    expect(mockFetch.mock.calls[0][1].body).toContain('"Card, The Great"')
  })
})
