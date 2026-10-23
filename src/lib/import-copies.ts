/**
 * Per-copy import attributes (import row editing).
 *
 * Contract: docs/oracle/contracts/import-row-editing.md (§3, §5, §5A, §6, §7, §9).
 * Types:    docs/oracle/contracts/import-row-editing.types.ts.
 *
 * Everything here is a small, pure, separately exported function: no database,
 * no network, no React. Identifier rules (D-003): `scryfallId` is a printing id,
 * `oracleId` is the canonical card id; finish is its own attribute.
 *
 * Precedence for every copy field: owner edit, then the file's value, then the
 * "Importing as" defaults. The current value is never stored; it is computed.
 */

import {
  ALL_IMPORT_FINISHES,
  type CollectionRpcRow,
  type DeckImportRpcRow,
  type FinishControlState,
  type ImportCondition,
  type ImportCopy,
  type ImportCopyEdits,
  type ImportCopyFileValues,
  type ImportCopyOwnerEdits,
  type ImportCopyType,
  type ImportDefaults,
  type ImportFinish,
  type ImportLanguage,
  type ImportRow,
  type ImportValueNotices,
  type ImportValueSource,
  type ResolvedImportCopy,
} from '../../docs/oracle/contracts/import-row-editing.types'

export type {
  ImportCondition,
  ImportCopy,
  ImportCopyEdits,
  ImportCopyFileValues,
  ImportCopyOwnerEdits,
  ImportCopyType,
  ImportDefaults,
  ImportFinish,
  ImportLanguage,
  ImportRow,
  ImportValueNotices,
  ResolvedImportCopy,
} from '../../docs/oracle/contracts/import-row-editing.types'

/** Largest number of copies one import may write (contract §10). */
export const MAX_IMPORT_COPIES = 10_000
/** Largest number of copies one source line may carry. */
export const MAX_COPIES_PER_LINE = 100

const IMPORT_CONDITIONS: ImportCondition[] = [
  'near_mint',
  'lightly_played',
  'moderately_played',
  'heavily_played',
  'damaged',
]
const IMPORT_TYPES: ImportCopyType[] = ['original', 'proxy', 'unsleeved']
const LANGUAGE_RE = /^[a-z]{2,4}$/

/** Accepted spellings of a condition, after lower-casing and `_` -> space. */
const CONDITION_ALIASES: Record<string, ImportCondition> = {
  nm: 'near_mint',
  'near mint': 'near_mint',
  lp: 'lightly_played',
  'lightly played': 'lightly_played',
  mp: 'moderately_played',
  'moderately played': 'moderately_played',
  hp: 'heavily_played',
  'heavily played': 'heavily_played',
  d: 'damaged',
  dmg: 'damaged',
  damaged: 'damaged',
}

// ---------------------------------------------------------------------------
// File parsing: raw cell -> value, or undefined for "the file did not supply it"
// ---------------------------------------------------------------------------

/** CSV `Foil`: normal / foil / etched. Anything else (or blank) is not supplied. */
export function parseFileFinish(raw?: string): ImportFinish | undefined {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === 'normal') return 'nonfoil'
  if (value === 'foil') return 'foil'
  if (value === 'etched') return 'etched'
  return undefined
}

/** CSV `Condition`. Blank or unrecognised is not supplied. Accepts `dmg` and `d`. */
export function parseFileCondition(raw?: string): ImportCondition | undefined {
  const value = (raw ?? '').trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ')
  if (value === '') return undefined
  return CONDITION_ALIASES[value]
}

/** CSV `Language`: lower-cased, 2 to 4 letters. Blank or malformed is not supplied. */
export function parseFileLanguage(raw?: string): ImportLanguage | undefined {
  const value = (raw ?? '').trim().toLowerCase()
  return LANGUAGE_RE.test(value) ? value : undefined
}

function isNonBlank(raw?: string): boolean {
  return (raw ?? '').trim() !== ''
}

/** A cell with content that the matching parser could not use (counted in notices). */
export function isUnrecognisedFinish(raw?: string): boolean {
  return isNonBlank(raw) && parseFileFinish(raw) === undefined
}
export function isUnrecognisedCondition(raw?: string): boolean {
  return isNonBlank(raw) && parseFileCondition(raw) === undefined
}
export function isUnrecognisedLanguage(raw?: string): boolean {
  return isNonBlank(raw) && parseFileLanguage(raw) === undefined
}

