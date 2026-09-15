import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  executeInstanceLevelImport: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAuth: mocks.requireAuth,
}))

vi.mock('@/lib/import-engine-v2', () => ({
  executeInstanceLevelImport: mocks.executeInstanceLevelImport,
}))

import { POST } from './route'

function makeRequest(url = '/api/collection/import?mode=replace', body = 'Name,Quantity\nSol Ring,1') {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'POST',
    body,
    headers: { 'content-type': 'text/csv' },
  })
}

async function readNdjson(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text()
  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe('POST /api/collection/import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'test-user-123' })
    mocks.executeInstanceLevelImport.mockImplementation(async ({ onProgress }) => {
      await onProgress?.({
        phase: 'resolving',
        processed: 1,
        total: 1,
        cardsProcessed: 1,
        totalCards: 1,
      })
      return {
        inserted: 1,
        skipped: 0,
        removed: 1,
        sourceTag: 'archidekt',
        errors: [],
        durationMs: 10,
      }
    })
  })

  it('streams progress and a terminal completion event for replace mode', async () => {
    const response = await POST(makeRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')
    expect(response.headers.get('cache-control')).toContain('no-cache')

    const events = await readNdjson(response)
    expect(events).toEqual([
      {
        type: 'progress',
        phase: 'resolving',
        processed: 1,
        total: 1,
        cardsProcessed: 1,
        totalCards: 1,
      },
      {
        type: 'complete',
        summary: {
          inserted: 1,
          skipped: 0,
          removed: 1,
          sourceTag: 'archidekt',
          errors: [],
          durationMs: 10,
          replaced: true,
        },
      },
    ])

    expect(mocks.executeInstanceLevelImport).toHaveBeenCalledWith(
      expect.objectContaining({
        csvContent: 'Name,Quantity\nSol Ring,1',
        mode: 'replace',
        userId: 'test-user-123',
        onProgress: expect.any(Function),
      })
    )
  })

  it('streams engine failures as an error event', async () => {
    mocks.executeInstanceLevelImport.mockRejectedValueOnce(new Error('Database timeout'))

    const response = await POST(makeRequest())
    const events = await readNdjson(response)

    expect(response.status).toBe(200)
    expect(events).toEqual([
      {
        type: 'error',
        message: 'Database timeout',
        isCsvParseError: false,
      },
    ])
  })

  it('returns a normal HTTP error before starting a stream for an empty body', async () => {
    const response = await POST(makeRequest('/api/collection/import?mode=replace', ''))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'No CSV content provided' })
    expect(mocks.executeInstanceLevelImport).not.toHaveBeenCalled()
  })

  it('keeps add mode as a normal JSON response', async () => {
    mocks.executeInstanceLevelImport.mockResolvedValueOnce({
      inserted: 1,
      skipped: 0,
      removed: 0,
      sourceTag: 'archidekt',
      errors: [],
      durationMs: 4,
    })

    const response = await POST(makeRequest('/api/collection/import?mode=add'))

    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toMatchObject({ inserted: 1, sourceTag: 'archidekt' })
  })
})
