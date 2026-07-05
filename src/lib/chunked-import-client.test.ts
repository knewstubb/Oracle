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
  type ChunkedImportSummary,
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
    ).rejects.toThrow('CSV is missing required "Name" column')
  })

  it('sends a single chunk for small CSV (< 500 rows)', async () => {
    const csvContent = buildCSV(10)

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: 10 }),
    })
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

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: 500 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({ csvContent, chunkSize: 500 })

    // 1200 rows / 500 per chunk = 3 chunks (500, 500, 200)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(result.totalRows).toBe(1200)
    expect(result.totalImported).toBe(1200)
    expect(result.chunksTotal).toBe(3)
    expect(result.chunksSucceeded).toBe(3)
    expect(result.chunkResults[0].rowCount).toBe(500)
    expect(result.chunkResults[1].rowCount).toBe(500)
    expect(result.chunkResults[2].rowCount).toBe(200)
  })

  it('reports progress after each chunk', async () => {
    const csvContent = buildCSV(1000)
    const progressUpdates: ChunkProgress[] = []

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: 500 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await chunkedImport({
      csvContent,
      chunkSize: 500,
      onProgress: (p) => progressUpdates.push({ ...p }),
    })

    expect(progressUpdates).toHaveLength(2)
    expect(progressUpdates[0]).toEqual({
      currentChunk: 0,
      totalChunks: 2,
      rowsProcessed: 500,
      totalRows: 1000,
      chunkSuccess: true,
    })
    expect(progressUpdates[1]).toEqual({
      currentChunk: 1,
      totalChunks: 2,
      rowsProcessed: 1000,
      totalRows: 1000,
      chunkSuccess: true,
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

    const result = await chunkedImport({ csvContent, chunkSize: 500 })

    expect(result.totalImported).toBe(500)
    expect(result.totalErrored).toBe(500)
    expect(result.chunksSucceeded).toBe(1)
    expect(result.chunksFailed).toBe(1)
    expect(result.chunkResults[1].error).toContain('Database timeout')
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

    const result = await chunkedImport({ csvContent, chunkSize: 500 })

    expect(result.totalImported).toBe(500)
    expect(result.totalErrored).toBe(500)
    expect(result.chunkResults[1].error).toContain('Network failure')
  })

  it('sends CSV data with text/csv content type', async () => {
    const csvContent = buildCSV(5)

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: 5 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await chunkedImport({ csvContent })

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/collection/import')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('text/csv')
    // Body should include the header + data lines
    expect(options.body).toContain('Quantity,Name,')
    expect(options.body).toContain('Card 1')
  })

  it('uses custom API URL when provided', async () => {
    const csvContent = buildCSV(3)

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: 3 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await chunkedImport({ csvContent, apiUrl: '/api/custom-import' })

    expect(mockFetch.mock.calls[0][0]).toBe('/api/custom-import')
  })

  it('uses custom chunk size when provided', async () => {
    const csvContent = buildCSV(10)

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: 3 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({ csvContent, chunkSize: 3 })

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

    await chunkedImport({ csvContent, chunkSize: 3 })

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
    })

    // First chunk succeeded, second aborted, third should be marked as cancelled
    expect(result.chunksSucceeded).toBe(1)
    expect(result.chunksFailed).toBeGreaterThanOrEqual(1)
    expect(result.totalImported).toBe(500)
  })

  it('tracks duration in durationMs', async () => {
    const csvContent = buildCSV(5)

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: 5 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({ csvContent })

    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(typeof result.durationMs).toBe('number')
  })

  it('handles CSV with quoted fields containing commas', async () => {
    const header = 'Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types,Scryfall Oracle ID'
    const csvContent = `${header}\n1,"Card, The Great",Normal,Near Mint,2024-01-01,English,0,,Test Set,tst,1,scryfall-1,1,G,Creature,oracle-1`

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: 1 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await chunkedImport({ csvContent })

    expect(result.totalRows).toBe(1)
    expect(result.totalImported).toBe(1)
    // The body should contain the original quoted CSV line
    expect(mockFetch.mock.calls[0][1].body).toContain('"Card, The Great"')
  })
})