/** Is this a value the app stores for finish / condition / language / type? */
export function isImportFinish(value: unknown): value is ImportFinish {
  return typeof value === 'string' && (ALL_IMPORT_FINISHES as string[]).includes(value)
}
export function isImportCondition(value: unknown): value is ImportCondition {
  return typeof value === 'string' && (IMPORT_CONDITIONS as string[]).includes(value)
}
export function isImportCopyType(value: unknown): value is ImportCopyType {
  return typeof value === 'string' && (IMPORT_TYPES as string[]).includes(value)
}
export function isImportLanguage(value: unknown): value is ImportLanguage {
  return typeof value === 'string' && LANGUAGE_RE.test(value)
}

// ---------------------------------------------------------------------------
// Finish availability (contract §5A)
// ---------------------------------------------------------------------------

/** Scryfall `finishes` -> the values this app stores. Drops `glossy`; empty/missing -> null (unknown). */
export function mapScryfallFinishes(raw: string[] | null | undefined): ImportFinish[] | null {
  if (!raw || raw.length === 0) return null
  const mapped = ALL_IMPORT_FINISHES.filter((finish) => raw.includes(finish))
  return mapped.length > 0 ? mapped : null
}

/** The finishes a printing offers. Unknown (null) means all three. */
export function allowedFinishes(available: ImportFinish[] | null | undefined): ImportFinish[] {
  return available && available.length > 0 ? available : [...ALL_IMPORT_FINISHES]
}

export function isFinishListed(
  finish: ImportFinish,
  available: ImportFinish[] | null | undefined
): boolean {
  return allowedFinishes(available).includes(finish)
}

/** The wanted finish if listed, else the first listed of nonfoil, foil, etched. */
export function pickFallbackFinish(
  wanted: ImportFinish,
  available: ImportFinish[] | null | undefined
): ImportFinish {
  const allowed = allowedFinishes(available)
  if (allowed.includes(wanted)) return wanted
  return ALL_IMPORT_FINISHES.find((finish) => allowed.includes(finish)) ?? wanted
}

/** What the Finish control offers on a copy. */
export function finishControlState(
  available: ImportFinish[] | null | undefined,
  currentFinish: ImportFinish,
  source: ImportValueSource
): FinishControlState {
  const allowed = allowedFinishes(available)
  const unlisted = source === 'file' && !allowed.includes(currentFinish)
  if (allowed.length === 1 && !unlisted) {
    return { mode: 'hidden', options: [{ value: allowed[0], unlisted: false }] }
  }
  const values = new Set<ImportFinish>(allowed)
  if (unlisted) values.add(currentFinish)
  const options = ALL_IMPORT_FINISHES.filter((value) => values.has(value)).map((value) => ({
    value,
    unlisted: !allowed.includes(value),
  }))
  return { mode: 'select', options }
}

/** Server-side finish check for one copy. `rejected` means: refuse the request. */
export function validateCopyFinish(
  finish: ImportFinish,
  source: ImportValueSource,
  available: ImportFinish[] | null | undefined
): 'ok' | 'unlisted_file' | 'rejected' {
  if (isFinishListed(finish, available)) return 'ok'
  return source === 'file' ? 'unlisted_file' : 'rejected'
}

// ---------------------------------------------------------------------------
// Building rows and copies (contract §2, §4)
// ---------------------------------------------------------------------------

/** The slice of a resolved source line that copy building needs. */
export interface ImportCopyCandidate {
  sourceIndex: number
  qty: number
  file: ImportCopyFileValues
}

/**
 * Copies for one row, ordered by source line ascending then in line order, so the
 * preview and the write path agree on what "copy 2" is. Each line contributes up
 * to 100 copies. The file's values are copied; nothing is defaulted here.
 */
export function buildRowCopies(candidates: ImportCopyCandidate[]): ImportCopy[] {
  const ordered = candidates
    .map((candidate, position) => ({ candidate, position }))
    .sort((a, b) => a.candidate.sourceIndex - b.candidate.sourceIndex || a.position - b.position)

  const copies: ImportCopy[] = []
  for (const { candidate } of ordered) {
    const count = Math.max(0, Math.min(candidate.qty, MAX_COPIES_PER_LINE))
    for (let i = 0; i < count; i++) {
      copies.push({
        index: copies.length,
        sourceLine: candidate.sourceIndex,
        file: { ...candidate.file },
        owner: {},
      })
    }
  }
  return copies
}

