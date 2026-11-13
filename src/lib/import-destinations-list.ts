/**
 * Places an import can go: pure helpers for GET /api/import/destinations and the picker.
 * Contract: docs/oracle/contracts/know-where-cards-are.md section 4c. No database access here.
 */

import { computeDeckReadiness } from '@/lib/deck-readiness'
import { getFormatConfig } from '@/lib/format-config'
import type { DestinationsResponse } from '../../docs/oracle/contracts/know-where-cards-are.types'

export interface DestinationSlotRow {
  copy_id: number | null
  is_generic: boolean | null
  generic_sleeved: boolean | null
  categories: string | null
}

export type DestinationDeckStatus = DestinationsResponse['decks'][number]['status']

export function isMaybeboardCategories(categories: string | null | undefined): boolean {
  return !!categories && categories.includes('Maybeboard')
}

/** Empty planned slots on the main list (a generic basic has no tracked copy, so it is never "empty"). */
export function countEmptySlots(slots: readonly DestinationSlotRow[]): number {
  return slots.filter((s) => !isMaybeboardCategories(s.categories) && !s.is_generic && s.copy_id === null).length
}

/** Readiness word for the picker hint. Maybeboard rows are not part of the deck. */
export function destinationDeckStatus(slots: readonly DestinationSlotRow[], format: string | null): DestinationDeckStatus {
  const main = slots.filter((s) => !isMaybeboardCategories(s.categories))
  const readiness = computeDeckReadiness(main, getFormatConfig(format).deckSize)
  if (readiness.state === 'draft') return 'draft'
  const tracked = main.filter((s) => !s.is_generic)
  if (tracked.length > 0 && tracked.every((s) => s.copy_id === null)) return 'unowned'
  return readiness.state
}

const STATUS_WORDS: Record<DestinationDeckStatus, string> = {
  unowned: 'Unowned',
  assembling: 'Assembling',
  playable: 'Playable',
  draft: 'Draft',
}

export function statusWord(status: DestinationDeckStatus): string {
  return STATUS_WORDS[status]
}

/** "9 empty slots" / "1 empty slot" / "no empty slots". */
export function emptySlotsHint(emptySlots: number): string {
  if (emptySlots === 0) return 'no empty slots'
  return `${emptySlots} empty ${emptySlots === 1 ? 'slot' : 'slots'}`
}

/** Search shows only when there are more than 8 places in total (spec 21.4). */
export const DESTINATION_SEARCH_THRESHOLD = 8

export function showDestinationSearch(storageCount: number, deckCount: number): boolean {
  return storageCount + deckCount > DESTINATION_SEARCH_THRESHOLD
}

/** Case-insensitive match anywhere in the name; empty query matches all. */
export function filterByName<T extends { name: string }>(items: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...items]
  return items.filter((i) => i.name.toLowerCase().includes(q))
}

export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}
