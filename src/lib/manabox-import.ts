/**
 * ManaBox import — parsing, identity resolution orchestration and preview.
 *
 * Contract: docs/oracle/contracts/manabox-import.md (T-53) and the mirror at
 * docs/oracle/contracts/manabox-import.types.ts. Decisions D-044 to D-053.
 *
 * This module is deliberately free of database and network access. It parses a
 * ManaBox CSV or text export and, given a ManaBoxResolver, produces the
 * non-writing preview the import screen shows. The Supabase-backed resolver
 * lives in `manabox-resolver.ts`; the write paths live in
 * `manabox-collection-import.ts` and `manabox-deck-import.ts`.
 */

import {
  isBasicLand,
  isGenericBasic,
  hasPrintingGiven,
  frontFaceName,
} from '@/lib/basic-lands'
import {
  buildRowCopies,
  buildRowKey,
  isUnrecognisedCondition,
  isUnrecognisedFinish,
  isUnrecognisedLanguage,
  parseFileCondition,
  parseFileFinish,
  parseFileLanguage,
} from '@/lib/import-copies'
import type {
  ImportCopyFileValues,
  ImportFinish,
  ImportRow,
  ImportValueNotices,
} from '../../docs/oracle/contracts/import-row-editing.types'
import type {
  ManaBoxCsvFinish,
  ManaBoxCsvRow,
  ManaBoxTextLine,
  ManaBoxUnmatchedLine,
  ManaBoxSkippedToken,
  ManaBoxPreviewResponse,
} from '../../docs/oracle/contracts/manabox-import.types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single CSV data row with its 1-based physical line number in the file. */
export interface ManaBoxCsvRecord {
  /** 1-based physical line number in the source file (header is line 1). */
  rowIndex: number
  raw: string
  row: ManaBoxCsvRow
  /** The raw `Foil` cell, kept so "blank" and "unrecognised" can be told apart. */
  rawFoil?: string
}

export interface ManaBoxCsvParseResult {
  headers: string[]
  records: ManaBoxCsvRecord[]
  /** Rows that could not be parsed (missing name, invalid quantity). */
  badRows: ManaBoxUnmatchedLine[]
}

export interface ManaBoxTextParseResult {
  lines: ManaBoxTextLine[]
  /** Lines that did not match the grammar. */
  badLines: ManaBoxUnmatchedLine[]
}

/**
 * Card data the preview needs from an identity lookup. This is exactly the
 * subset of `ref_printings` that drives storage and token detection.
 */
export interface ManaBoxCardFacts {
  oracleId: string
  scryfallId: string
  cardName: string
  setCode: string
  /** Collector number of the printing, when the resolver knows it. */
  collectorNumber?: string
  layout: string | null
  typeLine: string | null
  /**
   * Finishes Scryfall lists for this printing (nonfoil/foil/etched), or null when
   * not known yet (contract §5A). Optional so older callers and tests may omit it.
   */
  availableFinishes?: ImportFinish[] | null
}

/**
 * Injectable identity resolution. The real implementation queries
 * `ref_printings`; tests inject an in-memory map.
 */
export interface ManaBoxResolver {
  resolveByScryfallId(scryfallId: string): Promise<ManaBoxCardFacts | null>
  resolveBySetCollector(
    setCode: string,
    collectorNumber: string
  ): Promise<ManaBoxCardFacts | null>
  /**
   * Plain decklists name no printing. Find the card by NAME (its canonical identity,
   * `oracle_id`) and return the printing to use by default: one the owner already owns,
   * otherwise the newest regular paper printing. `setCode` narrows the choice when the
   * line gave a set but no collector number. Optional: resolvers that cannot do this
   * leave such lines unmatched.
   */
  resolveByName?(name: string, options?: { setCode?: string }): Promise<ManaBoxCardFacts | null>
}

export interface ManaBoxCollectionPreviewInput {
  fileName: string
  csvContent: string
}

export interface ManaBoxDeckPreviewInput {
  fileName: string
  csvContent?: string
  textContent?: string
}

export type ManaBoxFileKind = 'csv' | 'text'

// ---------------------------------------------------------------------------
// Header detection (contract §2.1)
// ---------------------------------------------------------------------------

/**
 * The case-sensitive markers that identify a ManaBox CSV. `ManaBox ID` and
 * `Scryfall ID` are optional: a file without them is matched by set code +
 * collector number (contract §5.1 rule 2).
 */
