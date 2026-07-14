/**
 * CSV Format Normalizer
 *
 * Detects CSV format (Archidekt, Moxfield, etc.) and normalizes to the
 * canonical Archidekt column format expected by the import engine.
 *
 * This runs client-side before chunked upload, transforming the CSV header
 * and rows to match the import API's expected column names.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CSVFormat = 'archidekt' | 'moxfield' | 'manabox' | 'unknown'

export interface NormalizationResult {
  /** Detected format */
  format: CSVFormat
  /** Normalized CSV content (Archidekt format) */
  csvContent: string
  /** Number of rows (excluding header) */
  rowCount: number
  /** Number of rows filtered out (e.g., Moxfield proxies) */
  filteredCount: number
  /** Warning messages (e.g., missing optional columns) */
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Format Detection
// ---------------------------------------------------------------------------

/** Archidekt required headers */
const ARCHIDEKT_MARKERS = ['Quantity', 'Edition Code', 'Scryfall ID', 'Finish']

/** Moxfield specific headers */
const MOXFIELD_MARKERS = ['Count', 'Tradelist Count', 'Alter', 'Proxy']

/** ManaBox specific headers */
const MANABOX_MARKERS = ['ManaBox ID', 'Scryfall ID', 'Set code', 'Collector number']

function parseHeaderLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue }
    if (char === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue }
    current += char
  }
  fields.push(current.trim())
  return fields
}

/**
 * Detect the source tag from a pre-parsed array of CSV header names.
 * Returns 'archidekt', 'moxfield', 'manabox', or 'manual' for unrecognized formats.
 */
export function detectSourceTag(headers: string[]): string {
  const hasArchidekt = ARCHIDEKT_MARKERS.every(m => headers.includes(m))
  if (hasArchidekt) return 'archidekt'

  const hasMoxfield = MOXFIELD_MARKERS.every(m => headers.includes(m))
  if (hasMoxfield) return 'moxfield'

  const hasManabox = MANABOX_MARKERS.every(m => headers.includes(m))
  if (hasManabox) return 'manabox'

  return 'manual'
}

/**
 * Detect the CSV format from its header row.
 */
export function detectFormat(csvContent: string): CSVFormat {
  const firstLine = csvContent.split('\n')[0]?.trim() ?? ''
  const headers = parseHeaderLine(firstLine)

  const hasArchidekt = ARCHIDEKT_MARKERS.every(m => headers.includes(m))
  if (hasArchidekt) return 'archidekt'

  const hasMoxfield = MOXFIELD_MARKERS.every(m => headers.includes(m))
  if (hasMoxfield) return 'moxfield'

  const hasManabox = MANABOX_MARKERS.every(m => headers.includes(m))
  if (hasManabox) return 'manabox'

  return 'unknown'
}

// ---------------------------------------------------------------------------
// Moxfield → Archidekt Normalization
// ---------------------------------------------------------------------------

/**
 * Moxfield column mapping:
 *   Count → Quantity
 *   Name → Name (same)
 *   Edition → Edition Code
 *   Condition → Condition (same)
 *   Language → Language (same)
 *   Foil → Finish ("foil"→"Foil", "etched"→"Etched", ""→"Normal")
 *   Collector Number → Collector Number (same)
 *   Purchase Price → Purchase Price (same)
 *   Last Modified → Date Added
 *   Proxy → filter out "True" rows
 *
 * Missing in Moxfield (filled with empty):
 *   Tags, Edition Name, Multiverse Id, Scryfall ID
 */

const MOXFIELD_TO_ARCHIDEKT: Record<string, string> = {
  'Count': 'Quantity',
  'Name': 'Name',
  'Edition': 'Edition Code',
  'Condition': 'Condition',
  'Language': 'Language',
  'Foil': 'Finish',
  'Collector Number': 'Collector Number',
  'Purchase Price': 'Purchase Price',
  'Last Modified': 'Date Added',
}

/** The canonical output header in Archidekt format */
const OUTPUT_HEADERS = [
  'Quantity', 'Name', 'Finish', 'Condition', 'Date Added',
  'Language', 'Purchase Price', 'Tags', 'Edition Name',
  'Edition Code', 'Multiverse Id', 'Scryfall ID', 'Collector Number',
]

