/**
 * Contract types: Import Reconciliation Redesign (T-22)
 *
 * Companion to `import-reconciliation-redesign.md`. These are the wire shapes
 * for the four reconciliation routes. Copy into `src/types/` when the contract
 * is approved; this file is the reviewable source of truth.
 *
 * Identifier discipline (D-003): every `printingId` here is a `scryfall_id`
 * (one specific printing). `oracleId` is the canonical card across printings.
 * They are never interchangeable.
 */

/* ─── Instance state ────────────────────────────────────────────────── */

/**
 * Per-instance state, stored in `import_sleeve_claims.resolution`.
 *
 * - `planned` — default. Slot stays planned; no copy assigned.
 * - `sleeved` — slot takes a real copy of the instance's effective printing.
 * - `proxy`   — slot takes a proxy: reuse a free one, else create one.
 */
export type InstanceState = 'planned' | 'sleeved' | 'proxy'

/**
 * Pre-rename values still accepted on input and mapped at the RPC boundary, so
 * a cached client cannot corrupt state. Never emitted in a response.
 */
export type LegacyInstanceState = 'release' | 'sleeve'

export const INSTANCE_STATES: readonly InstanceState[] = ['planned', 'sleeved', 'proxy']

export const LEGACY_STATE_MAP: Readonly<Record<LegacyInstanceState, InstanceState>> = {
  release: 'planned',
  sleeve: 'sleeved',
}

/** Which tab a conflict printing belongs to. `unowned` iff ownedAnyPrinting === 0. */
export type RowOwnership = 'owned' | 'unowned'

/* ─── Read: GET /api/onboarding/reconciliation ───────────────────────── */

export interface DeckRef {
  deckId: number
  deckName: string
}

export interface ReconciliationCounts {
  /** Decks-tab badge: unresolved conflict printings across all imported decks. */
  unresolvedTotal: number
  /** Owned-tab badge. */
  unresolvedOwned: number
  /** Unowned-tab badge. */
  unresolvedUnowned: number
  /** Every row in the batch, before `includeResolved` filtering. */
  rowsTotal: number
}

export interface ReconciliationDeck {
  deckId: number
  deckName: string
  /** Lifecycle badge: true → "Active", false → "Brew". From `decks.is_active`. */
  isActive: boolean
  /**
   * Unresolved conflict printings touching this deck. Per-deck counts do NOT
   * sum to `counts.unresolvedTotal`: a printing wanted by three decks counts
   * once in the tab badge and once in each of the three deck headers.
   */
  conflictPrintingCount: number
}

/** Another printing of the same card that the user owns at least one real copy of. */
export interface AlternatePrinting {
  printingId: string
  setCode: string | null
  setName: string | null
  collectorNumber: string | null
  /**
   * Finishes owned for this printing (D-004: finish is a property of the
   * physical copy, not of `scryfall_id`). Display only — selection is per
   * printing, not per finish.
   */
  finishes: string[]
  /** Real copies of this printing the user owns. */
  owned: number
  /** Real copies of this printing this screen can still hand out. */
  availableSupply: number
  imageUriSmall: string | null
}

/** One deck-card slot awaiting a decision. The unit of every write. */
export interface ConflictInstance {
  /** Write key: `import_sleeve_claims.id`. */
  claimId: number
  deckCardsId: number
  deckId: number
  deckName: string

  state: InstanceState
  /** `null` ⇒ using the row's imported printing. */
  selectedPrintingId: string | null
  /** `selectedPrintingId ?? row.printingId`. Supply is evaluated against this. */
  effectivePrintingId: string
  /** Unowned-tab wishlist checkbox. Defaults to true. Affects nothing else. */
  wishlisted: boolean

  /** false ⇒ render the Sleeved button disabled (spec §8.2). */
  canSleeve: boolean
  /** true ⇒ render the amber "Already claimed" descriptor (spec §8.1). */
  alreadyClaimed: boolean
  /**
   * true when this slot has no remaining actionable option (contract §5).
   * `sleeved` with supply, `proxy`, and `planned` slots that have lost the
   * allocation race on every printing option are all resolved.
   */
  resolved: boolean
  /** Decks holding real copies of this instance's effective printing (spec §7). */
  claimedBy: DeckRef[]
}

/**
 * One conflict printing: the unit of grouping, row rendering, and every count.
 * Row identity is `(cardName, printingId)` where `printingId` is the printing
 * the imported deck listed.
 */
export interface ConflictPrintingRow {
  cardName: string
  printingId: string
  oracleId: string | null