export const MANABOX_CSV_MARKERS = ['Set code', 'Collector number'] as const

/** Required columns a ManaBox CSV must carry to be importable. */
const REQUIRED_CSV_COLUMNS = [
  'Name',
  'Set code',
  'Collector number',
  'Foil',
  'Quantity',
] as const

/**
 * Parse a single CSV line into fields, honouring RFC 4180 quoting and escaped
 * double quotes ("a""b" → a"b).
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      fields.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current.trim())
  return fields
}

/** Split file content into lines without stripping empty ones (line numbers matter). */
function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

/**
 * True when the first non-empty line carries every ManaBox CSV marker.
 * Detection is case-sensitive on the exact header strings (contract §2.1).
 */
export function isManaBoxCsv(content: string): boolean {
  const firstLine = splitLines(content).find((line) => line.trim() !== '')
  if (!firstLine) return false
  const headers = parseCsvLine(firstLine)
  return MANABOX_CSV_MARKERS.every((marker) => headers.includes(marker))
}

/**
 * Detect whether a file is a ManaBox CSV or text export. Returns null when the
 * content is neither.
 *
 * A file is text when it is not a CSV and at least one non-empty, non-comment
 * line matches the text grammar. A file that is plainly not a CSV and has no
 * parseable lines is rejected.
 */
export function detectManaBoxFile(content: string): ManaBoxFileKind | null {
  if (isManaBoxCsv(content)) return 'csv'

  const parsed = parseManaBoxText(content)
  if (parsed.lines.length > 0) return 'text'

  return null
}

// ---------------------------------------------------------------------------
// Finish mapping (contract §4)
// ---------------------------------------------------------------------------

/**
 * Map a ManaBox `Foil` value to Oracle's `user_copies.finish`.
 * normal/empty → nonfoil, foil → foil, etched → etched.
 */
export function mapManaBoxFinish(
  raw: string | undefined
): 'nonfoil' | 'foil' | 'etched' {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === 'foil') return 'foil'
  if (value === 'etched') return 'etched'
  return 'nonfoil'
}

/** The file's raw `Foil` value, before mapping to Oracle's finish. */
function parseManaBoxRawFinish(raw: string | undefined): ManaBoxCsvFinish {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === 'foil') return 'foil'
  if (value === 'etched') return 'etched'
  return 'normal'
}

// ---------------------------------------------------------------------------
// CSV parsing (contract §3)
// ---------------------------------------------------------------------------

function parseOptionalNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const num = Number.parseFloat(trimmed.replace(/[^0-9.\-]/g, ''))
  return Number.isNaN(num) ? undefined : num
}

function parseOptionalBoolean(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim().toLowerCase()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  return undefined
}

function extractCsvRow(fields: string[], colIdx: Record<string, number>): ManaBoxCsvRow {
  const get = (name: string): string | undefined => {
    const idx = colIdx[name]
    return idx === undefined ? undefined : fields[idx]
  }

  return {
    name: get('Name') ?? '',
    setCode: get('Set code') ?? '',
    setName: get('Set name'),
    collectorNumber: get('Collector number') ?? '',
    finish: parseManaBoxRawFinish(get('Foil')),
    rarity: get('Rarity'),
    quantity: Number.parseInt(get('Quantity') ?? '', 10),
    manaBoxId: get('ManaBox ID'),
    scryfallId: get('Scryfall ID') ?? '',
    purchasePrice: parseOptionalNumber(get('Purchase price')),
    misprint: parseOptionalBoolean(get('Misprint')),
    altered: parseOptionalBoolean(get('Altered')),
    signed: parseOptionalBoolean(get('Signed')),
    condition: get('Condition'),
    language: get('Language'),
    proxy: parseOptionalBoolean(get('Proxy')),
    purchasePriceCurrency: get('Purchase price currency'),
    added: get('Added'),
  }
}

/**
 * Parse a ManaBox collection or deck CSV. Rows with no name or an invalid
 * quantity become `badRows` (unmatched, reason `bad_line`) rather than being
 * dropped silently (contract §11.2).
 */
