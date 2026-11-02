import { describe, it, expect } from 'vitest'
import { estimateFileCards, estimateFileCopies, readImportResponse } from './import-stream'

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

describe('estimateFileCopies', () => {
  it('ignores commas inside quoted card names', () => {
    expect(estimateFileCopies('Name,Set code,Collector number,Quantity\n"Kydele, Chosen of Kruphix",x,2962,1\nIsland,,,8\n')).toBe(9)
  })
  it('sums the Quantity column of a CSV', () => {
    expect(estimateFileCopies('Name,Quantity\nSol Ring,1\nIsland,9\n')).toBe(10)
  })
  it('sums leading quantities in a text list', () => {
    expect(estimateFileCopies('Commander\n1 Atraxa\n10 Island\n')).toBe(11)
  })
})
