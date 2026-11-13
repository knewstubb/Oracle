/**
 * Know where cards are (phase 3) — contract types. DRAFT, reference only: no handlers here.
 * Contract: docs/oracle/contracts/know-where-cards-are.md
 * Identifier note (D-003): every `copyId` is a user_copies.id (one physical card). `cardName` is display only.
 */

export type SystemPlace = 'in_hand' | 'missing' | 'unsorted'

/** Where a card physically is. Exactly one holds at a time. */
export type CopyPlace =
  | { kind: 'deck'; deckId: number; deckCardId: number }
  | { kind: 'location'; locationId: number; isUnsorted: boolean }
  | { kind: 'in_hand' }
  | { kind: 'missing'; since: string }

export type MoveState = 'to_find' | 'found' | 'placed' | 'missing' | 'cancelled'

export type PlaceRef = { kind: 'deck'; deckId: number; deckCardId?: number } | { kind: 'location'; locationId: number }

export interface MoveItem {
  id: number
  listId: string
  copyId: number | null
  cardName: string
  from: PlaceRef | null
  to: PlaceRef
  state: MoveState
  lookedIn: PlaceRef[]
  isProxy: boolean
  /** Real copy of this card that would be better placed elsewhere (proxy swap hint). Never applied automatically. */
  swapHint: string | null
}

/** One stop on the walk: "Box: take these", "Korvold: put in / take out". */
export interface ChecklistGroup {
  place: PlaceRef
  placeName: string
  take: MoveItem[]
  put: MoveItem[]
}

export interface Checklist {
  listId: string
  groups: ChecklistGroup[]
  counts: { total: number; found: number; placed: number; missing: number; open: number }
}

// ---- Requests / responses ------------------------------------------------------------------------------

/** POST /api/moves/lists */
export interface CreateMoveListBody {
  items: Array<{ copyId: number; to: PlaceRef; source?: 'manual' | 'import' | 'ai' }>
}
export interface CreateMoveListResponse { checklist: Checklist; skipped: Array<{ copyId: number; reason: MoveError }> }

/** GET /api/moves/lists/[listId] and GET /api/moves/open  */
export interface GetChecklistResponse { checklist: Checklist }

/** POST /api/moves/items/[id]/found */
export interface FoundResponse { item: MoveItem; sourceDeckNowShort: { deckId: number; deckName: string; cardName: string } | null }

/** POST /api/moves/items/[id]/placed — body optional: place somewhere other than planned ("put it back anywhere") */
export interface PlacedBody { to?: PlaceRef }
export interface PlacedResponse { item: MoveItem; filledDeckCardId: number | null }

/** POST /api/moves/items/[id]/cant-find */
export interface CantFindResponse {
  item: MoveItem
  /** Decks left short by this card; each keeps its planned slot. */
  decksNowShort: Array<{ deckId: number; deckName: string; cardName: string; suggestion: 'proxy' | 'spare_copy' | 'none' }>
  /** Ranked places to look next, never including places already in lookedIn. */
  lookNext: Array<{ place: PlaceRef; placeName: string; why: string }>
}

/** POST /api/moves/items/[id]/looked-here  body: { place } -> same shape as CantFindResponse (lookNext shrinks) */
export interface LookedHereBody { place: PlaceRef }

/** POST /api/moves/items/[id]/undo  — undoes the latest tick only (placed -> found, found -> to_find, missing -> to_find) */
export interface UndoTickResponse { item: MoveItem; restoredTo: CopyPlace }

/** POST /api/moves/missing/[copyId]/turned-up  body: { to: PlaceRef | 'in_hand' } */
export interface TurnedUpBody { to: PlaceRef | 'in_hand' }

/** GET /api/locations/system */
export interface SystemLocationsResponse {
  inHand: { count: number; cards: Array<{ copyId: number; cardName: string; isProxy: boolean; openItemId: number | null }> }
  missing: { count: number; cards: Array<{ copyId: number; cardName: string; isProxy: boolean; since: string; lastSeen: PlaceRef | null }> }
  unsorted: { count: number; locationId: number }
}

export type MoveError =
  | 'copy_not_found' | 'item_not_found' | 'copy_missing' | 'copy_in_hand' | 'not_in_hand'
  | 'wrong_state' | 'copy_already_in_open_item' | 'no_open_slot' | 'target_not_found'
  | 'slot_claimed_elsewhere' | 'target_is_system_location'

/** Spare / availability rule shared by every reader (Deck health, candidates, Reconcile, import). */
export interface CopyAvailabilityRow { is_proxy: boolean; missing: boolean; in_hand: boolean }
export function isSupplyEligible(c: CopyAvailabilityRow): boolean { return !c.missing && !c.in_hand }
/** Spare = eligible AND no deck_cards row points at it (the existing meaning of "free"). */
export function isSpare(c: CopyAvailabilityRow, isInAnyDeck: boolean): boolean { return isSupplyEligible(c) && !isInAnyDeck }

// ---- Move here (2026-11-13): direct move of a named copy between decks, no checklist, no In your hand ----

