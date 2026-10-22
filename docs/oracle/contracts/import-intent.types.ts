/**
 * Contract types for deck import INTENT (I bought it / I built it / I'm planning it).
 *
 * Source: docs/oracle/contracts/import-intent.md
 * Spec:   docs/oracle/specs/import-intent.md (rev 3)
 * Builds on: docs/oracle/contracts/import-row-editing.types.ts
 *
 * Reference types only. Developer implements the pure functions named in the
 * contract (§8) in src/lib/import-intent.ts, unit-tested, no database access.
 *
 * Identifier note (D-003): `printingId` is a printing (scryfall_id); `oracleId` is the
 * canonical card. Finish is its own attribute.
 * Safety note: no copy ids (user_copies.id) ever travel from the client. Deck ids do,
 * and the server verifies every one belongs to the signed-in user.
 */

import type {
  ImportCopyOwnerEdits,
  ImportCopyType,
  ImportFinish,
} from './import-row-editing.types'

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

/** Chosen once on the first screen. Never changes on the review screen. */
export type ImportIntent = 'purchased' | 'built' | 'planned'

/** Where the list came from. Precon presets intent = purchased. Never affects behaviour otherwise. */
export type ImportSource = 'file' | 'paste' | 'link' | 'precon'

// ---------------------------------------------------------------------------
// Ownership facts (read-only endpoint, contract §3)
// ---------------------------------------------------------------------------

/** A group of the owner's identical copies. */
export interface OwnedCopyGroup {
  printingId: string
  setCode: string
  collectorNumber: string
  finish: ImportFinish
  isProxy: boolean
  count: number
}

/** A group of the owner's copies that are sleeved into another deck. */
export interface HeldCopyGroup extends OwnedCopyGroup {
  deckId: number
  deckName: string
}

/**
 * Per review row. `free` = a copy not sleeved in any deck and not marked missing.
 * `held` = a copy sleeved in some deck. Copies marked missing appear in neither.
 * Counts are as of the moment of the request; the server recomputes at save.
 */
export interface OwnershipRowFacts {
  rowKey: string
  oracleId: string
  free: OwnedCopyGroup[]
  held: HeldCopyGroup[]
}

export interface OwnershipRequestCard {
  rowKey: string
  oracleId: string
  /** The printing the deck lists. */
  printingId: string
  finish?: ImportFinish
  qty: number
}

/** POST /api/decks/import/ownership. Read-only. Never writes. */
export interface OwnershipRequest {
  cards: OwnershipRequestCard[]
}

export interface OwnershipResponse {
  rows: OwnershipRowFacts[]
}

// ---------------------------------------------------------------------------
// Per-copy owner choices (extends ImportCopyOwnerEdits)
// ---------------------------------------------------------------------------

/** What the owner chose when a card is held in other decks. */
export type MoveChoice =
  | { kind: 'move'; fromDeckId: number }
  | { kind: 'skip' }

/** What the owner chose when the owned printing differs from the listed one. */
export type PrintingChoice = 'use_mine' | 'add_this'

/** Owner edits for one copy. All fields optional; absent = untouched (intent default applies). */
export interface IntentCopyOwnerEdits extends ImportCopyOwnerEdits {
  /** "Add to collection" tick. Absent = intent default (true for purchased, else false). */
  add?: boolean
  /** Only meaningful when the copy is not free but held in other deck(s). */
  move?: MoveChoice
  /** Only meaningful when the owned printing differs from the listed one. */
  printing?: PrintingChoice
}

/** rowKey -> copy index -> edits. Same shape as import-row-editing ImportCopyEdits. */
export type IntentCopyEdits = Record<string, Record<number, IntentCopyOwnerEdits>>

// ---------------------------------------------------------------------------
// Resolved plan for one copy (pure function output, contract §3-§4)
// ---------------------------------------------------------------------------

/** What saving will do with ONE copy. Exactly one kind per copy. */
export type CopyPlanKind =
  | 'add_sleeved' // new original/proxy copy added and sleeved
  | 'add_unsleeved' // new original copy added, slot left unsleeved ("Added, not sleeved")
  | 'sleeve_owned' // existing free copy sleeved here
  | 'move' // existing copy taken from deckId, sleeved here
  | 'move_skipped' // new copy added and sleeved here; alert raised on holder deck(s)
  | 'needs_choice_move' // held in several decks, none picked yet (blocks Import)
  | 'needs_choice_printing' // other printing owned, not chosen yet (blocks Import)
  | 'owned_unsleeved' // planned slot; owner owns the card (list only)
  | 'unowned' // planned slot; owner does not own it
  | 'generic' // generic basic: no copy; sleeved flag only

