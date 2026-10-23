/**
 * Contract types for per-copy import attributes (import row editing).
 *
 * Source: docs/oracle/contracts/import-row-editing.md
 * Spec:   docs/oracle/specs/import-row-editing.md (rev 4)
 * Builds on: docs/oracle/contracts/manabox-import.types.ts
 *
 * Reference types only. Developer implements the functions named in the
 * contract (§9) in src/lib/import-copies.ts as small, discrete, unit-tested
 * functions.
 *
 * Identifier note (D-003): `scryfallId` here is a printing id; `oracleId` is the
 * canonical card id. Finish is its own attribute and is never encoded in either.
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

/**
 * Original/Proxy describe the copy; `unsleeved` means the physical card is NOT in
 * the deck, whether or not the owner owns it (owner, 2026-10-20; D-025, D-047).
 * `unsleeved` exists on deck imports only. An unsleeved line creates and links no
 * user_copies row, so only `finish` applies to it (stored as requested_finish);
 * `condition` resolves to null and `language` is ignored on write.
 */
export type ImportCopyType = 'original' | 'proxy' | 'unsleeved'

/** Stored values of user_copies.finish. */
export type ImportFinish = 'nonfoil' | 'foil' | 'etched'

/**
 * Stored values of user_copies.condition (the RPC key is `card_condition`).
 * Screen labels: NM, LP, MP, HP, DMG.
 */
export type ImportCondition =
  | 'near_mint'
  | 'lightly_played'
  | 'moderately_played'
  | 'heavily_played'
  | 'damaged'

/** Lower-case language code, 2 to 4 letters (en, ja, zhs, ...). Shape-checked in SQL. */
export type ImportLanguage = string

/** Fields an owner or a file can set on a copy. Type is owner-only (D-045). */
export type ImportCopyField = 'type' | 'finish' | 'condition' | 'language'

/** Where a resolved value came from. Drives the "From your file" dot. */
export type ImportValueSource = 'default' | 'file' | 'owner'

// ---------------------------------------------------------------------------
// Defaults bar
// ---------------------------------------------------------------------------

/**
 * The "Importing as: ..." bar. Held in the client only; never saved.
 * Initial value: nonfoil / near_mint / en. The copy type default is always
 * `original` and is not part of the bar (D-045).
 */
export interface ImportDefaults {
  finish: ImportFinish
  condition: ImportCondition
  language: ImportLanguage
}

export const INITIAL_IMPORT_DEFAULTS: ImportDefaults = {
  finish: 'nonfoil',
  condition: 'near_mint',
  language: 'en',
}

// ---------------------------------------------------------------------------
// Per-copy shape
// ---------------------------------------------------------------------------

/**
 * Values read from the file for one copy. A field is `undefined` when the file
 * did not supply a usable value (blank cell, text export, unrecognised
 * condition, malformed language). The file's Proxy column sets only the default type (D-055).
 * Immutable after parsing.
 */
export interface ImportCopyFileValues {
  // Text exports supply none of these (contract §2A): the object is empty.
  finish?: ImportFinish
  condition?: ImportCondition
  language?: ImportLanguage
  /**
   * T-60 S-1 (D-055, import-formats N-5; Developer addition, Architect to confirm):
   * the file's Proxy column / `^Proxy^` label said proxy. Sets the copy's DEFAULT type to
   * Proxy; an owner edit still wins. Absent = the file did not say.
   */
  proxy?: boolean
}

/**
 * Only the fields the owner has set by hand. Absent key = untouched.
 * Setting a value equal to the default or to the file value still counts as an
 * owner edit (it is sticky and clears the dot).
 */
export interface ImportCopyOwnerEdits {
  type?: ImportCopyType
  finish?: ImportFinish
  condition?: ImportCondition
  language?: ImportLanguage
}

/**
 * One physical copy on an import row. `index` is the 0-based position within
 * the row and is stable for the life of the review screen: copies are ordered by
 * source line ascending, then in the order they appear within that line.
 */
export interface ImportCopy {
  index: number
  /** 1-based source line the copy came from (for error messages). */
  sourceLine: number
  file: ImportCopyFileValues
  owner: ImportCopyOwnerEdits
}

/** A copy after precedence is applied: owner, then file, then defaults. */
export interface ResolvedImportCopy {
  index: number
  type: ImportCopyType
  /** Finish the copy would have as an Original. Retained (hidden) for proxies; see contract §5. Always one Scryfall lists for the printing, unless `finishNote` is `unlisted`. */
  finish: ImportFinish
  /**
   * `fallback`: the default (or nothing) asked for a finish the printing does
   * not have, so the card's own finish was used. `unlisted`: the FILE supplied a
   * finish Scryfall does not list; kept as supplied and flagged. null otherwise.
   */
  finishNote: 'fallback' | 'unlisted' | null
  /**
   * Condition as it will be written. Always `null` for proxies and unsleeved
   * copies; for originals it is never null.
   */
  condition: ImportCondition | null
  /** Condition the copy would have as an Original (kept so toggling back restores it). */
  heldCondition: ImportCondition
  language: ImportLanguage
  /** `file` means show the dot. `type` has no source entry: it is never from the file. */
  sources: {
    type: 'default' | 'owner'
    finish: ImportValueSource
    condition: ImportValueSource
    language: ImportValueSource
  }
}

/**
 * Rules for finish availability (contract §5A). Pure; unit-tested.
 * `allowedFinishes(null)` returns all three.
 */
export const ALL_IMPORT_FINISHES: ImportFinish[] = ['nonfoil', 'foil', 'etched']