function normalizeMoxfield(csvContent: string): NormalizationResult {
  const lines = csvContent.split('\n')
  const headerLine = lines[0]?.trim() ?? ''
  const headers = parseHeaderLine(headerLine)

  // Build column index for Moxfield columns
  const colIdx: Record<string, number> = {}
  for (const h of headers) {
    colIdx[h] = headers.indexOf(h)
  }

  const proxyIdx = colIdx['Proxy'] ?? -1
  const warnings: string[] = []

  // Check for optional columns we can't fill
  if (colIdx['Tags'] === undefined) {
    warnings.push('Moxfield CSV has no Tags column — imported as empty')
  }

  const outputLines: string[] = []
  // Add normalized header
  outputLines.push(OUTPUT_HEADERS.map(h => `"${h}"`).join(','))

  let filteredCount = 0

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (!line) continue

    const fields = parseHeaderLine(line)

    // Filter out proxy entries
    if (proxyIdx >= 0 && fields[proxyIdx]?.toLowerCase() === 'true') {
      filteredCount++
      continue
    }

    // Map Moxfield fields to Archidekt format
    const quantity = fields[colIdx['Count']] || '1'
    const name = fields[colIdx['Name']] || ''
    if (!name) continue

    const editionCode = fields[colIdx['Edition']] || ''
    const condition = fields[colIdx['Condition']] || 'Near Mint'
    const language = fields[colIdx['Language']] || 'English'
    const collectorNumber = fields[colIdx['Collector Number']] || ''
    const purchasePrice = fields[colIdx['Purchase Price']] || ''
    const dateAdded = fields[colIdx['Last Modified']] || ''

    // Normalize Foil column: "foil" → "Foil", "etched" → "Etched", "" → "Normal"
    const rawFoil = (fields[colIdx['Foil']] || '').toLowerCase()
    let finish = 'Normal'
    if (rawFoil === 'foil') finish = 'Foil'
    else if (rawFoil === 'etched') finish = 'Etched'

    // Build output row in canonical order
    const row = [
      quantity, name, finish, condition, dateAdded,
      language, purchasePrice, '', '', // Tags, Edition Name (empty)
      editionCode, '', '', collectorNumber, // Multiverse Id, Scryfall ID (empty)
    ]

    // Quote fields that contain commas
    outputLines.push(row.map(f => f.includes(',') ? `"${f}"` : `"${f}"`).join(','))
  }

  return {
    format: 'moxfield',
    csvContent: outputLines.join('\n'),
    rowCount: outputLines.length - 1, // exclude header
    filteredCount,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// ManaBox → Archidekt Normalization
// ---------------------------------------------------------------------------

/**
 * ManaBox column mapping:
 *   Name → Name (same)
 *   Set code → Edition Code
 *   Set name → Edition Name
 *   Collector number → Collector Number
 *   Foil → Finish ("normal"→"Normal", "foil"→"Foil", "etched"→"Etched")
 *   Quantity → Quantity
 *   Scryfall ID → Scryfall ID (same — ManaBox includes this!)
 *   Purchase price → Purchase Price
 *   Condition → Condition (normalize: "near_mint"→"Near Mint", etc.)
 *   Language → Language (normalize: "en"→"English", etc.)
 *   Added → Date Added
 *
 * Ignored: ManaBox ID, Misprint, Altered, Rarity, Purchase price currency
 */

const CONDITION_MAP: Record<string, string> = {
  'near_mint': 'Near Mint',
  'lightly_played': 'Good (Lightly Played)',
  'moderately_played': 'Played',
  'heavily_played': 'Heavily Played',
  'damaged': 'Damaged',
}

const LANGUAGE_MAP: Record<string, string> = {
  'en': 'English',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh': 'Chinese',
  'fr': 'French',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'es': 'Spanish',
  'ru': 'Russian',
}

function normalizeManabox(csvContent: string): NormalizationResult {
  const lines = csvContent.split('\n')
  const headerLine = lines[0]?.trim() ?? ''
  const headers = parseHeaderLine(headerLine)

  const colIdx: Record<string, number> = {}
  for (let i = 0; i < headers.length; i++) {
    colIdx[headers[i]] = i
  }

  const warnings: string[] = []
  const outputLines: string[] = []
  outputLines.push(OUTPUT_HEADERS.map(h => `"${h}"`).join(','))

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (!line) continue

    const fields = parseHeaderLine(line)

    const name = fields[colIdx['Name']] || ''
    if (!name) continue

    const quantity = fields[colIdx['Quantity']] || '1'
    const setCode = fields[colIdx['Set code']] || ''
    const setName = fields[colIdx['Set name']] || ''
    const collectorNumber = fields[colIdx['Collector number']] || ''
    const scryfallId = fields[colIdx['Scryfall ID']] || ''
    const purchasePrice = fields[colIdx['Purchase price']] || ''
    const dateAdded = fields[colIdx['Added']] || ''

    // Normalize foil → finish
    const rawFoil = (fields[colIdx['Foil']] || '').toLowerCase()
    let finish = 'Normal'
    if (rawFoil === 'foil') finish = 'Foil'
    else if (rawFoil === 'etched') finish = 'Etched'

    // Normalize condition
    const rawCondition = (fields[colIdx['Condition']] || '').toLowerCase()
    const condition = CONDITION_MAP[rawCondition] || 'Near Mint'

    // Normalize language
    const rawLang = (fields[colIdx['Language']] || '').toLowerCase()
    const language = LANGUAGE_MAP[rawLang] || rawLang || 'English'

    // Build output row in canonical order:
    // Quantity, Name, Finish, Condition, Date Added, Language, Purchase Price,
    // Tags, Edition Name, Edition Code, Multiverse Id, Scryfall ID, Collector Number
    const row = [
      quantity, name, finish, condition, dateAdded,
      language, purchasePrice, '', setName,
      setCode, '', scryfallId, collectorNumber,
    ]

    outputLines.push(row.map(f => f.includes(',') ? `"${f}"` : `"${f}"`).join(','))
  }

  return {
    format: 'manabox',
    csvContent: outputLines.join('\n'),
    rowCount: outputLines.length - 1,
    filteredCount: 0,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a CSV to the canonical Archidekt format.
 * If already Archidekt format, passes through unchanged.
 * If Moxfield format, transforms columns and filters proxies.
 */
export function normalizeCSV(csvContent: string): NormalizationResult {
  const format = detectFormat(csvContent)

  switch (format) {
    case 'archidekt':
      // Pass through — already in the right format
      const lines = csvContent.split('\n').filter(l => l.trim())
      return {
        format: 'archidekt',
        csvContent,
        rowCount: lines.length - 1,
        filteredCount: 0,
        warnings: [],
      }

    case 'moxfield':
      return normalizeMoxfield(csvContent)

    case 'manabox':
      return normalizeManabox(csvContent)

    case 'unknown':
      // Try to pass through and let the import engine reject if invalid
      return {
        format: 'unknown',
        csvContent,
        rowCount: csvContent.split('\n').filter(l => l.trim()).length - 1,
        filteredCount: 0,
        warnings: ['Unrecognized CSV format — attempting import as-is'],
      }
  }
}