export interface CopyPlan {
  rowKey: string
  copyIndex: number
  kind: CopyPlanKind
  /** Effective type shown on the copy (a sleeved owned proxy shows 'proxy'). */
  type: ImportCopyType
  /** Printing the slot will ask for: the owned copy's printing for sleeve_owned/move when chosen. */
  slotPrintingId: string
  /** move only. */
  fromDeckId?: number
  /** move_skipped only: every holder deck that will get an alert. */
  alertDeckIds?: number[]
  /** For sleeve_owned/move: describes the owned printing when it differs from the listed one. */
  ownedPrinting?: { printingId: string; setCode: string; collectorNumber: string }
  /** Generic basics only. */
  genericSleeved?: boolean
  /** UI state: Original/Proxy options enabled? (contract §4 'availableKinds') */
  canOriginal: boolean
  canProxy: boolean
}

/** Counts shown in the summary under the list and on the result screen. Zero counts are omitted by the UI. */
export interface ImportPlanSummary {
  cards: number
  added: number
  addedProxies: number
  sleevedFromCollection: number
  moved: number
  addedNotSleeved: number
  unsleeved: number
  unowned: number
  needChoice: number
  /** Copies skipped on a move: one new copy added, alert(s) raised. */
  alertsOnOtherDecks: number
  genericBasics: number
}

// ---------------------------------------------------------------------------
// Save (POST /api/decks/import, ManaBox branch additions)
// ---------------------------------------------------------------------------

/** Additions to the existing ManaBox deck body. `defaults` and `deck.cards[].copies` are unchanged. */
export interface DeckImportBodyIntentAdditions {
  intent: ImportIntent
  source: ImportSource
  /** Replaces ImportCopyEdits for deck imports. Holds no copy ids. */
  copyEdits?: IntentCopyEdits
}

/** One copy the server could not honour at save time. It is saved unsleeved and listed. */
export interface NeedsALookItem {
  rowKey: string
  copyIndex: number
  cardName: string
  reason: 'copy_no_longer_free' | 'copy_no_longer_in_deck' | 'ownership_unavailable'
}

/** Response additions (counts are past tense on the result screen). */
export interface DeckImportIntentSummary extends ImportPlanSummary {
  deckId: number
  needsALook: NeedsALookItem[]
  /** Alerts actually created (equals alertsOnOtherDecks unless something changed at save). */
  alertsCreated: number
}

/** One element of p_rows for import_deck_with_intent, one per copy / slot. Extends DeckImportRpcRow. */
export interface IntentRpcRow {
  action: 'add_sleeved' | 'add_unsleeved' | 'sleeve_owned' | 'move' | 'move_skipped' | 'planned' | 'generic'
  // ...all DeckImportRpcRow fields (card_name, printing_id, scryfall_id, set_code, categories,
  // is_commander, finish, language, card_condition, is_proxy, is_generic, generic_sleeved, source_tag)
  // sleeve_owned / move: the SERVER picks the copy (never the client). The RPC receives the
  // chosen copy id only after the route has read and the RPC re-verifies it under lock.
  link_copy_id?: number
  /** move / move_skipped */
  from_deck_id?: number
  /** move_skipped: decks to alert. */
  alert_deck_ids?: number[]
}

// ---------------------------------------------------------------------------
// Decklist alert (Accounting error)
// ---------------------------------------------------------------------------

export type ImportAlertStatus = 'open' | 'fixed' | 'dismissed'

export interface ImportAlert {
  id: number
  deckId: number
  deckCardId: number
  cardName: string
  /** Deck where the new copy was sleeved without moving this one. */
  causedByDeckId: number
  causedByDeckName: string
  status: ImportAlertStatus
  createdAt: string
}

/** GET /api/decks/[id]/import-alerts -> { alerts: ImportAlert[] } (open only). */
/** POST /api/decks/[id]/import-alerts/[alertId] body. */
export interface ResolveImportAlertBody {
  action: 'fixed' | 'dismissed'
}
