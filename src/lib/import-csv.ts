// ---------------------------------------------------------------------------
// Shared CSV reader and header alias table (import-formats contract §3.2, E-9..E-12; T-60 S-3).
//
// One reader for every site's CSV: RFC 4180 across lines (quoted newlines), delimiter detection
// (`,` `;` tab), BOM strip, and a header alias table instead of per-site code.
// ---------------------------------------------------------------------------

import { classifyHeading } from '@/lib/import-text-parser'
import type { ImportBoard } from '../../docs/oracle/contracts/manabox-import.types'

export type CsvDelimiter = ',' | ';' | '\t'

export interface CsvRecordRaw {
  cells: string[]
  /** 1-based physical line number the record starts on (the header is the first line). */
  line: number
  /** The record exactly as written (may span lines when a quoted cell holds a newline). */
  raw: string
}

export interface CsvTable {
  delimiter: CsvDelimiter
  headers: string[]
  records: CsvRecordRaw[]
}

/** Strip a BOM and normalise nothing else; newlines inside quotes must survive. */
function stripBom(content: string): string {
  return content.replace(/^\uFEFF/, '')
}

/** Pick the delimiter from the header line: the one that appears most outside quotes. */
export function detectDelimiter(headerLine: string): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (const char of headerLine) {
    if (char === '"') inQuotes = !inQuotes
    else if (!inQuotes && char in counts) counts[char as CsvDelimiter]++
  }
  let best: CsvDelimiter = ','
  for (const d of [';', '\t'] as CsvDelimiter[]) {
    if (counts[d] > counts[best]) best = d
  }
  return best
}

/**
 * Read CSV text into records. Quotes are honoured across lines ("a\nb" stays one cell, "" is a
 * literal quote). Blank lines are skipped but still counted so line numbers stay physical.
 */
export function readCsv(content: string): CsvTable {
  const text = stripBom(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const firstLineEnd = text.indexOf('\n')
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd)
  const delimiter = detectDelimiter(firstLine)

  const all: CsvRecordRaw[] = []
  let cells: string[] = []
  let current = ''
  let inQuotes = false
  let line = 1
  let recordLine = 1
  let recordStart = 0

  const endRecord = (endIndex: number) => {
    cells.push(current.trim())
    const raw = text.slice(recordStart, endIndex)
    if (!(cells.length === 1 && cells[0] === '' && raw.trim() === '')) {
      all.push({ cells, line: recordLine, raw })
    }
    cells = []
    current = ''
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        if (char === '\n') line++
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      cells.push(current.trim())
      current = ''
    } else if (char === '\n') {
      endRecord(i)
      line++
      recordLine = line
      recordStart = i + 1
    } else {
      current += char
    }
  }
  if (recordStart <= text.length) endRecord(text.length)

  const [header, ...records] = all
  return { delimiter, headers: header ? header.cells : [], records }
}

// ---------------------------------------------------------------------------
// Alias table (§3.2)
// ---------------------------------------------------------------------------

export type CsvColumn =
  | 'quantity'
  | 'name'
  | 'scryfallId'
  | 'setCode'
  | 'setName'
  | 'collectorNumber'
  | 'finish'
  | 'board'
  | 'condition'
  | 'language'
  | 'proxy'

/** Lower-cased header → meaning. Headers are matched case-insensitively with spaces trimmed. */
export const CSV_ALIASES: Record<CsvColumn, string[]> = {
  quantity: ['quantity', 'qty', 'count', 'amount', 'qty.'],
  name: ['name', 'card name', 'card', 'card_name'],
  scryfallId: ['scryfall id', 'scryfallid', 'scryfall_id'],
  setCode: ['set code', 'edition code', 'set', 'set_code', 'printing'],
  setName: ['set name', 'edition', 'edition name'],
  collectorNumber: ['collector number', 'card number', 'collector_number'],
  finish: ['foil', 'finish', 'is foil', 'is_foil'],
  board: ['board', 'section', 'zone', 'categories', 'category', 'tags', 'label'],
  condition: ['condition'],
  language: ['language'],
  proxy: ['proxy', 'is proxy'],
}

export type CsvColumnMap = Partial<Record<CsvColumn, number>> & { boardColumns?: number[] }

