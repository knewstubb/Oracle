// ---------------------------------------------------------------------------
// CSV Deck Parser — Parses Archidekt deck export CSVs into NormalizedDeck format
// ---------------------------------------------------------------------------

import type { NormalizedCard, NormalizedDeck } from '@/lib/deck-normalizer'
import { boardFromCells, mapCsvHeaders, readCsv } from '@/lib/import-csv'

/**
 * Deck export CSV from Archidekt or any site in the import-formats alias table (§3.2). Reading is
 * done by the shared reader (RFC 4180 across lines, `;`/tab delimiters, BOM), so a quoted newline
 * no longer splits a record (E-9). Prefer the full import flow; this stays for callers that want
 * a NormalizedDeck.
 */

/**
 * Parse Archidekt-style categories string: "[Ramp,Removal]" or "[Ramp]"
 * Also handles quoted variants like "[Removal,Burn]"
 */
function parseCategories(raw: string): string[] {
  if (!raw) return []
  // Strip surrounding brackets
  const inner = raw.replace(/^\[/, '').replace(/\]$/, '').trim()
  if (!inner) return []
  return inner.split(',').map((s) => s.trim()).filter(Boolean)
}

export interface CSVParseResult {
  deck: NormalizedDeck
  warnings: string[]
}

export interface CSVParseError {
  error: string
}

export function isCSVParseError(result: CSVParseResult | CSVParseError): result is CSVParseError {
  return 'error' in result
}

/**
 * Parse an Archidekt deck export CSV into a NormalizedDeck.
 *
 * @param csvText - Raw CSV text content
 * @param deckName - User-provided deck name
 */
export function parseDeckCSV(csvText: string, deckName: string): CSVParseResult | CSVParseError {
  const table = readCsv(csvText)
  if (table.headers.length === 0 || table.records.length === 0) {
    return { error: 'CSV file must have a header row and at least one card row' }
  }

  const map = mapCsvHeaders(table.headers)
  if (map.name === undefined) {
    return { error: 'CSV must have a "Card Name" or "Name" column' }
  }

  const cards: NormalizedCard[] = []
  const maybeboard: NormalizedCard[] = []
  const warnings: string[] = []

  for (const record of table.records) {
    const fields = record.cells
    const at = (idx: number | undefined) => (idx === undefined ? '' : (fields[idx]?.trim() ?? ''))

    const cardName = at(map.name)
    if (!cardName) {
      warnings.push(`Row ${record.line}: Skipped — no card name`)
      continue
    }

    // A missing quantity COLUMN means 1; an empty or bad cell is skipped, not guessed (§3.2).
    let quantity = 1
    if (map.quantity !== undefined) {
      const cell = at(map.quantity)
      if (!/^\d+$/.test(cell) || Number.parseInt(cell, 10) < 1) {
        warnings.push(`Row ${record.line}: Skipped — quantity "${cell}" is not a whole number`)
        continue
      }
      quantity = Number.parseInt(cell, 10)
    }

    const setCode = at(map.setCode)
    const scryfallId = at(map.scryfallId)

    const boardCells = (map.boardColumns ?? []).map((idx) => fields[idx]?.trim() ?? '')
    const sourceCategories = boardCells.flatMap(parseCategories)
    const boardResult = boardFromCells(boardCells)
    if (boardResult.warning) warnings.push(`Row ${record.line}: ${boardResult.warning}`)

    const isCommander = boardResult.board === 'commander'
    const isProxy =
      /^(true|1|yes|y|x)$/i.test(at(map.proxy)) ||
      boardCells.some((cell) => /proxy/i.test(cell))

    const card: NormalizedCard = {
      cardName,
      scryfallId,
      oracleId: '',
      setCode,
      quantity,
      typeLine: '',
      isCommander,
      isProxy,
      manaCost: null,
      colorIdentity: [],
      sourceCategories,
    }
    if (boardResult.board === 'maybeboard') maybeboard.push(card)
    else cards.push(card)
  }

  if (cards.length === 0 && maybeboard.length === 0) {
    return { error: 'No valid cards found in CSV' }
  }

  const commander = cards.find((c) => c.isCommander) ?? null

  const deck: NormalizedDeck = {
    name: deckName || 'Imported Deck',
    platform: 'csv',
    platformDeckId: `csv-${Date.now()}`,
    sourceUrl: '',
    commander,
    cards,
    cardCount: cards.reduce((sum, c) => sum + c.quantity, 0),
    colourIdentity: '',
  }
  if (maybeboard.length > 0) deck.maybeboard = maybeboard

  return { deck, warnings }
}
