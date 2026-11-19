// Wire shapes of the cookie-only connector routes (contract slice B section 8). The UI imports types from here.
// Every sentence is made on the server (change-sentences.ts); the client never builds its own text.
import type { ChangeLogRow, MovedSlot, PendingPreview, PendingReason, PendingStatus, UndoRefusal } from './write-types'

export type { ChangeLogRow, MovedSlot, PendingPreview, PendingReason, PendingStatus, UndoRefusal }

/** Standard failure body. `error` is plain words and safe to show. */
export interface ApiFailure {
  ok: false
  error: string
  code?: string
}

/** One row of Recent changes = one request (a group). Fields of the group's first log row, plus the sentence. */
export interface ChangeGroupView extends ChangeLogRow {
  summary: string
  consequence: string | null
  /** How many log rows the request made (cards touched). */
  card_count: number
  /** Names of the cards (for the "See the 15 cards" list). */
  cards: string[]
  /** Plain-words reason when Undo is refused, else null. Same wording is used when Undo is pressed and refused. */
  refusal_text: string | null
  /** True when only the owner may undo (adds to the collection, proxies, moves). */
  owner_only: boolean
}

export interface ChangesResponse {
  ok: true
  changes: ChangeGroupView[]
}

export type UndoResponse =
  | { ok: true; success: true; undone: number; summary: string }
  | { ok: false; success: false; refused: UndoRefusal; error: string; code: 'undo_refused' }

export interface PendingItemView {
  id: string
  /** Claude's one-line reason for the request. Separate from `reason` (why it is waiting for your yes). */
  claude_reason: string | null
  kind: 'big_edit' | 'copy_move'
  action: string
  reason: PendingReason
  deck_id: number | null
  deck_name: string | null
  other_deck_id: number | null
  other_deck_name: string | null
  card_count: number
  preview: PendingPreview
  status: PendingStatus
  client_name: string | null
  created_at: string
  expires_at: string
  decided_at: string | null
  /** Plain words, set when the request failed as out of date. */
  failure_reason: string | null
  /** Plain words, set when the request was cancelled. */
  cancel_reason: string | null
  /** "Cut 15 cards from Korvold?" */
  title: string
  /** One calm sentence of what approving does. */
  summary: string
}

export interface PendingResponse {
  ok: true
  pending: PendingItemView[]
}

export interface PendingCountResponse {
  ok: true
  count: number
}

export type DecideResponse =
  | { ok: true; outcome: 'approved' | 'declined'; summary: string; group_id?: string; count?: number }
  | { ok: false; outcome: 'expired' | 'declined' | 'cancelled' | 'failed' | 'approved'; reason: string; error: string; code: 'pending_ended' }

export interface MovedSlotsResponse {
  ok: true
  moved: (MovedSlot & { sentence: string })[]
}

export interface StatusResponse {
  ok: true
  connected: boolean
  /** active = on and Claude's sign-in is good; off = owner switched it off (or never connected); expired = row is on but Claude's saved sign-in is gone. */
  state: 'active' | 'off' | 'expired'
  /** Off only: Claude's saved sign-in is still good, so switching on works without reconnecting. */
  can_reenable: boolean
  connection: { id: string; client_name: string | null; created_at: string; last_used_at: string | null } | null
  email: string | null
}

export type EnableResponse = { ok: true; state: 'active' } | { ok: false; needs_reconnect: true; error: string; code: 'needs_reconnect' }
