/**
 * Picklist stored routines, part two: pure helpers (no database).
 * Contract: docs/oracle/contracts/know-where-cards-are.md section 14 and its .types.ts.
 * Routines: create_move_list, resolve_missing_copy, record_move_looked_in, undo_move_tick, cancel_move_item.
 * Every routine takes the signed-in user's id first; the routes supply it, never the browser.
 * This file validates request bodies, turns refusal codes into plain sentences and reads the routines' answers.
 */
import type {
  CancelStepResponse,
  CreateMoveListResult,
  CreateMoveListSkipReason,
  MoveRoutineError,
  PlaceRef,
  TurnedUpResponse,
  TurnedUpTarget,
  UndoTickRequest,
  UndoTickResponse,
} from '../../docs/oracle/contracts/know-where-cards-are.types'

const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0

export const MAX_LIST_ITEMS = 500

// ---- Request bodies ---------------------------------------------------------------------------------

function parsePlace(raw: unknown): PlaceRef | null {
  if (typeof raw !== 'object' || raw === null) return null
  const to = raw as Record<string, unknown>
  if (to.kind === 'deck') {
    if (!isPositiveInt(to.deckId)) return null
    if (to.deckCardId !== undefined && !isPositiveInt(to.deckCardId)) return null
    return to.deckCardId === undefined ? { kind: 'deck', deckId: to.deckId } : { kind: 'deck', deckId: to.deckId, deckCardId: to.deckCardId as number }
  }
  if (to.kind === 'location') {
    return isPositiveInt(to.locationId) ? { kind: 'location', locationId: to.locationId } : null
  }
  return null
}

export interface ListItemRequest { copyId: number; to: PlaceRef; cardName: string }

/** POST /api/moves/lists. Returns null when the body is not usable (the route answers 400). */
export function parseCreateListBody(body: unknown): { items: ListItemRequest[] } | { error: 'bad_input' | 'too_many_items' } {
  if (typeof body !== 'object' || body === null) return { error: 'bad_input' }
  const raw = (body as Record<string, unknown>).items
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'bad_input' }
  if (raw.length > MAX_LIST_ITEMS) return { error: 'too_many_items' }
  const items: ListItemRequest[] = []
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) return { error: 'bad_input' }
    const o = r as Record<string, unknown>
    if (!isPositiveInt(o.copyId)) return { error: 'bad_input' }
    const to = parsePlace(o.to)
    if (!to) return { error: 'bad_input' }
    const cardName = typeof o.cardName === 'string' && o.cardName.trim() ? o.cardName.trim() : 'That card'
    items.push({ copyId: o.copyId, to, cardName })
  }
  return { items }
}

/** The routine's `p_items`: only ids and destinations go to the database (card names stay display only, D-003). */
export function toRoutineItems(items: readonly ListItemRequest[]): Array<Record<string, unknown>> {
  return items.map((i) => ({
    copyId: i.copyId,
    to: i.to.kind === 'deck'
      ? { kind: 'deck', deckId: i.to.deckId, ...(i.to.deckCardId ? { deckCardId: i.to.deckCardId } : {}) }
      : { kind: 'location', locationId: i.to.locationId },
  }))
}

/** POST /api/moves/missing/[copyId]/turned-up body: { to: TurnedUpTarget, cardName? } */
export function parseTurnedUpBody(body: unknown): { to: TurnedUpTarget; cardName: string } | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  const cardName = typeof b.cardName === 'string' && b.cardName.trim() ? b.cardName.trim() : 'That card'
  const to = b.to as Record<string, unknown> | null | undefined
  if (typeof to !== 'object' || to === null) return null
  if (to.kind === 'in_hand') return { to: { kind: 'in_hand' }, cardName }
  const place = parsePlace(to)
  return place ? { to: place, cardName } : null
}

