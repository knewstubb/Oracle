/**
 * Deck destination placement rules (contract 4c, slice I2). Pure: no database, no network.
 *
 * For each imported copy, in file order:
 *  1. A basic land fills an empty tracked basic slot of that name; otherwise it goes to Unsorted.
 *  2. A copy fills an empty main-deck slot for the same card: the exact printing and finish first,
 *     then any empty slot for that card (lowest id first).
 *  3. A card the deck does not list becomes a new slot holding the copy, up to the format's copy limit.
 *  4. Otherwise it goes to Unsorted with a reason: already filled, maybeboard only, basic land.
 *
 * Nothing here blocks on colour identity or legality; those only warn, after placing (owner decision).
 */

export type UnsortedReason = 'already_filled' | 'maybeboard_only' | 'basic_land' | 'could_not_place'

export interface PlannerSlot {
  id: number
  cardName: string
  printingId: string | null
  finish: string | null
  /** The owned copy already in this slot, or null when the slot is empty. */
  copyId: number | null
  isMaybeboard: boolean
}

export interface PlannerCopy {
  /** Position in the imported file, so results line up with the rows. */
  index: number
  cardName: string
  printingId: string | null
  finish: string | null
  isBasicLand: boolean
}

export type CopyOutcome =
  | { index: number; kind: 'filled'; slotId: number; exact: boolean }
  | { index: number; kind: 'added'; newSlotKey: number }
  | { index: number; kind: 'unsorted'; reason: UnsortedReason }

export interface DeckImportPlan {
  outcomes: CopyOutcome[]
  counts: {
    filled: number
    added: number
    unsorted: number
    /** Filled with a different printing or finish than the slot planned. */
    differsFromPlan: number
    unsortedByReason: Record<UnsortedReason, number>
  }
}

export interface PlannerOptions {
  /** Copies of one card the format allows (1 for singleton formats). */
  maxCopies: number
}

const norm = (s: string) => s.trim().toLowerCase()

export function planDeckImport(slots: readonly PlannerSlot[], copies: readonly PlannerCopy[], options: PlannerOptions): DeckImportPlan {
  const maxCopies = Math.max(1, options.maxCopies)
  // Empty main-deck slots per card, lowest id first. Taken slots are removed as they fill.
  const empty = new Map<string, PlannerSlot[]>()
  const mainCount = new Map<string, number>()
  const maybeboardNames = new Set<string>()
  for (const slot of [...slots].sort((a, b) => a.id - b.id)) {
    const key = norm(slot.cardName)
    if (slot.isMaybeboard) {
      maybeboardNames.add(key)
      continue
    }
    mainCount.set(key, (mainCount.get(key) ?? 0) + 1)
    if (slot.copyId === null) {
      const list = empty.get(key) ?? []
      list.push(slot)
      empty.set(key, list)
    }
  }

  const outcomes: CopyOutcome[] = []
  let newSlotKey = 0
  const emptyReasons: Record<UnsortedReason, number> = { already_filled: 0, maybeboard_only: 0, basic_land: 0, could_not_place: 0 }
  let filled = 0
  let added = 0
  let differsFromPlan = 0

  for (const copy of copies) {
    const key = norm(copy.cardName)
    const open = empty.get(key) ?? []

    if (open.length > 0) {
      const exactAt = open.findIndex(
        (s) => s.printingId !== null && s.printingId === copy.printingId && (s.finish ?? 'nonfoil') === (copy.finish ?? 'nonfoil')
      )
      const at = exactAt >= 0 ? exactAt : 0
      const [slot] = open.splice(at, 1)
      outcomes.push({ index: copy.index, kind: 'filled', slotId: slot.id, exact: exactAt >= 0 })
      filled++
      if (exactAt < 0 && slot.printingId !== null) differsFromPlan++
      continue
    }

    if (copy.isBasicLand) {
      outcomes.push({ index: copy.index, kind: 'unsorted', reason: 'basic_land' })
      emptyReasons.basic_land++
      continue
    }

    const existing = mainCount.get(key) ?? 0
    if (existing === 0 && maybeboardNames.has(key)) {
      outcomes.push({ index: copy.index, kind: 'unsorted', reason: 'maybeboard_only' })
      emptyReasons.maybeboard_only++
      continue
    }

    if (existing < maxCopies) {
      mainCount.set(key, existing + 1)
      outcomes.push({ index: copy.index, kind: 'added', newSlotKey: newSlotKey++ })
      added++
      continue
    }

    outcomes.push({ index: copy.index, kind: 'unsorted', reason: 'already_filled' })
    emptyReasons.already_filled++
  }

  const unsorted = copies.length - filled - added
  return { outcomes, counts: { filled, added, unsorted, differsFromPlan, unsortedByReason: emptyReasons } }
}

/** Plain-language reason shown next to a copy that went to Unsorted. */
export function unsortedReasonText(reason: UnsortedReason): string {
  switch (reason) {
    case 'already_filled':
      return 'This deck already has that card filled.'
    case 'maybeboard_only':
      return 'That card is only on the deck’s Maybeboard.'
    case 'basic_land':
      return 'Basic lands only go in when the deck has an empty basic land slot.'
    case 'could_not_place':
      return 'It could not be placed in the deck.'
  }
}

/**
 * Picklist offer after an import (spec 21.7). Unsorted → offer all; a box or binder → none;
 * a deck → offer only the copies that went to Unsorted ("Add 1" when one), none when none did.
 */
export type PicklistOffer = { kind: 'none' } | { kind: 'all'; count: number } | { kind: 'some'; count: number }

export function picklistOffer(destination: 'unsorted' | 'storage' | 'deck', total: number, sentToUnsorted: number): PicklistOffer {
  if (destination === 'unsorted') return total > 0 ? { kind: 'all', count: total } : { kind: 'none' }
  if (destination === 'storage') return { kind: 'none' }
  return sentToUnsorted > 0 ? { kind: 'some', count: sentToUnsorted } : { kind: 'none' }
}
