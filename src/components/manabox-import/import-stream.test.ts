import { describe, it, expect } from 'vitest'
import { estimateFileCards, readImportResponse } from './import-stream'

describe('estimateFileCards', () => {
  it('skips the header and blank lines', () => {
    expect(estimateFileCards('Binder Name,Name\na,b\nc,d\n\n')).toBe(2)
    expect(estimateFileCards('1 Sol Ring (C21) 263\n2 Island (M21) 1\n')).toBe(2)
  })
})

describe('readImportResponse', () => {
  it('reports progress and returns the summary', async () => {
    const seen: number[] = []
    const body =
      JSON.stringify({ type: 'progress', phase: 'resolving', done: 3, total: 5 }) +
      '\n' +
      JSON.stringify({ type: 'complete', summary: { inserted: 5 } }) +
      '\n'
    const out = await readImportResponse<{ inserted: number }>(
      new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } }),
      (e) => seen.push(e.done)
    )
    expect(out.inserted).toBe(5)
    expect(seen).toEqual([3])
  })

  it('throws the server message on an error event', async () => {
    const body = JSON.stringify({ type: 'error', message: 'Import failed: boom' }) + '\n'
    await expect(
      readImportResponse(new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } }), () => {})
    ).rejects.toThrow('boom')
  })
})