/** What the Finish control offers on a copy. */
export interface FinishControlState {
  /** `hidden` when exactly one finish exists (nothing to choose). */
  mode: 'hidden' | 'select'
  /** Options in order nonfoil, foil, etched. Includes the current value, marked unlisted, if the file supplied one Scryfall does not list. */
  options: Array<{ value: ImportFinish; unlisted: boolean }>
}

// ---------------------------------------------------------------------------
// Import row
// ---------------------------------------------------------------------------

/**
 * One review row. Replaces ManaBoxPreviewRow's single `condition` / `language`
 * and the RowChoices / split / proxyCount pieces.
 */
export interface ImportRow {
  /**
   * Immutable key, built once from the FILE's values when the preview is built:
   *   collection CSV:  `${scryfallId}|${fileFinish}|${fileLanguage ?? 'en'}`
   *   deck CSV:        `${scryfallId}|${fileFinish}`
   *   deck text:       `${scryfallId}|text` (text lines carry no finish)
   * Never rebuilt after owner edits. Used for selection, open state and edits.
   */
  rowKey: string
  sourceIndex: number
  sourceLines: number[]
  cardName: string
  setCode: string
  collectorNumber: string
  /** Printing id (D-003). */
  scryfallId: string
  /** Canonical card id (D-003). */
  oracleId: string
  /** Always equals copies.length. Read-only on screen. */
  qty: number
  /**
   * Finishes Scryfall lists for this printing (its per-printing `finishes`
   * list, mapped to nonfoil | foil | etched; `glossy` is ignored). Carried on
   * the resolved card from ref_printings. `null` = not known yet (column not
   * backfilled): treat as "all three allowed" and never flag. Never empty.
   */
  availableFinishes: ImportFinish[] | null
  copies: ImportCopy[]
  /** Deck imports: basic land eligible for the generic switch. No copies are written when it applies (D-048). */
  isBasicLand: boolean
  /**
   * ROUND 13 ADDITION (Developer; Architect to confirm): did the source line name a printing
   * (set and/or collector number, or a CSV Scryfall id)? A deck-import basic land becomes a
   * generic slot only when this is false. Absent is treated as true (a real card).
   */
  printingGiven?: boolean
  /**
   * T-60 S-5 (import-formats §4; Developer addition, Architect to confirm): which board the
   * source line was under. Absent = `main`. `maybeboard` rows are saved as planned slots with
   * no copies (D-018, D-022).
   */
  board?: 'main' | 'maybeboard'
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** Sparse owner edits: rowKey -> copy index -> edited fields. */
export type ImportCopyEdits = Record<string, Record<number, ImportCopyOwnerEdits>>

/**
 * POST /api/collection/import body (replaces `proxyCounts`).
 * The server re-reads the file for identity and file values; the client only
 * sends defaults and owner edits.
 */
export interface CollectionImportBodyV2 {
  csvContent?: string
  defaults: ImportDefaults
  copyEdits?: ImportCopyEdits
}

/**
 * Deck import card, extended. The deck body is built by the client today, so
 * the file values travel with each card and are validated server side.
 */
export interface DeckImportCardV2 {
  rowKey: string
  sourceIndex?: number
  /** Length must equal the card's quantity. */
  copies: ImportCopy[]
}

/** POST /api/decks/import body additions (replaces `rowSplits`). */
export interface DeckImportBodyAdditionsV2 {
  defaults: ImportDefaults
  copyEdits?: ImportCopyEdits
}

/** One element of the `p_rows` array sent to replace_deck_with_new_cards. */
export interface DeckImportRpcRow {
  card_id: number | null
  card_name: string
  /** scryfall_id (printing). */
  printing_id: string | null
  /** scryfall_id (printing). */
  scryfall_id: string | null
  set_code: string
  categories: string
  is_commander: boolean
  /** false for original and unsleeved, true for proxy. */
  is_proxy: boolean
  /** True means "planned slot, no copy created or linked": used for unsleeved (owned or not) and maybeboard. */
  is_maybeboard: boolean
  /** Generic basic (generic-basic-lands contract §3): explicit flag; the slot holds no copy. */
  is_generic?: boolean
  /** Generic only: Sleeved (true) or Unsleeved (false) for the whole basic type. */
  generic_sleeved?: boolean
  /** Null for generic basic slots: the database then stores no requested finish. */
  finish: ImportFinish | null
  language?: ImportLanguage
  /** null for proxies. Omitted for planned slots. */
  card_condition?: ImportCondition | null
  source_tag?: string
}

/** One element of the `p_rows` array sent to insert_user_copies (unchanged shape). */
export interface CollectionRpcRow {
  card_id: number
  /** scryfall_id (printing). */
  printing_id: string
  finish: ImportFinish
  language: ImportLanguage
  is_proxy: boolean
  /** null for proxies. */
  card_condition: ImportCondition | null
  source_tag: 'manabox'
  location_id: null
  purchase_price?: number
  acquired_at?: string
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

/**
 * Counted, not listed. Shown once as a quiet line on the review screen, e.g.
 * "3 values in your file were not recognised, so your defaults were used."
 */
export interface ImportValueNotices {
  unrecognisedCondition: number
  unrecognisedLanguage: number
  unrecognisedFinish: number
  /** Copies whose FILE finish is not on Scryfall's list for the printing (kept, flagged). */
  unlistedFinish: number
  /** Copies where the defaults bar asked for a finish the card does not come in (card's own finish used). */
  defaultFinishFellBack: number
}