export type ImportRowKind = 'collection' | 'deck' | 'text'

/**
 * Row key, from the FILE's values only. Collection: printing|finish|language.
 * Deck CSV: printing|finish. Text deck: printing|text. A blank file finish keys
 * as nonfoil and a blank language as en, for key purposes only.
 */
export function buildRowKey(
  candidate: { scryfallId: string; file: ImportCopyFileValues },
  kind: ImportRowKind
): string {
  if (kind === 'text') return `${candidate.scryfallId}|text`
  const finish = candidate.file.finish ?? 'nonfoil'
  if (kind === 'deck') return `${candidate.scryfallId}|${finish}`
  return `${candidate.scryfallId}|${finish}|${candidate.file.language ?? 'en'}`
}

// ---------------------------------------------------------------------------
// Resolving a copy (contract §3)
// ---------------------------------------------------------------------------

/** Owner, then file, then defaults. Computed every time; nothing is stored. */
export function resolveCopy(
  copy: ImportCopy,
  defaults: ImportDefaults,
  availableFinishes: ImportFinish[] | null | undefined
): ResolvedImportCopy {
  const owner = copy.owner
  const file = copy.file

  // Owner edit, then the file's Proxy marker (D-055), then Original.
  const type: ImportCopyType = owner.type ?? (file.proxy === true ? 'proxy' : 'original')

  let finish: ImportFinish
  let finishSource: ImportValueSource
  let finishNote: ResolvedImportCopy['finishNote'] = null
  if (owner.finish !== undefined) {
    finish = owner.finish
    finishSource = 'owner'
  } else if (file.finish !== undefined) {
    finish = file.finish
    finishSource = 'file'
    if (!isFinishListed(finish, availableFinishes)) finishNote = 'unlisted'
  } else {
    finish = pickFallbackFinish(defaults.finish, availableFinishes)
    finishSource = 'default'
    if (finish !== defaults.finish) finishNote = 'fallback'
  }

  let heldCondition: ImportCondition
  let conditionSource: ImportValueSource
  if (owner.condition !== undefined) {
    heldCondition = owner.condition
    conditionSource = 'owner'
  } else if (file.condition !== undefined) {
    heldCondition = file.condition
    conditionSource = 'file'
  } else {
    heldCondition = defaults.condition
    conditionSource = 'default'
  }

  let language: ImportLanguage
  let languageSource: ImportValueSource
  if (owner.language !== undefined) {
    language = owner.language
    languageSource = 'owner'
  } else if (file.language !== undefined) {
    language = file.language
    languageSource = 'file'
  } else {
    language = defaults.language
    languageSource = 'default'
  }

  return {
    index: copy.index,
    type,
    finish,
    finishNote,
    condition: type === 'original' ? heldCondition : null,
    heldCondition,
    language,
    sources: {
      type: owner.type !== undefined ? 'owner' : 'default',
      finish: finishSource,
      condition: conditionSource,
      language: languageSource,
    },
  }
}

export function resolveRowCopies(
  row: Pick<ImportRow, 'copies' | 'availableFinishes'>,
  defaults: ImportDefaults,
  edits?: ImportCopyEdits,
  rowKey?: string
): ResolvedImportCopy[] {
  const rowEdits = rowKey !== undefined ? edits?.[rowKey] : undefined
  return row.copies.map((copy) =>
    resolveCopy(
      rowEdits?.[copy.index] ? { ...copy, owner: { ...copy.owner, ...rowEdits[copy.index] } } : copy,
      defaults,
      row.availableFinishes
    )
  )
}

/** Apply the edits map to a row's copies (returns new copies with `owner` filled). */
export function applyEditsToRow(row: ImportRow, edits?: ImportCopyEdits): ImportRow {
  const rowEdits = edits?.[row.rowKey]
  if (!rowEdits) return row
  return {
    ...row,
    copies: row.copies.map((copy) =>
      rowEdits[copy.index] ? { ...copy, owner: { ...copy.owner, ...rowEdits[copy.index] } } : copy
    ),
  }
}

