import type {
  ImportCopyEdits,
  ImportCopyType,
  ImportDefaults,
  ImportRow,
  ImportValueNotices,
} from '../../../docs/oracle/contracts/import-row-editing.types'
import { INITIAL_IMPORT_DEFAULTS } from '../../../docs/oracle/contracts/import-row-editing.types'
import { resolveRowCopies } from '@/lib/import-copies'
import type { ManaBoxSkippedToken, ManaBoxUnmatchedLine } from '../../../docs/oracle/contracts/manabox-import.types'

export type ImportKind = 'collection' | 'deck'
export type ImportSource = 'csv' | 'text'

export type CopyType = ImportCopyType

export type RowFilter = 'all' | 'proxy' | 'unsleeved' | 'basic'

/** A review row is the contract's ImportRow; its immutable `rowKey` is the id. */
export type UiPreviewRow = ImportRow

export type PreviewNotices = Pick<
  ImportValueNotices,
  'unrecognisedCondition' | 'unrecognisedLanguage' | 'unrecognisedFinish'
>

export type ImportStep =
  | { status: 'idle' }
  | { status: 'checking'; file: File; cards?: number }
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
        notices?: PreviewNotices
      }
      deckName: string
      format: string
      genericBasics: boolean
      /** The "Importing as" bar. Held here only; never saved. */
      defaults: ImportDefaults
      /** Owner edits by row key then copy index. */
      copyEdits: ImportCopyEdits
      /** Rows currently expanded (row keys). */
      openRowKeys: Set<string>
      filter: RowFilter
      query: string
      selectedIds: Set<string>
    }
  | { status: 'importing'; file: File; cancellable: boolean; processed: number; total: number; phase?: 'resolving' | 'writing' }
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

export const INITIAL_DEFAULTS: ImportDefaults = { ...INITIAL_IMPORT_DEFAULTS }

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

/** Compute footer totals from review rows (generic basics create no copies). */
export function computeTotals(
  rows: UiPreviewRow[],
  kind: ImportKind,
  genericBasics: boolean,
  defaults: ImportDefaults,
  edits: ImportCopyEdits
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
    cards += row.qty
    if (row.isBasicLand && kind === 'deck' && genericBasics) {
      basics += row.qty
      continue
    }
    for (const copy of resolveRowCopies(row, defaults, edits, row.rowKey)) {
      if (copy.type === 'proxy') proxies++
      else if (copy.type === 'unsleeved') unsleeved++
      if (copy.type !== 'proxy' && copy.finish !== 'nonfoil') foil++
    }
  }

  return { cards, tracked: cards - basics, basics, proxies, unsleeved, foil }
}

/** Convert UI rows into the normalized deck shape the commit route expects. */
export function buildCommitDeck(rows: UiPreviewRow[]) {
  const cards = rows.map((row) => ({
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
    colorIdentity: [] as string[],
    sourceCategories: [] as string[],
    rowKey: row.rowKey,
    sourceIndex: row.sourceIndex,
    // File values only; the owner's edits travel separately and are applied on the server.
    copies: row.copies.map((copy) => ({ index: copy.index, sourceLine: copy.sourceLine, file: copy.file })),
  }))

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
