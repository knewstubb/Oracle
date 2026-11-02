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
import {
  boardFromCells,
  looksLikeCardCsv,
  looksLikeSetCode,
  mapCsvHeaders,
  normaliseFinishCell,
  readCsv,
  type CsvColumnMap,
} from '@/lib/import-csv'
import { normaliseQuotes, parseListText } from '@/lib/import-text-parser'
import { fileCommandZone, limitCompanions, retagCompanions } from '@/lib/import-command-zone'
import type {
  ImportCopyFileValues,
  ImportFinish,
  ImportRow,
  ImportValueNotices,
} from '../../docs/oracle/contracts/import-row-editing.types'
import type {
  ManaBoxCsvFinish,
  ImportBoard,
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
  /** Plain-words warnings from reading the file (for example a row listing two sections). */
  warnings: string[]
}

export interface ManaBoxTextParseResult {
  lines: ManaBoxTextLine[]
  /** Lines that did not match the grammar. */
  badLines: ManaBoxUnmatchedLine[]
  /** Lines under a Tokens heading (D-049). */
  skippedTokens: ManaBoxSkippedToken[]
  /** Plain-words warnings and notes from the shared parser (import-formats §5). */
  warnings: string[]
  notes: string[]
  nameOnly: boolean
  headingsSeen: number
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

/**
 * True when the first non-empty line is a card-list CSV header: ManaBox's own markers, or any
 * other site's header recognised through the alias table (contract §3.2, E-12). Needs at least
 * a name column and a quantity, printing or id column, and either two delimiters or both a name
 * and a quantity column so a plain sentence with one comma is not read as a header.
 */
export function isManaBoxCsv(content: string): boolean {
  const firstLine = content
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .find((line) => line.trim() !== '')
  if (!firstLine) return false
  const table = readCsv(firstLine)
  const headers = table.headers
  if (headers.length < 2) return false
  if (MANABOX_CSV_MARKERS.every((marker) => headers.includes(marker))) return true
  if (!looksLikeCardCsv(headers)) return false
  const map = mapCsvHeaders(headers)
  return headers.length >= 3 || (map.name !== undefined && map.quantity !== undefined)
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
  // A list with no quantity anywhere and no section word is plain prose, not a deck file.
  if (parsed.lines.length > 0 && (!parsed.nameOnly || parsed.headingsSeen > 0)) return 'text'

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

/**
 * The file's Proxy cell (N-5): true/1/yes/x/y = proxy; blank/false/0/no = not a proxy;
 * anything else is treated as "the file did not say" (undefined).
 */
export function parseProxyFlag(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined
  const value = raw.trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'x'].includes(value)) return true
  if (['', 'false', '0', 'no', 'n'].includes(value)) return false
  return undefined
}

function extractCsvRow(
  fields: string[],
  map: CsvColumnMap,
  byHeader: Map<string, number>
): { row: ManaBoxCsvRow; rawFinish: string | undefined; warning?: string } {
  const at = (index: number | undefined): string | undefined =>
    index === undefined ? undefined : fields[index]
  const extra = (name: string): string | undefined => at(byHeader.get(name))

  // A "set" cell is a code when it is 2-6 letters/digits (ManaBox, Moxfield `Edition`); a longer
  // value is a set NAME (Deckbox `Edition`) which cannot be used as a code (§3.2).
  let setCode = (at(map.setCode) ?? '').trim()
  let setName = at(map.setName)?.trim() || undefined
  if (setCode && !looksLikeSetCode(setCode)) {
    setName = setName ?? setCode
    setCode = ''
  }
  if (!setCode && setName && looksLikeSetCode(setName) && map.collectorNumber !== undefined) {
    setCode = setName
    setName = undefined
  }

  const boardResult = boardFromCells((map.boardColumns ?? []).map((index) => fields[index]))
  const rawFinish = map.finish === undefined ? undefined : normaliseFinishCell(fields[map.finish])
  const quantityCell = at(map.quantity)

  return {
    row: {
      name: at(map.name) ?? '',
      setCode,
      setName,
      collectorNumber: (at(map.collectorNumber) ?? '').trim(),
      finish: parseManaBoxRawFinish(rawFinish),
      rarity: extra('rarity'),
      // A missing quantity COLUMN means 1 each; an empty or bad cell is a bad row (§3.2).
      quantity: map.quantity === undefined ? 1 : parseWholeNumber(quantityCell),
      manaBoxId: extra('manabox id'),
      scryfallId: (at(map.scryfallId) ?? '').trim(),
      purchasePrice: parseOptionalNumber(extra('purchase price')),
      misprint: parseOptionalBoolean(extra('misprint')),
      altered: parseOptionalBoolean(extra('altered')),
      signed: parseOptionalBoolean(extra('signed')),
      condition: at(map.condition),
      language: at(map.language),
      proxy: parseProxyFlag(at(map.proxy)),
      purchasePriceCurrency: extra('purchase price currency'),
      added: extra('added'),
      board: boardResult.board,
    },
    rawFinish,
    warning: boardResult.warning,
  }
}