export function toTurnedUpTarget(to: TurnedUpTarget): Record<string, unknown> {
  if (to.kind === 'in_hand') return { kind: 'in_hand' }
  if (to.kind === 'location') return { kind: 'location', locationId: to.locationId }
  return { kind: 'deck', deckId: to.deckId, ...(to.deckCardId ? { deckCardId: to.deckCardId } : {}) }
}

/** POST /api/moves/items/[id]/looked-here body: { place: { kind: 'deck' | 'location', id } } */
export function parseLookedHereBody(body: unknown): { place: { kind: 'deck' | 'location'; id: number } } | null {
  if (typeof body !== 'object' || body === null) return null
  const p = (body as Record<string, unknown>).place as Record<string, unknown> | null | undefined
  if (typeof p !== 'object' || p === null) return null
  if ((p.kind !== 'deck' && p.kind !== 'location') || !isPositiveInt(p.id)) return null
  return { place: { kind: p.kind, id: p.id } }
}

/** POST /api/moves/items/[id]/undo body: { expectedState } */
export function parseUndoBody(body: unknown): UndoTickRequest | null {
  if (typeof body !== 'object' || body === null) return null
  const s = (body as Record<string, unknown>).expectedState
  return s === 'placed' || s === 'found' || s === 'missing' ? { expectedState: s } : null
}

/** Route segment to a positive whole number, or null. */
export function parseIdSegment(raw: string): number | null {
  return /^[0-9]{1,15}$/.test(raw) && Number(raw) > 0 ? Number(raw) : null
}

// ---- Refusals ---------------------------------------------------------------------------------------

export type RoutineErrorCode = MoveRoutineError | 'failed'

const KNOWN: MoveRoutineError[] = [
  'item_not_found', 'moved_since', 'bad_input', 'too_many_items', 'copy_already_assigned',
  'copy_not_found', 'target_not_found', 'wrong_state', 'no_open_slot', 'slot_claimed_elsewhere',
  'copy_already_in_open_item', 'card_identity_mismatch',
]

/** Finds the routine's code inside a database error message; anything else is a plain "failed". */
export function codeFromMoveError(message: string | null | undefined): RoutineErrorCode {
  const text = message ?? ''
  return KNOWN.find((c) => text.includes(c)) ?? 'failed'
}

export function moveErrorStatus(code: RoutineErrorCode): number {
  switch (code) {
    case 'item_not_found':
    case 'copy_not_found':
    case 'target_not_found':
      return 404
    case 'bad_input':
    case 'too_many_items':
      return 400
    case 'failed':
      return 500
    default:
      return 409
  }
}

/** Plain-language refusal. Nothing is changed in any of these cases (each call is all-or-nothing). */
export function moveErrorMessage(code: RoutineErrorCode | string, cardName: string): string {
  switch (code) {
    case 'item_not_found':
      return `That step is no longer on the Picklist. Refresh to see where ${cardName} is now.`
    case 'copy_not_found':
      return `Couldn't find that copy of ${cardName}. Nothing was changed.`
    case 'target_not_found':
      return `That place no longer exists. ${cardName} is still where Oracle had it.`
    case 'wrong_state':
      return `${cardName} has already moved on. Refresh to see where it is now.`
    case 'moved_since':
      return `${cardName} has been moved since then, so Undo would put things out of order. Nothing was changed.`
    case 'slot_claimed_elsewhere':
      return `Its old place has been filled by something else, so ${cardName} can't go back there. Nothing was changed.`
    case 'no_open_slot':
      return `That deck has no open slot for ${cardName}. Pick a box instead.`
    case 'copy_already_assigned':
      return `${cardName} already sits in a deck. Nothing was changed.`
    case 'copy_already_in_open_item':
      return `${cardName} is already on a Picklist step. Cancel that step first.`
    case 'card_identity_mismatch':
      return `That card doesn't match the slot. ${cardName} is still where Oracle had it.`
    case 'bad_input':
      return 'That request was not valid. Nothing was changed.'
    case 'too_many_items':
      return `A Picklist can take up to ${MAX_LIST_ITEMS} cards at a time. Add them in smaller groups.`
    default:
      return `Couldn't save that. ${cardName} is still where Oracle had it.`
  }
}