export function parseManaBoxCsv(content: string): ManaBoxCsvParseResult {
  const lines = splitLines(content)
  const firstIndex = lines.findIndex((line) => line.trim() !== '')
  if (firstIndex === -1) {
    return { headers: [], records: [], badRows: [] }
  }

  const headers = parseCsvLine(lines[firstIndex])
  const colIdx: Record<string, number> = {}
  for (let i = 0; i < headers.length; i++) {
    colIdx[headers[i]] = i
  }

  const missing = REQUIRED_CSV_COLUMNS.filter((column) => colIdx[column] === undefined)
  if (missing.length > 0) {
    throw new Error(
      `CSV missing required columns: ${missing.join(', ')}`
    )
  }

  const records: ManaBoxCsvRecord[] = []
  const badRows: ManaBoxUnmatchedLine[] = []

  for (let i = firstIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i]
    if (rawLine.trim() === '') continue

    // 1-based physical line number; the header is line `firstIndex + 1`.
    const lineNumber = i + 1
    const fields = parseCsvLine(rawLine)
    const row = extractCsvRow(fields, colIdx)

    if (!row.name.trim()) {
      badRows.push({
        sourceIndex: lineNumber,
        rawLine,
        reason: 'bad_line',
      })
      continue
    }

    if (!Number.isInteger(row.quantity) || row.quantity < 1) {
      badRows.push({
        sourceIndex: lineNumber,
        rawLine,
        cardName: row.name,
        setCode: row.setCode,
        collectorNumber: row.collectorNumber,
        reason: 'bad_line',
      })
      continue
    }

    records.push({
      rowIndex: lineNumber,
      raw: rawLine,
      row,
      rawFoil: colIdx['Foil'] === undefined ? undefined : fields[colIdx['Foil']],
    })
  }

  return { headers, records, badRows }
}

// ---------------------------------------------------------------------------
// Text parsing (contract §6)
// ---------------------------------------------------------------------------

/**
 * `<quantity> <card name> (<set code>) <collector number>`
 * Set code is 2–4 alphanumerics; the collector number is kept verbatim.
 * The printing part is optional: a plain decklist line (`10 Island`, `1x Sol Ring`)
 * has no set code, and the card is then found by name. A set code without a
 * collector number (`1 Sol Ring (CMR)`) is also accepted. Missing parts are
 * returned as empty strings.
 */
const TEXT_LINE_RE = /^(\d+)x?\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,4})\)(?:\s+(\S+))?)?\s*$/

/** Section headings that plain decklists put above the main list; they carry no card. */
const TEXT_HEADING_RE = /^(deck|mainboard|main)\s*:?$/i

/**
 * Parse a ManaBox text export. The collector number is preserved (the old
 * paste parser dropped it) and DFC names keep their ` // ` separator.
 */
export function parseManaBoxText(content: string): ManaBoxTextParseResult {
  const lines = splitLines(content)
  const parsed: ManaBoxTextLine[] = []
  const badLines: ManaBoxUnmatchedLine[] = []

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const line = rawLine.trim()
    if (line === '') continue
    if (line.startsWith('//') || line.startsWith('#')) continue
    if (TEXT_HEADING_RE.test(line)) continue

    const lineNumber = i + 1
    const match = line.match(TEXT_LINE_RE)
    if (!match) {
      badLines.push({ sourceIndex: lineNumber, rawLine, reason: 'bad_line' })
      continue
    }

    const quantity = Number.parseInt(match[1], 10)
    const cardName = match[2].trim()
    const setCode = match[3] ?? ''
    const collectorNumber = match[4] ?? ''

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      badLines.push({
        sourceIndex: lineNumber,
        rawLine,
        cardName,
        setCode,
        collectorNumber,
        reason: 'bad_line',
      })
      continue
    }

    parsed.push({
      quantity,
      cardName,
      setCode,
      collectorNumber,
      rawLine,
      lineNumber,
    })
  }

  return { lines: parsed, badLines }
}

// ---------------------------------------------------------------------------
// Token detection (contract §11.1)
// ---------------------------------------------------------------------------

/**
 * A card is a token when its resolved Scryfall data says so. There is no
 * set-code allow-list — `TDM` is a real set, `TFDN` is where the sample token
 * lives.
 */
