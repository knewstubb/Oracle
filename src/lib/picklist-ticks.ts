/**
 * Picklist ticks: pure helpers (no database). Contract: docs/oracle/contracts/know-where-cards-are.md sections 4, 5, 6.
 * The stored routine is `picklist_tick(p_user_id, p_action, p_copy_id, p_to)`; every refusal is a short code
 * (copy_not_found, copy_missing, target_not_found, wrong_state, no_open_slot, already_in_this_deck, not_in_hand,
 * copy_already_in_open_item). This file turns requests into the routine's input and codes into plain sentences.
 */
import type { PlaceRef } from '../../docs/oracle/contracts/know-where-cards-are.types'

export type PicklistTickAction = 'found' | 'placed' | 'cant_find'

/** URL segment -> routine action. */
export const TICK_ACTION_BY_SEGMENT: Record<string, PicklistTickAction> = {
  found: 'found',
  placed: 'placed',
  'cant-find': 'cant_find',
}

export interface TickRequest {
  copyId: number
  to: PlaceRef
  /** Display only (D-003); used in messages. */
  cardName: string
}

const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0

/** Validates a request body. Returns null when it is not usable (the route answers 400). */
export function parseTickBody(body: unknown): TickRequest | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  if (!isPositiveInt(b.copyId)) return null
  const to = b.to as Record<string, unknown> | null | undefined
  if (typeof to !== 'object' || to === null) return null
  const cardName = typeof b.cardName === 'string' && b.cardName.trim() ? b.cardName.trim() : 'that card'
  if (to.kind === 'deck') {
    if (!isPositiveInt(to.deckId)) return null
    if (to.deckCardId !== undefined && !isPositiveInt(to.deckCardId)) return null
    return {
      copyId: b.copyId,
      cardName,
      to: to.deckCardId === undefined ? { kind: 'deck', deckId: to.deckId } : { kind: 'deck', deckId: to.deckId, deckCardId: to.deckCardId as number },
    }
  }
  if (to.kind === 'location') {
    if (!isPositiveInt(to.locationId)) return null
    return { copyId: b.copyId, cardName, to: { kind: 'location', locationId: to.locationId } }
  }
  return null
}

/** The routine's `p_to` argument. */
export function toRoutineTarget(to: PlaceRef): Record<string, unknown> {
  return to.kind === 'deck'
    ? { kind: 'deck', deckId: to.deckId, ...(to.deckCardId ? { deckCardId: to.deckCardId } : {}) }
    : { kind: 'location', locationId: to.locationId }
}

export type TickErrorCode =
  | 'copy_not_found' | 'copy_missing' | 'target_not_found' | 'wrong_state' | 'no_open_slot'
  | 'already_in_this_deck' | 'not_in_hand' | 'copy_already_in_open_item' | 'failed'

const KNOWN: TickErrorCode[] = [
  'copy_not_found', 'copy_missing', 'target_not_found', 'wrong_state', 'no_open_slot',
  'already_in_this_deck', 'not_in_hand', 'copy_already_in_open_item',
]

/** Finds the routine's code inside a database error message; anything else is a plain "failed". */
export function codeFromRoutineError(message: string | null | undefined): TickErrorCode {
  const text = message ?? ''
  return KNOWN.find((c) => text.includes(c)) ?? 'failed'
}

export function tickErrorStatus(code: TickErrorCode): number {
  switch (code) {
    case 'copy_not_found':
    case 'target_not_found':
      return 404
    case 'wrong_state':
    case 'no_open_slot':
    case 'copy_already_in_open_item':
    case 'copy_missing':
    case 'already_in_this_deck':
    case 'not_in_hand':
      return 409
    default:
      return 500
  }
}

/** Plain-language refusal. Nothing is changed in any of these cases (each tick is one all-or-nothing step). */
export function tickErrorMessage(code: TickErrorCode | string, cardName: string): string {
  switch (code) {
    case 'copy_not_found':
      return `Couldn't find that copy of ${cardName}. Nothing was changed.`
    case 'copy_missing':
      return `${cardName} is marked Missing, so it can't be picked up or placed.`
    case 'target_not_found':
      return `That place no longer exists. ${cardName} is still where Oracle had it.`
    case 'wrong_state':
      return `${cardName} has already moved on. Refresh to see where it is now.`
    case 'no_open_slot':
      return `That deck has no open slot for ${cardName}. Add it to the deck first, or put it in a box.`
    case 'already_in_this_deck':
      return `${cardName} is already in this deck.`
    case 'not_in_hand':
      return `${cardName} isn't in your hand. Tick Picked first.`
    case 'copy_already_in_open_item':
      return `${cardName} is already on a Picklist step.`
    default:
      return `Couldn't save that. ${cardName} is still where Oracle had it.`
  }
}

export interface TickResult {
  itemId: number | null
  state: 'found' | 'placed' | 'missing' | 'to_find'
  unchanged: boolean
  /** Found: the deck that is now short by one. */
  sourceDeckNowShort: Array<{ deckId: number; deckName: string; cardName: string }>
  /** Can't find it: every deck left short. */
  decksNowShort: Array<{ deckId: number; deckName: string; cardName: string }>
  filledDeckCardId: number | null
}

/** Reads the routine's jsonb answer into a typed result; throws when it is not a success. */
export function readTickResult(data: unknown): TickResult {
  const d = data as Record<string, unknown> | null
  if (!d || typeof d !== 'object' || d.success !== true) throw new Error('picklist_tick returned an invalid result')
  const list = (v: unknown) => (Array.isArray(v) ? (v as TickResult['decksNowShort']) : [])
  return {
    itemId: typeof d.item_id === 'number' ? d.item_id : null,
    state: d.state as TickResult['state'],
    unchanged: d.unchanged === true,
    sourceDeckNowShort: list(d.source_deck_now_short),
    decksNowShort: list(d.decks_now_short),
    filledDeckCardId: typeof d.filled_deck_card_id === 'number' ? d.filled_deck_card_id : null,
  }
}

/** The line shown (and announced) after a tick (spec 9.3). */
export function tickToastText(action: PicklistTickAction, cardName: string, result: TickResult, placeName?: string): string {
  if (action === 'found') {
    const short = result.sourceDeckNowShort[0]
    return short
      ? `${cardName} is in your hand. ${short.deckName} is now short by one.`
      : `${cardName} is in your hand.`
  }
  if (action === 'placed') return placeName ? `${cardName} placed in ${placeName}.` : `${cardName} placed.`
  return `${cardName} flagged Missing.`
}
