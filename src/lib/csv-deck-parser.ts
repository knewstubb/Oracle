// ---------------------------------------------------------------------------
// CSV Deck Parser — Parses Archidekt deck export CSVs into NormalizedDeck format
// ---------------------------------------------------------------------------

import type { NormalizedCard, NormalizedDeck } from '@/lib/deck-normalizer'

/**
 * Expected Archidekt deck export CSV format:
 * Quantity,Card Name,Categories,Label,Set Code,Set Name,Collector Number,Scryfall ID
 *
 * Also supports variations: "Name" instead of "Card Name", "Edition Code" instead of "Set Code"
 */

/**
 * Parse a CSV string that may contain quoted fields with commas, newlines, etc.
 * Implements RFC 4180 parsing.
 */
function parseCSVRow(row: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < row.length; i++) {
    const char = row[i]

    if (inQuotes) {
      if (char === '"') {
        // Check if it's an escaped quote (double-quote)
        if (i + 1 < row.length && row[i + 1] === '"') {
          current += '"'
          i++ // skip next quote
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        fields.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
  }

  fields.push(current.trim())
  return fields
}

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
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== '')

  if (lines.length < 2) {
    return { error: 'CSV file must have a header row and at least one card row' }
  }

  // Parse header to find column indices
  const header = parseCSVRow(lines[0])
  const headerLower = header.map((h) => h.toLowerCase().trim())

  const quantityIdx = headerLower.findIndex((h) => h === 'quantity')
  const cardNameIdx = headerLower.findIndex((h) => h === 'card name' || h === 'name')
  const categoriesIdx = headerLower.findIndex((h) => h === 'categories')
  const labelIdx = headerLower.findIndex((h) => h === 'label' || h === 'tags')
  const setCodeIdx = headerLower.findIndex((h) => h === 'set code' || h === 'edition code')
  const scryfallIdIdx = headerLower.findIndex((h) => h === 'scryfall id')

  if (cardNameIdx === -1) {
    return { error: 'CSV must have a "Card Name" or "Name" column' }
  }

  const cards: NormalizedCard[] = []
  const warnings: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVRow(lines[i])

    const cardName = fields[cardNameIdx]?.trim()
    if (!cardName) {
      warnings.push(`Row ${i + 1}: Skipped — no card name`)
      continue
    }

    const quantity = quantityIdx !== -1
      ? parseInt(fields[quantityIdx], 10) || 1
      : 1

    const setCode = setCodeIdx !== -1
      ? (fields[setCodeIdx]?.trim() ?? '')
      : ''

    const scryfallId = scryfallIdIdx !== -1
      ? (fields[scryfallIdIdx]?.trim() ?? '')
      : ''

    const rawCategories = categoriesIdx !== -1
      ? (fields[categoriesIdx]?.trim() ?? '')
      : ''
    const sourceCategories = parseCategories(rawCategories)

    const rawLabel = labelIdx !== -1
      ? (fields[labelIdx]?.trim().toLowerCase() ?? '')
      : ''

    const isCommander = sourceCategories.some(
      (c) => c.toLowerCase() === 'commander'
    )

    const isProxy = rawLabel.includes('proxy') ||
      sourceCategories.some((c) => c.toLowerCase() === 'proxy')

    cards.push({
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
    })
  }

  if (cards.length === 0) {
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

  return { deck, warnings }
}
