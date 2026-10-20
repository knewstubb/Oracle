/**
 * Contract types for ManaBox import.
 *
 * Source: docs/oracle/contracts/manabox-import.md
 * Decisions: D-044 to D-052
 */

import type { NormalizedCard, NormalizedDeck } from '@/lib/deck-normalizer'
import type {
  ImportCopyEdits,
  ImportDefaults,
  ImportRow,
  ImportValueNotices,
} from './import-row-editing.types'

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Finish values as they appear in a ManaBox CSV file.
 */
export type ManaBoxCsvFinish = 'normal' | 'foil' | 'etched'

/**
 * A single row from a ManaBox collection or deck CSV export.
 *
 * Older exports omit `Signed` and `Proxy`. The importer must treat every field
 * except `Name`, `Set code`, `Collector number`, `Foil`, `Quantity` and
 * `Scryfall ID` as optional.
 */
export interface ManaBoxCsvRow {
  name: string
  setCode: string
  setName?: string
  collectorNumber: string
  finish: ManaBoxCsvFinish
  rarity?: string
  quantity: number
  manaBoxId?: string
  scryfallId: string
  purchasePrice?: number
  misprint?: boolean
  altered?: boolean
  signed?: boolean
  condition?: string
  language?: string
  proxy?: boolean
  purchasePriceCurrency?: string
  added?: string
}

// ---------------------------------------------------------------------------
// Text export parsing
// ---------------------------------------------------------------------------

/**
 * A single line from a ManaBox text deck export.
 *
 * Example: `1 Adventurous Eater // Have a Bite (SOS) 72`
 */
export interface ManaBoxTextLine {
  quantity: number
  cardName: string
  setCode: string
  collectorNumber: string
  /** Original line text, kept for unmatched-line reporting. */
  rawLine: string
  /** 1-based line number in the file. */
  lineNumber: number
}

// ---------------------------------------------------------------------------
// Identity resolution
// ---------------------------------------------------------------------------

/**
 * Result of resolving one ManaBox row or text line to a printing.
 */
export interface ResolvedManaBoxCard {
  /** Canonical oracle_id for the card identity. */
  oracleId: string
  /** Specific printing (scryfall_id). */
  scryfallId: string
  /** Lower-cased set code from the file or resolution. */
  setCode: string
  /** Display name stored on user_cards and deck_cards. */
  cardName: string
  /** Mapped finish for user_copies.finish. */
  finish: 'nonfoil' | 'foil' | 'etched'
  /** 1-based source row/line number for error reporting. */
  sourceIndex: number
}

// ---------------------------------------------------------------------------
// Token / unmatched reporting
// ---------------------------------------------------------------------------

/**
 * Reason a row or line could not be resolved or parsed.
 */
export type ManaBoxUnmatchedReason = 'no_card' | 'bad_line' | 'unknown_id'

/**
 * An unresolved row or line surfaced to the import screen.
 */
export interface ManaBoxUnmatchedLine {
  sourceIndex: number
  rawLine: string
  cardName?: string
  setCode?: string
  collectorNumber?: string
  reason: ManaBoxUnmatchedReason
}

/**
 * A token line that was skipped.
 */
export interface ManaBoxSkippedToken {
  sourceIndex: number
  rawLine: string
  cardName?: string
}

// ---------------------------------------------------------------------------
// Per-row import overrides
// ---------------------------------------------------------------------------

// Superseded by import-row-editing.types.ts (rev 2026-10-20): ManaBoxProxyCounts and
// ManaBoxRowSplit(s) are removed; per-copy type, finish, condition and language are
// `ImportCopyEdits` + `ImportDefaults`.

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/**
 * Non-writing preview response for collection and deck imports. Rows are
 * `ImportRow`s (one per printing/finish/language group, each holding its copies).
 */
export interface ManaBoxPreviewResponse {
  fileName: string
  totalLines: number
  rows: ImportRow[]
  skippedTokens: ManaBoxSkippedToken[]
  unmatched: ManaBoxUnmatchedLine[]
  /** Counted notices known at preview time (unrecognised file values). */
  notices: Pick<
    ImportValueNotices,
    'unrecognisedCondition' | 'unrecognisedLanguage' | 'unrecognisedFinish'
  >
}

// ---------------------------------------------------------------------------
// Import options
// ---------------------------------------------------------------------------

/**
 * Body for a ManaBox collection import (add-only, D-050). The server re-reads the
 * file; the client sends only defaults and the owner's per-copy edits.
 */
export interface ManaBoxCollectionImportBody {
  /** Raw CSV content, or supplied via multipart `file`. */
  csvContent?: string
  defaults: ImportDefaults
  copyEdits?: ImportCopyEdits
}

/**
 * Body for a ManaBox deck import. Each card carries `rowKey` and `copies`
 * (see `DeckImportCardV2` in import-row-editing.types.ts).
 */
export interface ManaBoxDeckImportBody {
  deck: NormalizedDeck
  name: string
  format?: string
  /** Convert basic lands to generic, untracked slots. Default true (D-048). */
  convertBasicLandsToGeneric?: boolean
  defaults: ImportDefaults
  copyEdits?: ImportCopyEdits
}

// ---------------------------------------------------------------------------
// Parsed import payload
// ---------------------------------------------------------------------------

/**
 * Internal representation of a ManaBox deck file after parsing and resolution.
 */
export interface ManaBoxParsedDeck {
  name: string
  format: string
  cards: ManaBoxNormalizedCard[]
  unmatched: ManaBoxUnmatchedLine[]
}

/**
 * A normalized card extended with the fields needed for ManaBox identity
 * resolution and per-row overrides.
 */
export interface ManaBoxNormalizedCard extends NormalizedCard {
  collectorNumber?: string
  /** Row key and per-copy file values (import-row-editing.types.ts). */
  rowKey?: string
  copies?: import('./import-row-editing.types').ImportCopy[]
  /** True when the slot should become a generic basic land. */
  isGenericBasicLand?: boolean
}

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------

/**
 * Summary returned for a collection import.
 */
export interface ManaBoxCollectionImportSummary {
  inserted: number
  skipped: number
  /** Always 0 for add-only ManaBox collection import (D-050). */
  removed: number
  sourceTag: 'manabox'
  errors: string[]
  unmatched: ManaBoxUnmatchedLine[]
  durationMs: number
  /** Copies whose file finish Scryfall does not list for the printing (kept, flagged). */
  unlistedFinish?: number
}

/**
 * Summary returned for a deck import.
 */
export interface ManaBoxDeckImportSummary {
  deckId: number
  allocationSummary: {
    assigned: number
    shortfall: number
    errors: string[]
    unmatched: ManaBoxUnmatchedLine[]
  }
  /** Copies whose file finish Scryfall does not list (kept as in the file). */
  unlistedFinish?: number
}

// ---------------------------------------------------------------------------
// Set commander
// ---------------------------------------------------------------------------

/**
 * PATCH /api/decks/[id] body extensions for setting a commander.
 */
export interface PatchDeckCommanderBody {
  build_id?: string | null
  commander_id?: string | null
  commander_name?: string | null
  commander_scryfall_id?: string | null
}