/** POST /api/decks/[id]/move-here  ([id] = the target deck). Server never picks the copy. */
export interface MoveHereBody { copyId: number; cardName: string; expectedSourceDeckId: number }
export interface MoveHereResponse {
  copyId: number
  sourceDeckId: number
  sourceDeckName: string
  sourceDeckCardId: number
  targetDeckCardId: number
  /** The source keeps its planned slot and is now short by one (toast says so). */
  sourceDeckNowShort: true
  sourceDeckStatusAfter: 'draft' | 'assembling' | 'playable'
  /** Body for POST /api/allocation/undo; valid while the source slot is still empty. */
  undo: { deckCardsId: number; physicalCopyId: number; restoreTo: { deckCardsId: number } }
}
export type MoveHereError = MoveError | 'already_in_this_deck' | 'source_changed' | 'copy_on_open_checklist'

// ---- Picklist (2026-11-13): per-deck and all-decks, one concept; ticks shared via move_items ----

export type PicklistGroupKind = 'available' | 'needs_moving' | 'unowned'

/** One row: a planned slot still needing a card. A slot is in exactly one group. */
export interface PicklistRow {
  deckId: number
  deckCardId: number
  /** Display only (D-003). */
  cardName: string
  group: PicklistGroupKind
  /** available: free copy and the box it is in. needs_moving: the copy and where it is. unowned: null. */
  copy: { copyId: number; isProxy: boolean; at: CopyPlace } | null
  /** Saved tick state shared by both views; null until a Found it / Placed it tick exists (S2). */
  moveItem: { id: number; state: MoveState } | null
  /** Other owned copies the owner can pick between for Move here. */
  otherCopies: Array<{ copyId: number; isProxy: boolean; deckId: number; deckName: string; deckStatus: string }>
  /** Which actions apply (the screen never offers one that is false). */
  actions: { placedIt: boolean; foundIt: boolean; moveHere: boolean; turnedUp: boolean }
  /** unowned only: buy ideas come from the existing buy logic; wishlist is a LATER slice. */
  lookupFailed?: boolean
}

/** Additive field on GET /api/decks/[id]/picklist (existing fields unchanged). */
export interface DeckPicklistGroups {
  available: Array<{ boxName: string; locationId: number; rows: PicklistRow[] }>
  needsMoving: Array<{ sourceDeckName: string; sourceDeckId: number | null; rows: PicklistRow[] }>
  unowned: PicklistRow[]
}

/** GET /api/picklist?deckIds=1,2,3 — combined, in walking order; reuses ChecklistGroup stops. */
export interface AllDecksPicklistResponse {
  takeFromBoxes: Array<{ place: PlaceRef; placeName: string; rows: PicklistRow[] }>
  takeFromDecks: Array<{ place: PlaceRef; placeName: string; rows: PicklistRow[] }>
  placeInDecks: Array<{ place: PlaceRef; placeName: string; rows: PicklistRow[] }>
  unowned: PicklistRow[]
  counts: Checklist['counts']
}

/** POST /api/picklist/found and /placed: creates the move item if the row has none, then ticks, in one transaction. */
export interface PicklistTickBody { copyId: number; to: PlaceRef }
export type PicklistTickError = MoveError | 'already_in_this_deck'

// ---- Import destination (2026-11-13): one place for the whole add-only collection import ----

/** Optional on the collection import body. Absent = { kind: 'unsorted' } (today's behaviour). Missing / In your hand are not destinations. */
export type ImportDestination =
  | { kind: 'unsorted' }
  | { kind: 'storage'; locationId: number } // user_locations.id, type 'storage', not the deck-type rows
  | { kind: 'deck'; deckId: number } // decks.id

/** GET /api/import/destinations */
export interface DestinationsResponse {
  unsorted: { locationId: number }
  storage: Array<{ locationId: number; name: string; copyCount: number }>
  decks: Array<{ deckId: number; name: string; format: string | null; emptySlots: number; status: 'unowned' | 'assembling' | 'playable' | 'draft' }>
}

export type ImportUnsortedReason = 'duplicate' | 'in_maybeboard' | 'basic_land' | 'could_not_place'

/** Optional `placement` on the collection import summary. For deck: filledSlots + addedAsNew + sentToUnsorted === copies added. */
export interface ImportPlacementResult {
  destination: { kind: ImportDestination['kind']; id: number | null; name: string }
  total: number
  /** storage / unsorted: how many went there (= total). */
  placedInStorage?: number
  /** deck only */
  filledSlots?: number
  addedAsNew?: number
  sentToUnsorted?: number
  unsortedReasons?: Record<ImportUnsortedReason, number>
  /** Capped list for the result screen; cardName is display only (D-003). */
  details?: Array<{ cardName: string; outcome: 'filled' | 'added' | 'unsorted'; reason?: ImportUnsortedReason }>
  proxies?: number
  /** Copies whose finish differs from what an existing slot asked for (still placed). */
  finishDiffers?: number
  deckStatusAfter?: 'unowned' | 'assembling' | 'playable' | 'draft'
  warnings?: {
    /** Names of newly added cards outside the commander colours or not legal. Warn only (Q9). */
    outsideColours: string[]
    notLegal: string[]
    mainCountAfter: number
    targetCount: number | null
    overTarget: boolean
    /** True when colours/legality could not be checked; never shown as "no warnings" (D-030). */
    checksUnavailable: boolean
  }
}