// ---------------------------------------------------------------------------
// Owner actions (pure; return a new edits map)
// ---------------------------------------------------------------------------

export function setCopyField<K extends keyof ImportCopyOwnerEdits>(
  edits: ImportCopyEdits,
  rowKey: string,
  index: number,
  field: K,
  value: NonNullable<ImportCopyOwnerEdits[K]>
): ImportCopyEdits {
  const row = edits[rowKey] ?? {}
  return {
    ...edits,
    [rowKey]: { ...row, [index]: { ...(row[index] ?? {}), [field]: value } },
  }
}

function withCopyPatch(
  edits: ImportCopyEdits,
  rowKey: string,
  index: number,
  patch: ImportCopyOwnerEdits
): ImportCopyEdits {
  if (Object.keys(patch).length === 0) return edits
  const row = edits[rowKey] ?? {}
  return { ...edits, [rowKey]: { ...row, [index]: { ...(row[index] ?? {}), ...patch } } }
}

/** Which fields a copy of this type shows (and therefore carries). */
export function visibleFields(type: ImportCopyType): {
  language: boolean
  finish: boolean
  condition: boolean
} {
  return {
    language: type !== 'unsleeved',
    finish: type !== 'proxy',
    condition: type === 'original',
  }
}

/** "Make all copies like copy 1": copies copy 1's visible fields only. Copy 1 itself is not edited. */
export function applyCopyOneToAll(
  edits: ImportCopyEdits,
  row: ImportRow,
  defaults: ImportDefaults
): ImportCopyEdits {
  if (row.copies.length < 2) return edits
  const rowWithEdits = applyEditsToRow(row, edits)
  const first = resolveCopy(rowWithEdits.copies[0], defaults, row.availableFinishes)
  const visible = visibleFields(first.type)

  const patch: ImportCopyOwnerEdits = { type: first.type }
  if (visible.language) patch.language = first.language
  if (visible.finish && isFinishListed(first.finish, row.availableFinishes)) patch.finish = first.finish
  if (visible.condition && first.condition) patch.condition = first.condition

  let next = edits
  for (let i = 1; i < row.copies.length; i++) {
    next = withCopyPatch(next, row.rowKey, row.copies[i].index, patch)
  }
  return next
}

export interface BulkPatch {
  type?: ImportCopyType
  finish?: ImportFinish
  condition?: ImportCondition
  language?: ImportLanguage
}

export interface BulkResult {
  edits: ImportCopyEdits
  /** Copies where at least one requested field was applied. */
  applied: number
  /** Selected copies where nothing requested could be applied. */
  skipped: number
}

/**
 * Apply a bulk patch to every copy of the selected rows. Type applies to all;
 * language to Original and Proxy; finish to Original and Unsleeved, and only where
 * the printing lists it; condition to Originals. A copy nothing applies to is left
 * exactly as it was (no edit recorded).
 */
