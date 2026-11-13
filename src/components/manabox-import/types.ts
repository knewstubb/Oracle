import type {
  ImportCopyEdits,
  ImportCopyType,
  ImportDefaults,
  ImportRow,
  ImportValueNotices,
} from '../../../docs/oracle/contracts/import-row-editing.types'
import { INITIAL_IMPORT_DEFAULTS } from '../../../docs/oracle/contracts/import-row-editing.types'
import type { ImportDestination, ImportPlacementResult } from '../../../docs/oracle/contracts/know-where-cards-are.types'
import { resolveRowCopies } from '@/lib/import-copies'
import { isGenericBasic } from '@/lib/basic-lands'
import type { ManaBoxSkippedToken, ManaBoxUnmatchedLine } from '../../../docs/oracle/contracts/manabox-import.types'

export type ImportKind = 'collection' | 'deck'
export type ImportSource = 'csv' | 'text'

export type CopyType = ImportCopyType

export type RowFilter = 'all' | 'proxy' | 'unsleeved' | 'basic' | 'deck' | 'maybeboard'

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
        /** Plain-words notes about the file (import-formats S-5). */
        notes?: string[]
        /** Commanders the file marks, for pre-ticking the picker (import-formats S-6). */
        commanders?: Array<{ name: string; scryfallId: string | null }>
        /** The companion the file marks (T-62 S-7), to pre-tick. */
        companion?: { name: string; scryfallId: string | null }
      }
      deckName: string
      format: string
      /** Art chosen for generic basics on the review screen, by row key (image only). */
      genericArt?: Record<string, { scryfallId: string }>
      /** Commander chosen on the review screen; saved on the new deck after the import. */
      commander: { name: string; scryfallId: string | null } | null
      /** Second commander (Partner / Background), chosen on the review screen (T-62). */
      second?: { name: string; scryfallId: string | null } | null
      /** Companion, chosen on the review screen; sits outside the 100 cards (T-62). */
      companion?: { name: string; scryfallId: string | null } | null
      /** The "Importing as" bar. Held here only; never saved. */
      defaults: ImportDefaults
      /** Collection import only: where the whole import goes. Held here only, so it resets to Unsorted every import. */
      destination?: ImportDestination
      /** "Ignore basic lands" switch in the Importing as bar. On by default. */
      ignoreBasics?: boolean
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
        foils?: number
        unrecognisedValues?: number
        unlistedFinish?: number
        genericNotes?: string[]
        unmatched: ManaBoxUnmatchedLine[]
        /** Collection import: where the copies went, straight from the server. */
        placement?: ImportPlacementResult
        deckId?: number
      }
      deckName: string
      format: string
      /** Deck import only: the commander that was saved on the new deck, if any. */
      commanderName?: string
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

/**
 * Deck imports: is this row a GENERIC basic (a deck slot with no collection copy)? Only a basic
 * land whose line named no printing. Independent of the "Generic basics" display toggle.
 */
export function isGenericRow(row: UiPreviewRow, kind: ImportKind): boolean {
  return kind === 'deck' && row.board !== 'maybeboard' && isGenericBasic(row.cardName, row.printingGiven ?? true)
}

/** Compute footer totals from review rows (generic basics create no copies; specific basics count as normal cards). */
export function computeTotals(
  rows: UiPreviewRow[],
  kind: ImportKind,
  defaults: ImportDefaults,
  edits: ImportCopyEdits
): {
  /** Main-deck cards (copies). Maybeboard cards are counted separately. */
  cards: number
  tracked: number
  maybeboard: number
  /** Generic basics only (no collection copy). */
  basics: number
  /** Basic lands that name a printing: real copies, already inside `tracked`. */
  specificBasics: number
  proxies: number
  unsleeved: number
  foil: number
} {
  let cards = 0
  let maybeboard = 0
  let basics = 0
  let specificBasics = 0
  let proxies = 0
  let unsleeved = 0
  let foil = 0

  for (const row of rows) {
    // Maybeboard cards add no copies, so they never count as proxies, unsleeved or foil (D-022).
    if (row.board === 'maybeboard') {
      maybeboard += row.qty
      continue
    }
    cards += row.qty
    if (isGenericRow(row, kind)) {
      basics += row.qty
      continue
    }
    if (kind === 'deck' && row.isBasicLand) specificBasics += row.qty
    for (const copy of resolveRowCopies(row, defaults, edits, row.rowKey)) {
      if (copy.type === 'proxy') proxies++
      else if (copy.type === 'unsleeved') unsleeved++
      if (copy.type !== 'proxy' && copy.finish !== 'nonfoil') foil++
    }
  }

  return { cards, tracked: cards - basics, maybeboard, basics, specificBasics, proxies, unsleeved, foil }
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
    printingGiven: row.printingGiven,
    ...(row.board === 'maybeboard' ? { board: 'maybeboard' as const } : {}),
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
    cardCount: cards.filter((c) => !('board' in c)).reduce((sum, c) => sum + c.quantity, 0),
    colourIdentity: '',
  }
}
