/**
 * Import Reconciliation — wire types for T-22.
 *
 * Source of truth lives in `docs/oracle/contracts/import-reconciliation-redesign.types.ts`.
 * Copied here so the rest of the app can import from `@/types/import-reconciliation`.
 * When the contract is approved, keep this file in sync with the doc file.
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

/**
 * Display state of one slot, per the owner-approved
 * `docs/oracle/import-reconciliation-states.md`. Server-computed; the UI maps
 * it to label and buttons and derives nothing else. Numbers are the states-doc
 * rows.
 *
 * | value                        | doc # | label                               | resolved |
 * |------------------------------|-------|-------------------------------------|----------|
 * | `planned_unowned`            | 1     | Planned (unowned)                   | no       |
 * | `planned_alt_available`      | 2, 8  | Planned (alt printing available)    | no       |
 * | `planned_claimed`            | 3, 9  | Planned (claimed by another deck)   | no       |
 * | `sleeved_auto`               | 4     | Sleeved (owned) — automatic         | yes      |
 * | `planned_conflict`           | 5, 6  | Planned (conflict)                  | no       |
 * | `sleeved_owned`              | 7     | Sleeved (owned)                     | yes      |
 * | `planned_alternate_selected` | 10    | Planned (alternate selected)        | no       |
 * | `sleeved_alternate`          | 11    | Sleeved (alternate printing)        | yes      |
 * | `proxy`                      | 12    | Proxy                               | yes      |
 * | `sleeved_unsatisfiable`      | —     | not in states doc; see contract §5  | no       |
 *
 * `sleeved_auto` is stored as `state: 'planned'`; finalize allocates it
 * (contract §7.7). States 13 and 14 are events, not display values: 13 is a
 * `planned_*` slot after finalize (settled: off this screen and off the deck
 * conflict badge, but still a normal Planned deck slot — contract §7.6); 14 is
 * any state recalculated after a write.
 */
export type SlotState =
  | 'planned_unowned'
  | 'planned_alt_available'
  | 'planned_claimed'
  | 'sleeved_auto'
  | 'planned_conflict'
  | 'sleeved_owned'
  | 'planned_alternate_selected'
  | 'sleeved_alternate'
  | 'proxy'
  | 'sleeved_unsatisfiable'

export const SLOT_STATES: readonly SlotState[] = [
  'planned_unowned',
  'planned_alt_available',
  'planned_claimed',
  'sleeved_auto',
  'planned_conflict',
  'sleeved_owned',
  'planned_alternate_selected',
  'sleeved_alternate',
  'proxy',
  'sleeved_unsatisfiable',
]

/** The slot states that count as resolved (contract §5). */
export const RESOLVED_SLOT_STATES: readonly SlotState[] = [
  'sleeved_auto',
  'sleeved_owned',
  'sleeved_alternate',
  'proxy',
]

/** Which tab a conflict printing belongs to. `unowned` iff ownedAnyPrinting === 0. */
export type RowOwnership = 'owned' | 'unowned'

/** UI tab identifiers. */
export type ReconciliationTab = 'decks' | 'owned' | 'unowned'

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

  /** Display state per the states doc. Authoritative for label and buttons. */
  slotState: SlotState

  /**
   * Supply fact: a free copy of the effective printing is not yet reserved by
   * another Sleeve decision. false ⇒ render Sleeve disabled (spec §8.2).
   */
  canSleeve: boolean
  /**
   * An owned alternate printing (any printing other than the effective one)
   * has a free, unreserved copy. Drives the "Switch printing" option.
   */
  alternateAvailable: boolean
  /**
   * Derived: `slotState === 'planned_claimed'` (states 3, 9) — every usable
   * real copy is held by or reserved for another deck, and no alternate is
   * free. Renders the amber "Claimed by another deck" descriptor. Not true for
   * `planned_alt_available`; that is a different state with a different action.
   */
  alreadyClaimed: boolean
  /**
   * States-doc "Overallocated?": competing slots (planned + sleeved) on the
   * effective printing exceed its free copies. Always false for `proxy`.
   */
  overAllocated: boolean
  /** Planned + sleeved slots in scope competing for the effective printing. */
  competingDemand: number
  /** `RESOLVED_SLOT_STATES.includes(slotState)` (contract §5). */
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
  /** Any instance in the row has `overAllocated: true`. Amber row warning. */
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