/** A whole number >= 0 as written; NaN when the cell is empty or not a plain integer. */
function parseWholeNumber(raw: string | undefined): number {
  const trimmed = (raw ?? '').trim()
  return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : Number.NaN
}

/**
 * Parse a collection or deck CSV from ManaBox or any other site (import-formats §3.2). Rows with
 * no name or an invalid quantity become `badRows` (unmatched, reason `bad_line`) rather than being
 * dropped silently (contract §11.2). Throws when the file has no name column.
 */
export function parseManaBoxCsv(content: string): ManaBoxCsvParseResult {
  const table = readCsv(content)
  const { headers } = table
  if (headers.length === 0) {
    return { headers: [], records: [], badRows: [], warnings: [] }
  }

  const map = mapCsvHeaders(headers)
  if (map.name === undefined) {
    throw new Error('CSV missing required columns: Name')
  }
  const byHeader = new Map<string, number>()
  headers.forEach((header, index) => {
    const key = header.replace(/^\uFEFF/, '').trim().toLowerCase()
    if (!byHeader.has(key)) byHeader.set(key, index)
  })

  const records: ManaBoxCsvRecord[] = []
  const badRows: ManaBoxUnmatchedLine[] = []
  const warnings: string[] = []

  for (const record of table.records) {
    const lineNumber = record.line
    const rawLine = record.raw
    const { row, rawFinish, warning } = extractCsvRow(record.cells, map, byHeader)

    if (!row.name.trim()) {
      badRows.push({ sourceIndex: lineNumber, rawLine, reason: 'bad_line' })
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

    if (warning) warnings.push(`Line ${lineNumber}: ${warning}`)
    records.push({ rowIndex: lineNumber, raw: rawLine, row, rawFoil: rawFinish })
  }

  return { headers, records, badRows, warnings }
}

// ---------------------------------------------------------------------------
// Text parsing (contract §6; shared parser in import-text-parser.ts)
// ---------------------------------------------------------------------------

/**
 * Parse a ManaBox or other site's text list. One shared parser reads every format (T-60 S-2,
 * import-text-parser.ts): section words, `SB:` lines, tags, finish markers, 2-6 character set
 * codes. The collector number is preserved and DFC names keep their ` // ` separator.
 */
export function parseManaBoxText(content: string): ManaBoxTextParseResult {
  const { lines, badLines, skippedTokens, warnings, notes, nameOnly, headingsSeen } = parseListText(content)
  return { lines, badLines, skippedTokens, warnings, notes, nameOnly, headingsSeen }
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
  /** Which section the source line named (import-formats §4). Undefined = main. */
  board?: ImportBoard
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
  /** Plain-words notes from reading the file (ignored headings, kept-in-main cards, etc.). */
  notes?: string[]
}
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
    // A maybeboard line is its own row, never merged with the same card in the main list (E-1),
    // and basics there are never turned into generic slots (E-13).
    const onMaybeboard = candidate.board === 'maybeboard'
    const key = onMaybeboard
      ? `${buildRowKey(candidate, rowKind)}|maybeboard`
      : buildRowKey(candidate, rowKind) + (isGenericBasic(candidate.cardName, printingGiven) ? '|generic' : '')

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
        ...(onMaybeboard ? { board: 'maybeboard' as const } : {}),
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
  } else if (!row.setCode || !row.collectorNumber) {
    // No Scryfall id and no full printing (Moxfield without numbers, Deckbox with a set NAME,
    // Name+Quantity lists): find the card by name and take the default printing (§3.2).
    facts = resolver.resolveByName
      ? await resolver.resolveByName(normaliseQuotes(row.name), { setCode: row.setCode || undefined })
      : null
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
  // The file's Proxy column sets the review row's default to Proxy (D-055); the owner can change it.
  if (row.proxy === true) file.proxy = true

  const printingGiven = Boolean(scryfallId || (row.setCode && row.collectorNumber))

  return {
    sourceIndex: record.rowIndex,
    cardName: printingGiven ? row.name : frontFaceName(facts.cardName),
    setCode: facts.setCode || row.setCode.toLowerCase(),
    collectorNumber: printingGiven ? row.collectorNumber : (facts.collectorNumber ?? ''),
    scryfallId: facts.scryfallId,
    oracleId: facts.oracleId,
    qty: Math.min(row.quantity, 100),
    source: 'csv',
    printingGiven, // false for a Name + Quantity list: the default printing is a guess
    board: row.board,
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

/** What a text line says about finish and proxy; empty when it has no marker. */
export function textLineFileValues(line: Pick<ManaBoxTextLine, 'finish' | 'proxy'>): ImportCopyFileValues {
  const file: ImportCopyFileValues = {}
  if (line.finish) file.finish = line.finish
  if (line.proxy === true) file.proxy = true
  return file
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
    // A text line carries no condition or language (contract §2A). A `*F*`/`*E*` marker sets the
    // finish and a `^Proxy^` label the type default (N-3, N-5); no marker leaves both unset, so
    // ManaBox text stays nonfoil / Original.
    file: textLineFileValues(line),
    board: line.board,
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
  const notes: string[] = []

  if (input.csvContent !== undefined && isManaBoxCsv(input.csvContent)) {
    const { records, badRows, warnings } = parseManaBoxCsv(input.csvContent)
    notes.push(...warnings)
    totalLines = records.length + badRows.length
    unmatched.push(...badRows)
    for (const record of records) {
      const candidate = await resolveCsvRecord(record, resolver, unmatched, skippedTokens)
      if (candidate) candidates.push(candidate)
    }
  } else if (input.textContent !== undefined) {
    const parsed = parseManaBoxText(input.textContent)
    const { lines, badLines } = parsed
    notes.push(...parsed.warnings, ...parsed.notes)
    skippedTokens.push(...parsed.skippedTokens)
    totalLines = lines.length + badLines.length + parsed.skippedTokens.length
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
    notes,
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

/** Plain-words notes the deck preview adds for boards and unmatched lines (import-formats §4, E-16). */
function deckPreviewNotes(resolution: ManaBoxResolution): string[] {
  const notes = [...(resolution.notes ?? [])]
  const companions = resolution.candidates.filter((c) => c.board === 'companion')
  if (companions.length > 0) {
    notes.push(
      `${[...new Set(companions.map((c) => c.cardName))].join(', ')} is marked as a companion. It is ticked as the companion below; untick it to keep it in the main list.`
    )
  }
  if (resolution.unmatched.some((u) => u.setCode && u.reason === 'no_card')) {
    notes.push(
      "Some lines name a set or number we couldn't find. Other sites sometimes use set codes that differ from ours, so those lines are listed instead of guessed."
    )
  }
  return notes
}

/** Build the non-writing preview for a ManaBox deck CSV or text export. */
export async function buildDeckPreview(
  input: ManaBoxDeckPreviewInput,
  resolver: ManaBoxResolver,
  /** Optional: oracle text by lower-case card name, used only to spot a companion listed with the commanders (E-22). */
  loadOracleText?: (names: string[]) => Promise<Map<string, string | null>>
): Promise<ManaBoxPreviewResponse> {
  const resolved = await resolveDeckRows(input, resolver)
  const zoneNotes: string[] = []
  let candidates = resolved.candidates
  const commanderBoard = candidates.filter((c) => c.board === 'commander')
  if (loadOracleText && commanderBoard.length >= 2) {
    try {
      const text = await loadOracleText([...new Set(commanderBoard.map((c) => c.cardName))])
      const retagged = retagCompanions(candidates, text)
      candidates = retagged.candidates
      zoneNotes.push(...retagged.notes)
    } catch {
      // No card text: leave the file's own headings as they are.
    }
  }
  const limited = limitCompanions(candidates)
  candidates = limited.candidates
  zoneNotes.push(...limited.notes)
  const resolution = { ...resolved, candidates }
  const notes = [...deckPreviewNotes(resolution), ...zoneNotes]
  const zone = fileCommandZone(candidates)
  const commanders = zone.commanders
  const companion = zone.companion
  return {
    fileName: resolution.fileName,
    totalLines: resolution.totalLines,
    rows: combineResolvedRows(resolution.candidates, 'deck'),
    skippedTokens: resolution.skippedTokens,
    unmatched: resolution.unmatched,
    notices: countUnrecognisedValues(resolution.candidates),
    ...(notes.length > 0 ? { notes } : {}),
    ...(commanders.length > 0 ? { commanders } : {}),
    ...(companion ? { companion } : {}),
  }
}