export function applyBulk(
  edits: ImportCopyEdits,
  rows: ImportRow[],
  selection: ReadonlySet<string> | string[],
  patch: BulkPatch,
  defaults: ImportDefaults
): BulkResult {
  const selected = selection instanceof Set ? selection : new Set(selection)
  let next = edits
  let applied = 0
  let skipped = 0

  for (const row of rows) {
    if (!selected.has(row.rowKey)) continue
    const withEdits = applyEditsToRow(row, edits)
    for (const copy of withEdits.copies) {
      const current = resolveCopy(copy, defaults, row.availableFinishes)
      const type = patch.type ?? current.type
      const visible = visibleFields(type)
      const copyPatch: ImportCopyOwnerEdits = {}

      if (patch.type !== undefined) copyPatch.type = patch.type
      if (patch.language !== undefined && visible.language) copyPatch.language = patch.language
      if (
        patch.finish !== undefined &&
        visible.finish &&
        isFinishListed(patch.finish, row.availableFinishes)
      ) {
        copyPatch.finish = patch.finish
      }
      if (patch.condition !== undefined && visible.condition) copyPatch.condition = patch.condition

      if (Object.keys(copyPatch).length === 0) {
        skipped++
      } else {
        applied++
        next = withCopyPatch(next, row.rowKey, copy.index, copyPatch)
      }
    }
  }
  return { edits: next, applied, skipped }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export interface RowTag {
  kind: 'type' | 'finish' | 'condition' | 'language'
  /** Short label without a count: Proxy, Unsleeved, Foil, Etched, Non-foil, LP, JA ... */
  label: string
  /** Number of copies it applies to, shown only when `all` is false. */
  count: number
  all: boolean
}

export interface RowTagSummary {
  tags: RowTag[]
  /** Tags beyond the cap of 3. */
  overflow: number
}

export const FINISH_LABELS: Record<ImportFinish, string> = {
  nonfoil: 'Non-foil',
  foil: 'Foil',
  etched: 'Etched',
}
export const CONDITION_SHORT_LABELS: Record<ImportCondition, string> = {
  near_mint: 'NM',
  lightly_played: 'LP',
  moderately_played: 'MP',
  heavily_played: 'HP',
  damaged: 'DMG',
}
export const CONDITION_LABELS: Record<ImportCondition, string> = {
  near_mint: 'Near Mint',
  lightly_played: 'Lightly Played',
  moderately_played: 'Moderately Played',
  heavily_played: 'Heavily Played',
  damaged: 'Damaged',
}

export function tagDisplayText(tag: RowTag): string {
  return tag.all ? tag.label : `${tag.count} ${tag.label}`
}

/**
 * Tags for the collapsed row: only values that differ from the defaults. Order:
 * type, finish, condition, language. Finish counts Originals and Unsleeved lines;
 * condition counts Originals; language counts Originals and Proxies. At most 3.
 */
export function summariseRowTags(
  resolved: ResolvedImportCopy[],
  defaults: ImportDefaults
): RowTagSummary {
  const tags: RowTag[] = []
  const total = resolved.length
  if (total === 0) return { tags, overflow: 0 }

  const count = <T,>(
    pool: ResolvedImportCopy[],
    pick: (copy: ResolvedImportCopy) => T,
    differs: (value: T) => boolean
  ) => {
    const byValue = new Map<T, number>()
    for (const copy of pool) {
      const value = pick(copy)
      if (differs(value)) byValue.set(value, (byValue.get(value) ?? 0) + 1)
    }
    return byValue
  }

  const proxies = resolved.filter((c) => c.type === 'proxy').length
  if (proxies > 0) tags.push({ kind: 'type', label: 'Proxy', count: proxies, all: proxies === total })
  const unsleeved = resolved.filter((c) => c.type === 'unsleeved').length
  if (unsleeved > 0) {
    tags.push({ kind: 'type', label: 'Unsleeved', count: unsleeved, all: unsleeved === total })
  }

  const finishPool = resolved.filter((c) => c.type !== 'proxy')
  for (const [value, n] of count(finishPool, (c) => c.finish, (v) => v !== defaults.finish)) {
    tags.push({ kind: 'finish', label: FINISH_LABELS[value], count: n, all: n === total })
  }

  const conditionPool = resolved.filter((c) => c.type === 'original')
  for (const [value, n] of count(
    conditionPool,
    (c) => c.heldCondition,
    (v) => v !== defaults.condition
  )) {
    tags.push({ kind: 'condition', label: CONDITION_SHORT_LABELS[value], count: n, all: n === total })
  }

  const languagePool = resolved.filter((c) => c.type !== 'unsleeved')
  for (const [value, n] of count(languagePool, (c) => c.language, (v) => v !== defaults.language)) {
    tags.push({ kind: 'language', label: value.toUpperCase(), count: n, all: n === total })
  }

  return { tags: tags.slice(0, 3), overflow: Math.max(0, tags.length - 3) }
}

/** One side of the bulk Original/Proxy toggle is pressed when every copy agrees. */
export function bulkTypeState(
  resolved: ResolvedImportCopy[]
): ImportCopyType | 'mixed' {
  if (resolved.length === 0) return 'mixed'
  const first = resolved[0].type
  return resolved.every((c) => c.type === first) ? first : 'mixed'
}

/** Counts that depend on the printings' finish lists (the screen's one-line notices). */
export function countFinishNotices(
  rows: ImportRow[],
  defaults: ImportDefaults,
  edits?: ImportCopyEdits
): Pick<ImportValueNotices, 'unlistedFinish' | 'defaultFinishFellBack'> {
  let unlistedFinish = 0
  let defaultFinishFellBack = 0
  for (const row of rows) {
    for (const copy of resolveRowCopies(row, defaults, edits, row.rowKey)) {
      if (copy.finishNote === 'unlisted') unlistedFinish++
      if (copy.finishNote === 'fallback') defaultFinishFellBack++
    }
  }
  return { unlistedFinish, defaultFinishFellBack }
}

// ---------------------------------------------------------------------------
// Validation (server side, contract §10)
// ---------------------------------------------------------------------------

export interface ImportValidationRow {
  rowKey: string
  qty: number
  copies?: ImportCopy[]
}

/** Returns a list of problems; an empty list means the defaults and edits are acceptable. */
export function validateImportInput(
  rows: ImportValidationRow[],
  defaults: unknown,
  edits: unknown,
  options: { allowUnsleeved: boolean; requireCopies?: boolean }
): string[] {
  const problems: string[] = []

  const d = defaults as Partial<ImportDefaults> | undefined
  if (!d || typeof d !== 'object') {
    problems.push('defaults are required')
  } else {
    if (!isImportFinish(d.finish)) problems.push('defaults.finish is not a known finish')
    if (!isImportCondition(d.condition)) problems.push('defaults.condition is not a known condition')
    if (!isImportLanguage(d.language)) problems.push('defaults.language is not a language code')
  }

  let total = 0
  const qtyByKey = new Map<string, number>()
  for (const row of rows) {
    if (!Number.isInteger(row.qty) || row.qty < 0) {
      problems.push(`row ${row.rowKey}: invalid quantity`)
      continue
    }
    if (row.copies && row.copies.length !== row.qty) {
      problems.push(`row ${row.rowKey}: copies (${row.copies.length}) does not match quantity (${row.qty})`)
    }
    if (options.requireCopies && !row.copies) problems.push(`row ${row.rowKey}: copies are required`)
    qtyByKey.set(row.rowKey, row.qty)
    total += row.qty
  }
  if (total > MAX_IMPORT_COPIES) {
    problems.push(`too many copies in one import (${total}; the limit is ${MAX_IMPORT_COPIES})`)
  }

  if (edits !== undefined && edits !== null) {
    if (typeof edits !== 'object' || Array.isArray(edits)) {
      problems.push('copyEdits must be an object')
    } else {
      for (const [rowKey, perIndex] of Object.entries(edits as Record<string, unknown>)) {
        const qty = qtyByKey.get(rowKey)
        if (qty === undefined) {
          problems.push(`copyEdits names an unknown row ${rowKey}`)
          continue
        }
        if (!perIndex || typeof perIndex !== 'object') {
          problems.push(`row ${rowKey}: edits must be an object`)
          continue
        }
        for (const [indexText, fields] of Object.entries(perIndex as Record<string, unknown>)) {
          const index = Number(indexText)
          if (!Number.isInteger(index) || index < 0 || index >= qty) {
            problems.push(`row ${rowKey}: copy index ${indexText} is outside the row`)
            continue
          }
          const f = fields as ImportCopyOwnerEdits | null
          if (!f || typeof f !== 'object') {
            problems.push(`row ${rowKey} copy ${index}: edits must be an object`)
            continue
          }
          if (f.type !== undefined && (!isImportCopyType(f.type) || (f.type === 'unsleeved' && !options.allowUnsleeved))) {
            problems.push(`row ${rowKey} copy ${index}: unknown type`)
          }
          if (f.finish !== undefined && !isImportFinish(f.finish)) {
            problems.push(`row ${rowKey} copy ${index}: unknown finish`)
          }
          if (f.condition !== undefined && !isImportCondition(f.condition)) {
            problems.push(`row ${rowKey} copy ${index}: unknown condition`)
          }
          if (f.language !== undefined && !isImportLanguage(f.language)) {
            problems.push(`row ${rowKey} copy ${index}: unknown language`)
          }
        }
      }
    }
  }
  return problems
}

/**
 * Check every Original, Proxy and Unsleeved copy's finish against its printing's
 * Scryfall list. Returns problems (owner-chosen unlisted finishes) and the count
 * of file finishes that were kept although unlisted.
 */
export function validateRowFinishes(
  rows: Array<{
    rowKey: string
    availableFinishes: ImportFinish[] | null
    resolved: ResolvedImportCopy[]
  }>
): { problems: string[]; unlistedFinish: number } {
  const problems: string[] = []
  let unlistedFinish = 0
  for (const row of rows) {
    for (const copy of row.resolved) {
      const verdict = validateCopyFinish(copy.finish, copy.sources.finish, row.availableFinishes)
      if (verdict === 'rejected') {
        problems.push(`row ${row.rowKey} copy ${copy.index}: ${copy.finish} is not listed by Scryfall for this printing`)
      } else if (verdict === 'unlisted_file') {
        unlistedFinish++
      }
    }
  }
  return { problems, unlistedFinish }
}

/**
 * The deck body is built by the client, so the file values travel with each card.
 * Check each is a value the app stores (never trust a client string). Returns problems.
 */
export function validateCopyFileValues(rowKey: string, copies: ImportCopy[]): string[] {
  const problems: string[] = []
  copies.forEach((copy, position) => {
    const file = copy?.file as ImportCopyFileValues | undefined
    if (!file || typeof file !== 'object') {
      problems.push(`row ${rowKey} copy ${position}: file values are required`)
      return
    }
    if (copy.index !== position) problems.push(`row ${rowKey} copy ${position}: index must be ${position}`)
    if (file.finish !== undefined && !isImportFinish(file.finish)) {
      problems.push(`row ${rowKey} copy ${position}: unknown file finish`)
    }
    if (file.condition !== undefined && !isImportCondition(file.condition)) {
      problems.push(`row ${rowKey} copy ${position}: unknown file condition`)
    }
    if (file.language !== undefined && !isImportLanguage(file.language)) {
      problems.push(`row ${rowKey} copy ${position}: unknown file language`)
    }
    if (file.proxy !== undefined && typeof file.proxy !== 'boolean') {
      problems.push(`row ${rowKey} copy ${position}: unknown file proxy value`)
    }
  })
  return problems
}

// ---------------------------------------------------------------------------
// Mapping into RPC rows (contract §7)
// ---------------------------------------------------------------------------

export interface CollectionCopyContext {
  cardId: number
  scryfallId: string
  purchasePrice?: number | null
  acquiredAt?: string
}

/** One physical copy -> one `insert_user_copies` row. Proxies store no condition. */
export function toCollectionRpcRow(
  copy: ResolvedImportCopy,
  context: CollectionCopyContext
): CollectionRpcRow {
  const row: CollectionRpcRow = {
    card_id: context.cardId,
    printing_id: context.scryfallId,
    finish: copy.finish,
    language: copy.language,
    is_proxy: copy.type === 'proxy',
    card_condition: copy.type === 'proxy' ? null : copy.heldCondition,
    source_tag: 'manabox',
    location_id: null,
  }
  if (context.purchasePrice != null) row.purchase_price = context.purchasePrice
  if (context.acquiredAt) row.acquired_at = context.acquiredAt
  return row
}

export interface DeckCopyContext {
  cardId: number | null
  cardName: string
  scryfallId: string
  setCode: string
  categories: string
}

/**
 * One copy -> one `replace_deck_with_new_cards` row. Unsleeved is a planned slot
 * (no copy created or linked) that remembers only the finish; language and
 * condition are not sent for it.
 */
export function toDeckRpcRow(copy: ResolvedImportCopy, context: DeckCopyContext): DeckImportRpcRow {
  const base = {
    card_name: context.cardName,
    printing_id: context.scryfallId,
    scryfall_id: context.scryfallId,
    set_code: context.setCode,
    categories: context.categories,
    is_commander: false,
    finish: copy.finish,
  }
  if (copy.type === 'unsleeved') {
    return { ...base, card_id: null, is_proxy: false, is_maybeboard: true }
  }
  return {
    ...base,
    card_id: context.cardId,
    is_proxy: copy.type === 'proxy',
    is_maybeboard: false,
    language: copy.language,
    card_condition: copy.type === 'proxy' ? null : copy.heldCondition,
    source_tag: 'deck-import',
  }
}

/** Thrown by the write paths when the request is not acceptable. Routes answer 400; nothing was written. */
export class ImportValidationError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`Invalid import request: ${problems.slice(0, 5).join('; ')}`)
    this.name = 'ImportValidationError'
    this.problems = problems
  }
}