/** Why one card was left off an "Add to Picklist" (plain, no codes). */
export function skipReasonText(reason: CreateMoveListSkipReason | string, cardName: string): string {
  switch (reason) {
    case 'copy_missing': return `${cardName} is marked Missing`
    case 'copy_already_in_open_item': return `${cardName} is already on another step`
    case 'already_in_this_deck': return `${cardName} is already in that deck`
    case 'already_there': return `${cardName} is already there`
    case 'no_open_slot': return `that deck has no empty slot for ${cardName}`
    case 'target_not_found': return `that place no longer exists for ${cardName}`
    case 'copy_not_found': return `couldn't find that copy of ${cardName}`
    case 'duplicate_in_request': return `${cardName} was listed twice`
    default: return `${cardName} couldn't be added`
  }
}

// ---- Answers ----------------------------------------------------------------------------------------

function mustSucceed(data: unknown, name: string): Record<string, unknown> {
  const d = data as Record<string, unknown> | null
  if (!d || typeof d !== 'object' || d.success !== true) throw new Error(`${name} returned an invalid result`)
  return d
}

export interface CreateListAnswer {
  listId: string | null
  created: CreateMoveListResult['created']
  unchanged: CreateMoveListResult['unchanged']
  skipped: CreateMoveListResult['skipped']
}

export function readCreateListResult(data: unknown): CreateListAnswer {
  const d = mustSucceed(data, 'create_move_list')
  const arr = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : [])
  return {
    listId: typeof d.list_id === 'string' ? d.list_id : null,
    created: arr(d.created),
    unchanged: arr(d.unchanged),
    skipped: arr(d.skipped),
  }
}

export function readTurnedUpResult(data: unknown): TurnedUpResponse {
  const d = mustSucceed(data, 'resolve_missing_copy')
  return {
    success: true,
    unchanged: d.unchanged === true,
    state: d.state as TurnedUpResponse['state'],
    ...(typeof d.location_id === 'number' ? { location_id: d.location_id } : {}),
    ...(typeof d.filled_deck_card_id === 'number' ? { filled_deck_card_id: d.filled_deck_card_id } : {}),
    ...(typeof d.deck_id === 'number' ? { deck_id: d.deck_id } : {}),
  }
}

export interface LookedHereAnswer { itemId: number; unchanged: boolean; lookedIn: Array<{ kind: 'deck' | 'location'; id: number }> }
export function readLookedHereResult(data: unknown): LookedHereAnswer {
  const d = mustSucceed(data, 'record_move_looked_in')
  return {
    itemId: d.item_id as number,
    unchanged: d.unchanged === true,
    lookedIn: Array.isArray(d.looked_in) ? (d.looked_in as LookedHereAnswer['lookedIn']) : [],
  }
}

export function readUndoResult(data: unknown): { itemId: number; state: UndoTickResponse['state']; unchanged: boolean } {
  const d = mustSucceed(data, 'undo_move_tick')
  return { itemId: d.item_id as number, state: d.state as UndoTickResponse['state'], unchanged: d.unchanged === true }
}

export function readCancelResult(data: unknown): { itemId: number; state: CancelStepResponse['state']; unchanged: boolean } {
  const d = mustSucceed(data, 'cancel_move_item')
  return { itemId: d.item_id as number, state: 'cancelled', unchanged: d.unchanged === true }
}

/** The line shown after Undo. */
export function undoToastText(cardName: string, expected: UndoTickRequest['expectedState'], state: 'found' | 'to_find'): string {
  if (expected === 'placed') return `${cardName} is back in your hand.`
  if (state === 'found') return `${cardName} is back in your hand.`
  return `${cardName} is back where it was.`
}
