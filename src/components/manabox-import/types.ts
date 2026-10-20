import type { ManaBoxPreviewRow, ManaBoxRowSplit, ManaBoxSkippedToken, ManaBoxUnmatchedLine } from '../../../docs/oracle/contracts/manabox-import.types'

export type ImportKind = 'collection' | 'deck'
export type ImportSource = 'csv' | 'text'

export type CopyType = 'original' | 'proxy' | 'unsleeved'

export type RowFilter = 'all' | 'proxy' | 'unsleeved' | 'basic'

/** Per-row choices held in the import UI. */
export interface RowChoices {
  split: ManaBoxRowSplit
  /** Text files only: override finish to foil for every copy on the row. */
  foil: boolean
}

/** A preview row augmented with the owner's choices. */
export interface UiPreviewRow extends ManaBoxPreviewRow {
  /** Stable id derived from the combined key. */
  id: string
  choices: RowChoices
}

export type ImportStep =
  | { status: 'idle' }
  | { status: 'checking'; file: File }
  | {
      status: 'review'
      file: File
      source: ImportSource
      preview: {
        fileName: string
        totalLines: number
        rows: UiPreviewRow[]
        skippedTokens: ManaBoxSkippedToken[]
        unmatched: ManaBoxUnmatchedLine[]
      }
      deckName: string
      format: string
      genericBasics: boolean
      filter: RowFilter
      query: string
      selectedIds: Set<string>
    }
  | { status: 'importing'; file: File; cancellable: boolean; processed: number; total: number }
  | { status: 'failed'; error: string; file: File; previousStatus: ImportStep['status'] }
  | {
      status: 'done'
      summary: {
        inserted: number
        skipped: number
        basics: number
        proxies: number
        unsleeved: number
        unmatched: ManaBoxUnmatchedLine[]
        deckId?: number
      }
      deckName: string
      format: string
    }

export interface CollectionImportState {
  open: boolean
  step: ImportStep
}

export interface DeckImportDialogState {
  open: boolean
  step: ImportStep
}

/** Build a stable id for a preview row. */
export function rowId(row: ManaBoxPreviewRow): string {
  return `${row.scryfallId}:${row.finish}:${row.language ?? 'en'}:${row.sourceIndex}`
}

/** A split where every copy is Original. */
export function defaultSplit(qty: number): ManaBoxRowSplit {
  return { originalCount: qty, proxyCount: 0, unsleevedCount: 0 }
}

/** Sum of selected counts in a split. */
export function splitTotal(split: ManaBoxRowSplit): number {
  return split.originalCount + split.proxyCount + split.unsleevedCount
}

/** Build a split where every copy is the given type. */
export function allOfType(qty: number, type: CopyType): ManaBoxRowSplit {
  return {
    originalCount: type === 'original' ? qty : 0,
    proxyCount: type === 'proxy' ? qty : 0,
    unsleevedCount: type === 'unsleeved' ? qty : 0,
  }
}

/** True when the split has more than one type selected. */
export function isSplit(split: ManaBoxRowSplit): boolean {
  let on = 0
  if (split.originalCount > 0) on++
  if (split.proxyCount > 0) on++
  if (split.unsleevedCount > 0) on++
  return on > 1
}

/** Return the count for a type in a split. */
export function splitCount(split: ManaBoxRowSplit, type: CopyType): number {
  switch (type) {
    case 'original':
      return split.originalCount
    case 'proxy':
      return split.proxyCount
    case 'unsleeved':
      return split.unsleevedCount
  }
}

/**
 * Set a type's count. Raising takes copies from Original first, then from the
 * other type; lowering returns copies to Original.
 */
