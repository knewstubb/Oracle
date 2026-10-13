/**
 * Contract types for ManaBox import.
 *
 * Source: docs/oracle/contracts/manabox-import.md
 * Decisions: D-044 to D-052
 */

import type { NormalizedCard, NormalizedDeck } from '@/lib/deck-normalizer'

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
  /** Default nonfoil; the UI offers a per-row Foil checkbox (D-051). */
  isFoil: boolean
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

/**
 * Collection import: number of proxies for a single combined row.
 *
 * The key is the 1-based CSV row index of the first source row in the combined
 * row. Value is 0…qty. Omitted rows default to 0 (all Original).
 */
export type ManaBoxProxyCounts = Record<number, number>

/**
 * Deck import: per-row Original / Proxy / Unsleeved split.
 *
 * `originalCount + proxyCount + unsleevedCount` must equal the row's `qty`.
 * Omitted rows default to `{ originalCount: qty, proxyCount: 0, unsleevedCount: 0 }`.
 */
export interface ManaBoxRowSplit {
  originalCount: number
  proxyCount: number
  unsleevedCount: number
}

export type ManaBoxRowSplits = Record<number, ManaBoxRowSplit>

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/**
 * A combined row returned by the non-writing preview.
 */
export interface ManaBoxPreviewRow {
  /** 1-based index of the first source line/row contributing to this row. */
  sourceIndex: number
  /** All source line/row indices that were combined into this row. */
  sourceLines: number[]
  cardName: string
  setCode: string
  collectorNumber: string
  scryfallId: string
  oracleId: string
  qty: number
  finish: 'nonfoil' | 'foil' | 'etched'
  /**
   * Collection preview only. Different conditions are combined into one preview
   * row, but each stored copy keeps its own condition (D-051).
   */
  condition?: string
  /** Collection preview only. Different languages show as separate rows (D-051). */
  language?: string
  /** True when this row is a basic land eligible for the generic switch. */
  isBasicLand: boolean
}

/**
 * Non-writing preview response for collection and deck imports.
 */
export interface ManaBoxPreviewResponse {
  fileName: string
  totalLines: number
  rows: ManaBoxPreviewRow[]
  skippedTokens: ManaBoxSkippedToken[]
  unmatched: ManaBoxUnmatchedLine[]
}

// ---------------------------------------------------------------------------
// Import options
// ---------------------------------------------------------------------------

/**
 * Body for a ManaBox collection import (add-only, D-050).
 */
export interface ManaBoxCollectionImportBody {
  /** Raw CSV content, or supplied via multipart `file`. */
  csvContent?: string
  /**
   * Per-row proxy count. Key is the 1-based CSV row index.
   * Value is the number of copies (0…qty) that should be proxies.
   * Omitted rows default to 0 proxies (all Original).
   */
  proxyCounts?: ManaBoxProxyCounts
}

/**
 * Body for a ManaBox deck import.
 */
export interface ManaBoxDeckImportBody {
  deck: NormalizedDeck
  name: string
  format?: string
  /** Convert basic lands to generic, untracked slots. Default true (D-048). */
  convertBasicLandsToGeneric?: boolean
  /**
   * Per-row Original / Proxy / Unsleeved split (D-047 revised).
   */
  rowSplits?: ManaBoxRowSplits
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
  /** Resolved finish; text exports default to nonfoil unless marked foil (D-051). */
  finish: 'nonfoil' | 'foil' | 'etched'
  /** Deck import only. Default { originalCount: qty, proxyCount: 0, unsleevedCount: 0 }. */
  rowSplit?: ManaBoxRowSplit
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
