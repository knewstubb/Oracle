/** Helpers for the import screens: progress stream reader and count wording. */

export interface ImportProgressEvent {
  phase: 'resolving' | 'writing'
  done: number
  total: number
}

/**
 * Read a server response that is either NDJSON progress events or one JSON
 * object. Returns the final summary; throws the server's message on `error`.
 */
export async function readImportResponse<T>(
  res: Response,
  onProgress: (event: ImportProgressEvent) => void
): Promise<T> {
  const type = res.headers?.get?.('content-type') ?? ''
  if (!type.includes('ndjson') || !res.body) {
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Import failed' }))
      throw new Error(body.error ?? 'Import failed')
    }
    return (await res.json()) as T
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let summary: T | undefined
  let failure: string | undefined

  const handle = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line)
    if (event.type === 'progress') onProgress(event as ImportProgressEvent)
    else if (event.type === 'complete') summary = event.summary as T
    else if (event.type === 'error') failure = event.message ?? 'Import failed'
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    lines.forEach(handle)
  }
  handle(buffer)

  if (failure) throw new Error(failure)
  if (!summary) throw new Error('Import ended before it finished')
  return summary
}

/** Rough count of cards in a file, for the "Processing N cards…" message. */
export function estimateFileCards(text: string): number {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  const first = lines[0] ?? ''
  const hasHeader = /Scryfall ID|Set code|Binder Name/i.test(first)
  return Math.max(0, lines.length - (hasHeader ? 1 : 0))
}

/** Count of cards in a deck file counting quantities (a 100-card deck says 100, not its unique lines). */
/** Splits one CSV line on commas that are not inside quotes. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted
    } else if (ch === ',' && !quoted) {
      cells.push(cell)
      cell = ''
    } else cell += ch
  }
  cells.push(cell)
  return cells
}

export function estimateFileCopies(text: string): number {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  const header = (lines[0] ? splitCsvLine(lines[0]) : []).map((c) => c.trim().replace(/^"|"$/g, '').toLowerCase()) ?? []
  const qtyCol = header.findIndex((c) => c === 'quantity' || c === 'count' || c === 'qty')
  if (qtyCol >= 0) {
    return lines.slice(1).reduce((sum, line) => sum + (parseInt(splitCsvLine(line)[qtyCol] ?? '', 10) || 1), 0)
  }
  return lines.reduce((sum, line) => sum + (/^\s*(\d+)x?\s/i.exec(line)?.[1] ? parseInt(/^\s*(\d+)/.exec(line)![1], 10) : 0), 0) || estimateFileCards(text)
}

export function copiesWord(n: number): string {
  return `${n} ${n === 1 ? 'copy' : 'copies'}`
}