export function isTokenCard(facts: Pick<ManaBoxCardFacts, 'layout' | 'typeLine'>): boolean {
  const layout = (facts.layout ?? '').toLowerCase()
  if (layout === 'token' || layout === 'double_faced_token') return true
  return (facts.typeLine ?? '').includes('Token')
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/** A resolved, not-yet-combined candidate row (one source line). */
export interface ResolvedManaBoxCandidate {
  sourceIndex: number
  cardName: string
  setCode: string
  collectorNumber: string
  scryfallId: string
  oracleId: string
  qty: number
  /** `text` lines carry no finish, condition or language (contract §2A). */
  source: 'csv' | 'text'
  /** What the file supplied for this line. Never defaulted here (contract §3). */
  file: ImportCopyFileValues
  /** Which cells held a value the app could not use (counted in notices). */
  unrecognised?: { finish: boolean; condition: boolean; language: boolean }
  /** Finishes Scryfall lists for the printing; null when unknown. */
  availableFinishes?: ImportFinish[] | null
  /** Did the source line name a printing (set/number or Scryfall id)? False for "11 Plains". */
  printingGiven?: boolean
  /** Collection only: purchase price in USD, or null. */
  purchasePrice?: number | null
  /** Collection only: ISO `Added` timestamp, or undefined. */
  acquiredAt?: string
}

/** A file fully parsed, resolved and split into tokens/unmatched/candidates. */
export interface ManaBoxResolution {
  fileName: string
  totalLines: number
  candidates: ResolvedManaBoxCandidate[]
  skippedTokens: ManaBoxSkippedToken[]
  unmatched: ManaBoxUnmatchedLine[]
}

/** Which kind of file a set of candidates came from, for row-key purposes. */
export type ManaBoxRowKind = 'collection' | 'deck'

/**
 * Combine resolved candidates into preview rows (contract §4, §13.3). Rows are
 * grouped by the FILE's values only (D-051): same printing and finish in
 * different languages are separate rows; different conditions share one row.
 * The row key is built once here and never recomputed.
 */
export function combineResolvedRows(
  candidates: ResolvedManaBoxCandidate[],
  kind: ManaBoxRowKind
): ImportRow[] {
  const grouped = new Map<string, { row: ImportRow; lines: ResolvedManaBoxCandidate[] }>()

  for (const candidate of candidates) {
    const rowKind = candidate.source === 'text' ? 'text' : kind
    const printingGiven = candidate.printingGiven ?? true
    // A plain "11 Plains" must never merge with "Plains (ZNR) 250" even if the default printing
    // is that same card: one becomes a generic slot, the other a real copy.
    const key =
      buildRowKey(candidate, rowKind) + (isGenericBasic(candidate.cardName, printingGiven) ? '|generic' : '')

    const existing = grouped.get(key)
    if (existing) {
      existing.lines.push(candidate)
      existing.row.sourceLines.push(candidate.sourceIndex)
      existing.row.sourceIndex = Math.min(existing.row.sourceIndex, candidate.sourceIndex)
      continue
    }

    grouped.set(key, {
      lines: [candidate],
      row: {
        rowKey: key,
        sourceIndex: candidate.sourceIndex,
        sourceLines: [candidate.sourceIndex],
        cardName: candidate.cardName,
        setCode: candidate.setCode,
        collectorNumber: candidate.collectorNumber,
        scryfallId: candidate.scryfallId,
        oracleId: candidate.oracleId,
        qty: 0,
        availableFinishes: candidate.availableFinishes ?? null,
        copies: [],
        isBasicLand: isBasicLand(candidate.cardName),
        printingGiven,
      },
    })
  }

  const rows: ImportRow[] = []
  for (const { row, lines } of grouped.values()) {
    row.sourceLines.sort((a, b) => a - b)
    row.copies = buildRowCopies(lines)
    row.qty = row.copies.length
    rows.push(row)
  }
  rows.sort((a, b) => a.sourceIndex - b.sourceIndex)
  return rows
}

/** Count the file cells the app could not use (one count per source line). */
export function countUnrecognisedValues(
  candidates: ResolvedManaBoxCandidate[]
): Pick<ImportValueNotices, 'unrecognisedCondition' | 'unrecognisedLanguage' | 'unrecognisedFinish'> {
  const counts = { unrecognisedCondition: 0, unrecognisedLanguage: 0, unrecognisedFinish: 0 }
  for (const candidate of candidates) {
    if (candidate.unrecognised?.condition) counts.unrecognisedCondition++
    if (candidate.unrecognised?.language) counts.unrecognisedLanguage++
    if (candidate.unrecognised?.finish) counts.unrecognisedFinish++
  }
  return counts
}

/**
 * Resolve a CSV record into a candidate, or record why it could not be
 * resolved. CSV resolution prefers the file's Scryfall ID (contract §5.1).
 */
async function resolveCsvRecord(
  record: ManaBoxCsvRecord,
  resolver: ManaBoxResolver,
  unmatched: ManaBoxUnmatchedLine[],
  skippedTokens: ManaBoxSkippedToken[]
): Promise<ResolvedManaBoxCandidate | null> {
  const row = record.row
  const scryfallId = row.scryfallId.trim()

  let facts: ManaBoxCardFacts | null
  if (scryfallId) {
    facts = await resolver.resolveByScryfallId(scryfallId)
    if (!facts) {
      unmatched.push({
        sourceIndex: record.rowIndex,
        rawLine: record.raw,
        cardName: row.name,
        setCode: row.setCode,
        collectorNumber: row.collectorNumber,
        reason: 'unknown_id',
      })
      return null
    }
  } else {
    facts = await resolver.resolveBySetCollector(row.setCode, row.collectorNumber)
    if (!facts) {
      unmatched.push({
        sourceIndex: record.rowIndex,
        rawLine: record.raw,
        cardName: row.name,
        setCode: row.setCode,
        collectorNumber: row.collectorNumber,
        reason: 'no_card',
      })
      return null
    }
  }

  if (isTokenCard(facts)) {
    skippedTokens.push({
      sourceIndex: record.rowIndex,
      rawLine: record.raw,
      cardName: row.name,
    })
    return null
  }

  // File values are kept raw-but-parsed; a blank or unusable cell is "not supplied"
  // and is never defaulted here (contract §3).
  const file: ImportCopyFileValues = {}
  const finish = parseFileFinish(record.rawFoil)
  const condition = parseFileCondition(row.condition)
  const language = parseFileLanguage(row.language)
  if (finish) file.finish = finish
  if (condition) file.condition = condition
  if (language) file.language = language

  return {
    sourceIndex: record.rowIndex,
    cardName: row.name,
    setCode: facts.setCode || row.setCode.toLowerCase(),
    collectorNumber: row.collectorNumber,
    scryfallId: facts.scryfallId,
    oracleId: facts.oracleId,
    qty: Math.min(row.quantity, 100),
    source: 'csv',
    printingGiven: true, // a CSV row always carries a Scryfall id or set + number
    file,
    unrecognised: {
      finish: isUnrecognisedFinish(record.rawFoil),
      condition: isUnrecognisedCondition(row.condition),
      language: isUnrecognisedLanguage(row.language),
    },
    availableFinishes: facts.availableFinishes ?? null,
    purchasePrice: row.purchasePrice ?? null,
    acquiredAt: (row.added ?? '').trim() || undefined,
  }
}

async function resolveTextLine(
  line: ManaBoxTextLine,
  resolver: ManaBoxResolver,
  unmatched: ManaBoxUnmatchedLine[],
  skippedTokens: ManaBoxSkippedToken[]
): Promise<ResolvedManaBoxCandidate | null> {
  // A line with a full printing (set + collector number) resolves exactly; a plain line
  // (no printing) resolves by card name to a default printing.
  const facts =
    line.setCode && line.collectorNumber
      ? await resolver.resolveBySetCollector(line.setCode, line.collectorNumber)
      : resolver.resolveByName
        ? await resolver.resolveByName(line.cardName, { setCode: line.setCode || undefined })
        : null
  if (!facts) {
    unmatched.push({
      sourceIndex: line.lineNumber,
      rawLine: line.rawLine,
      cardName: line.cardName,
      setCode: line.setCode,
      collectorNumber: line.collectorNumber,
      reason: 'no_card',
    })
    return null
  }

  if (isTokenCard(facts)) {
    skippedTokens.push({
      sourceIndex: line.lineNumber,
      rawLine: line.rawLine,
      cardName: line.cardName,
    })
    return null
  }

  const namedPrinting = Boolean(line.setCode && line.collectorNumber)
  return {
    sourceIndex: line.lineNumber,
    // Text exports store the front-face name only (contract §5.3). A line that gave no
    // printing takes the card's proper spelling from the database (so "ghen, arcanum weaver" is fixed).
    cardName: frontFaceName(namedPrinting ? line.cardName : facts.cardName),
    setCode: facts.setCode || line.setCode.toLowerCase(),
    collectorNumber: namedPrinting ? line.collectorNumber : (facts.collectorNumber ?? ''),
    scryfallId: facts.scryfallId,
    oracleId: facts.oracleId,
    qty: Math.min(line.quantity, 100),
    source: 'text',
    printingGiven: hasPrintingGiven(line),
    // A text line carries no finish, condition or language (contract §2A).
    file: {},
    availableFinishes: facts.availableFinishes ?? null,
  }
}

/** Parse and resolve a ManaBox collection CSV without writing anything. */
export async function resolveCollectionRows(
  input: ManaBoxCollectionPreviewInput,
  resolver: ManaBoxResolver,
  onProgress?: (resolvedCopies: number, totalCopies: number) => void
): Promise<ManaBoxResolution> {
  const { records, badRows } = parseManaBoxCsv(input.csvContent)
  const unmatched: ManaBoxUnmatchedLine[] = [...badRows]
  const skippedTokens: ManaBoxSkippedToken[] = []

  const candidates: ResolvedManaBoxCandidate[] = []
  const totalCopies = records.reduce((sum, record) => sum + (record.row.quantity || 0), 0)
  let resolvedCopies = 0
  for (const record of records) {
    const candidate = await resolveCsvRecord(record, resolver, unmatched, skippedTokens)
    if (candidate) {
      candidates.push(candidate)
      resolvedCopies += candidate.qty
      onProgress?.(resolvedCopies, totalCopies)
    }
  }

  return {
    fileName: input.fileName,
    totalLines: records.length + badRows.length,
    candidates,
    skippedTokens,
    unmatched,
  }
}

/** Parse and resolve a ManaBox deck CSV or text export without writing anything. */
export async function resolveDeckRows(
  input: ManaBoxDeckPreviewInput,
  resolver: ManaBoxResolver
): Promise<ManaBoxResolution> {
  const unmatched: ManaBoxUnmatchedLine[] = []
  const skippedTokens: ManaBoxSkippedToken[] = []
  const candidates: ResolvedManaBoxCandidate[] = []
  let totalLines = 0

  if (input.csvContent !== undefined && isManaBoxCsv(input.csvContent)) {
    const { records, badRows } = parseManaBoxCsv(input.csvContent)
    totalLines = records.length + badRows.length
    unmatched.push(...badRows)
    for (const record of records) {
      const candidate = await resolveCsvRecord(record, resolver, unmatched, skippedTokens)
      if (candidate) candidates.push(candidate)
    }
  } else if (input.textContent !== undefined) {
    const { lines, badLines } = parseManaBoxText(input.textContent)
    totalLines = lines.length + badLines.length
    unmatched.push(...badLines)
    for (const line of lines) {
      const candidate = await resolveTextLine(line, resolver, unmatched, skippedTokens)
      if (candidate) candidates.push(candidate)
    }
  } else if (input.csvContent !== undefined) {
    // Caller handed us CSV content that is not ManaBox — fail loudly.
    throw new Error('Not a ManaBox CSV or text file')
  }

  return {
    fileName: input.fileName,
    totalLines,
    candidates,
    skippedTokens,
    unmatched,
  }
}

/** Build the non-writing preview for a ManaBox collection CSV (contract §13). */
export async function buildCollectionPreview(
  input: ManaBoxCollectionPreviewInput,
  resolver: ManaBoxResolver
): Promise<ManaBoxPreviewResponse> {
  const resolution = await resolveCollectionRows(input, resolver)
  return {
    fileName: resolution.fileName,
    totalLines: resolution.totalLines,
    rows: combineResolvedRows(resolution.candidates, 'collection'),
    skippedTokens: resolution.skippedTokens,
    unmatched: resolution.unmatched,
    notices: countUnrecognisedValues(resolution.candidates),
  }
}

/** Build the non-writing preview for a ManaBox deck CSV or text export. */
export async function buildDeckPreview(
  input: ManaBoxDeckPreviewInput,
  resolver: ManaBoxResolver
): Promise<ManaBoxPreviewResponse> {
  const resolution = await resolveDeckRows(input, resolver)
  return {
    fileName: resolution.fileName,
    totalLines: resolution.totalLines,
    rows: combineResolvedRows(resolution.candidates, 'deck'),
    skippedTokens: resolution.skippedTokens,
    unmatched: resolution.unmatched,
    notices: countUnrecognisedValues(resolution.candidates),
  }
}