export function setSplitCount(
  split: ManaBoxRowSplit,
  type: CopyType,
  value: number,
  qty: number
): ManaBoxRowSplit {
  const clamped = Math.max(0, Math.min(qty, value))
  if (type === 'original') {
    return { originalCount: qty, proxyCount: 0, unsleevedCount: 0 }
  }
  const otherKey = type === 'proxy' ? 'unsleevedCount' : 'proxyCount'
  const other = Math.min(split[otherKey], qty - clamped)
  const result: ManaBoxRowSplit = {
    originalCount: qty - clamped - other,
    proxyCount: 0,
    unsleevedCount: 0,
  }
  result[type === 'proxy' ? 'proxyCount' : 'unsleevedCount'] = clamped
  result[otherKey] = other
  return result
}

/** Human-readable reason text for an unmatched line. */
export function unmatchedReasonText(reason: ManaBoxUnmatchedLine['reason']): string {
  switch (reason) {
    case 'no_card':
      return 'no such card'
    case 'bad_line':
      return 'unreadable line'
    case 'unknown_id':
      return 'unknown card ID'
    default:
      return 'unknown error'
  }
}

/** Format source index for display ("Row 66" / "Line 89"). */
export function sourceLabel(source: ImportSource, index: number): string {
  return source === 'csv' ? `Row ${index}` : `Line ${index}`
}

/** Compute footer totals from review rows. */
export function computeTotals(
  rows: UiPreviewRow[],
  kind: ImportKind,
  genericBasics: boolean
): {
  cards: number
  tracked: number
  basics: number
  proxies: number
  unsleeved: number
  foil: number
} {
  let cards = 0
  let basics = 0
  let proxies = 0
  let unsleeved = 0
  let foil = 0

  for (const row of rows) {
    const qty = row.qty
    cards += qty

    const isBasic = row.isBasicLand && kind === 'deck' && genericBasics
    if (isBasic) {
      basics += qty
    } else {
      proxies += row.choices.split.proxyCount
      unsleeved += row.choices.split.unsleevedCount
    }

    if (row.choices.foil) {
      foil += qty
    }
  }

  return { cards, tracked: cards - basics, basics, proxies, unsleeved, foil }
}

/** Convert UI rows into the normalized deck shape the commit route expects. */
export function buildCommitDeck(
  rows: UiPreviewRow[],
  kind: ImportKind,
  genericBasics: boolean
): {
  name: string
  platform: 'manabox'
  platformDeckId: string
  sourceUrl: string
  commander: null
  cards: Array<{
    cardName: string
    scryfallId: string
    oracleId: string
    setCode: string
    collectorNumber?: string
    quantity: number
    typeLine: string
    isCommander: boolean
    isProxy: boolean
    manaCost: null
    colorIdentity: string[]
    sourceCategories: string[]
    finish: 'nonfoil' | 'foil' | 'etched'
    sourceIndex: number
    rowSplit: ManaBoxRowSplit
    isGenericBasicLand: boolean
  }>
  cardCount: number
  colourIdentity: string
} {
  const cards = rows.map((row) => {
    const isBasicGeneric = kind === 'deck' && row.isBasicLand && genericBasics
    return {
      cardName: row.cardName,
      scryfallId: row.scryfallId,
      oracleId: row.oracleId,
      setCode: row.setCode,
      collectorNumber: row.collectorNumber,
      quantity: row.qty,
      typeLine: '',
      isCommander: false,
      isProxy: false,
      manaCost: null,
      colorIdentity: [],
      sourceCategories: [],
      finish: row.choices.foil ? 'foil' : row.finish,
      sourceIndex: row.sourceIndex,
      rowSplit: row.choices.split,
      isGenericBasicLand: isBasicGeneric,
    }
  })

  return {
    name: 'Imported Deck',
    platform: 'manabox' as const,
    platformDeckId: 'manabox-import',
    sourceUrl: '',
    commander: null,
    cards,
    cardCount: cards.reduce((sum, c) => sum + c.quantity, 0),
    colourIdentity: '',
  }
}

/** Build collection proxy counts keyed by source index. */
export function buildProxyCounts(rows: UiPreviewRow[]): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const row of rows) {
    if (row.choices.split.proxyCount > 0) {
      counts[row.sourceIndex] = row.choices.split.proxyCount
    }
  }
  return counts
}