/** Normalise a header cell for alias comparison. */
function headerKey(header: string): string {
  return header.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Work out which column is which. `Number` is the quantity only when no other quantity column
 * exists, and the collector number only when a quantity column is found elsewhere (§3.2).
 * Several board-ish columns (`Categories` and `Tags`) can exist; all are kept.
 */
export function mapCsvHeaders(headers: string[]): CsvColumnMap {
  const map: CsvColumnMap = {}
  const boardColumns: number[] = []
  const keys = headers.map(headerKey)

  keys.forEach((key, index) => {
    for (const column of Object.keys(CSV_ALIASES) as CsvColumn[]) {
      if (!CSV_ALIASES[column].includes(key)) continue
      if (column === 'board') boardColumns.push(index)
      else if (map[column] === undefined) map[column] = index
      return
    }
  })

  const numberIndex = keys.indexOf('number')
  if (numberIndex !== -1) {
    if (map.quantity === undefined) map.quantity = numberIndex
    else if (map.collectorNumber === undefined) map.collectorNumber = numberIndex
  }
  if (boardColumns.length > 0) map.boardColumns = boardColumns
  return map
}

/** A header row is a card CSV when it names a card and also says how many, which printing or which board. */
export function looksLikeCardCsv(headers: string[]): boolean {
  const map = mapCsvHeaders(headers)
  if (map.name === undefined) return false
  return (
    map.quantity !== undefined ||
    map.setCode !== undefined ||
    map.collectorNumber !== undefined ||
    map.scryfallId !== undefined
  )
}

/** E-12: a first line is CSV when it has at least two delimiters and a recognised alias. */
export function isCsvHeaderLine(firstLine: string): boolean {
  const delimiter = detectDelimiter(firstLine)
  const parts = firstLine.replace(/^\uFEFF/, '').split(delimiter)
  if (parts.length < 3) return false
  return looksLikeCardCsv(readCsv(firstLine).headers)
}

// ---------------------------------------------------------------------------
// Cell rules
// ---------------------------------------------------------------------------

/** A Set cell is a code only when it is 2-6 letters/digits; longer values are a set NAME (Deckbox). */
export function looksLikeSetCode(value: string): boolean {
  return /^[a-z0-9]{2,6}$/i.test(value.trim())
}

/** Normalise a finish cell (`foil`, `1`, `etched`, `0`, ...) into the file's own words. */
export function normaliseFinishCell(raw: string | undefined): string {
  const value = (raw ?? '').trim().toLowerCase()
  if (['foil', '1', 'true', 'yes', 'y', 'x'].includes(value)) return 'foil'
  if (value === 'etched') return 'etched'
  if (['normal', 'nonfoil', 'non-foil', '0', 'false', 'no', 'n'].includes(value)) return 'normal'
  return (raw ?? '').trim()
}

const BOARD_PRECEDENCE: ImportBoard[] = ['maybeboard', 'commander', 'companion', 'main']

export interface BoardCellResult {
  board: ImportBoard
  /** Plain-words warning when the pieces disagreed (maybeboard > commander > main). */
  warning?: string
}

/**
 * Read a Board / Categories / Tags cell (§3.2 row rules): split on `,`, strip `[` `]`, compare each
 * piece with the section words. A piece naming a board wins over type categories like `Ramp`.
 * Disagreement resolves maybeboard > commander > main with a warning.
 */
export function boardFromCells(cells: Array<string | undefined>): BoardCellResult {
  const found = new Set<ImportBoard>()
  for (const cell of cells) {
    if (!cell) continue
    for (const piece of cell.replace(/[[\]]/g, '').split(',')) {
      const trimmed = piece.trim()
      if (!trimmed) continue
      const heading = classifyHeading(trimmed)
      if (heading?.kind === 'board') found.add(heading.board)
      // TappedOut says `side` and `maybe`.
      else if (/^side$/i.test(trimmed)) found.add('maybeboard')
      else if (/^maybe$/i.test(trimmed)) found.add('maybeboard')
    }
  }
  if (found.size === 0) return { board: 'main' }
  // 'main' as a named piece is a board word too, but must not hide a real board.
  const named = [...found].sort((a, b) => BOARD_PRECEDENCE.indexOf(a) - BOARD_PRECEDENCE.indexOf(b))
  const board = named.find((b) => b !== 'main') ?? 'main'
  const real = [...found].filter((b) => b !== 'main')
  if (real.length > 1) {
    return {
      board,
      warning: `A row lists more than one section (${real.join(', ')}); it went to ${board}.`,
    }
  }
  return { board }
}