  // Printing display data from `ref_printings`. All null when unsynced.
  setCode: string | null
  setName: string | null
  collectorNumber: string | null
  /**
   * The single distinct finish among owned real copies of this printing, else
   * null. Not part of the row key — see contract §3.4.
   */
  finish: string | null
  imageUriSmall: string | null
  imageUriNormal: string | null
  /** Hover-preview source (spec §11). */
  imageUriLarge: string | null

  /** Real copies of THIS printing. The spec's `owned`. */
  owned: number
  /** Real copies of this printing this screen can still hand out. */
  availableSupply: number
  /** Real copies of the card across all printings. 0 ⇒ ownership 'unowned'. */
  ownedAnyPrinting: number
  /** Free proxy copies of this printing, reusable at finalize. */
  freeProxies: number
  /** Decks already holding a real copy of this printing (spec §7). */
  claimedBy: DeckRef[]

  /** Tab routing. */
  ownership: RowOwnership
  /** D-024: card is owned, but not in this printing. Warn only, never blocks. */
  printingMismatch: boolean
  /** Any instance wants a real copy it cannot get. Amber row warning. */
  overAllocated: boolean
  /** Every instance in this row is slot-level resolved (contract §5). Green row. */
  resolved: boolean

  instances: ConflictInstance[]
  /** Empty ⇒ hide the "Use alternate printing" select (spec §12). */
  alternatePrintings: AlternatePrinting[]
}

export interface ReconciliationView {
  batchId: string | null
  counts: ReconciliationCounts
  decks: ReconciliationDeck[]
  rows: ConflictPrintingRow[]
}

export interface ReconciliationQuery {
  batchId?: string
  /**
   * Default false. Initial page load must use the default so resolved rows
   * disappear on reload (spec §14). Mutation responses always set it true.
   */
  includeResolved?: boolean
}

/* ─── Writes ─────────────────────────────────────────────────────────── */

/** PATCH /api/onboarding/reconciliation/instance */
export interface SetInstanceStateBody {
  claimId: number
  state: InstanceState | LegacyInstanceState
  batchId?: string
}

/** PATCH /api/onboarding/reconciliation/instance/printing */
export interface SetInstancePrintingBody {
  claimId: number
  /** null clears the override and returns to the imported printing. */
  printingId: string | null
  batchId?: string
}

/** PATCH /api/onboarding/reconciliation/instance/wishlist */
export interface SetInstanceWishlistBody {
  claimId: number
  wishlisted: boolean
  batchId?: string
}

/** Every mutation returns the refreshed view with `includeResolved: true`. */
export interface MutationResponse {
  success: true
  view: ReconciliationView
}

export interface SetInstancePrintingResponse extends MutationResponse {
  /**
   * true when the instance was `sleeved` and the newly selected printing had no
   * room, so it was set to `planned` to preserve P1. Surface as a toast, not an
   * error — the printing change itself succeeded (contract §4.4).
   */
  demoted: boolean
}

/* ─── Finalize ───────────────────────────────────────────────────────── */

/** POST /api/onboarding/finalize */
export interface FinalizeRequestBody {
  batchId?: string
}

export interface FinalizeResponse {
  success: true
  /** Instances given a real copy. */
  finalizedCount: number
  /** Instances given a proxy, reused or created. */
  proxiedCount: number
  /** `planned` instances settled; slot left planned. */
  releasedCount: number
  /** Instances whose decision could not be satisfied. */
  leftOpenCount: number
  /** NEW in T-22: claims stamped `settled_at` during this pass. */
  settledCount: number
}

/* ─── Errors ─────────────────────────────────────────────────────────── */

/**
 * Stable machine-readable tokens raised by the RPCs with ERRCODE 'P0001' and
 * mapped to HTTP status by the route. Unknown tokens map to 500.
 */
export type ReconciliationErrorToken =
  | 'claim_not_found' // 404
  | 'invalid_state' // 400
  | 'sleeve_supply_exhausted' // 409
  | 'printing_not_found' // 404
  | 'printing_not_owned' // 409
  | 'printing_not_same_card' // 422

export const RECONCILIATION_ERROR_STATUS: Readonly<Record<ReconciliationErrorToken, number>> = {
  claim_not_found: 404,
  invalid_state: 400,
  sleeve_supply_exhausted: 409,
  printing_not_found: 404,
  printing_not_owned: 409,
  printing_not_same_card: 422,
}

export interface ReconciliationErrorResponse {
  error: string
  token?: ReconciliationErrorToken
}
