import { countsAsSleeved } from '@/lib/basic-lands'
/**
 * Automatic deck status: Brewing (none sleeved), Assembling (some sleeved), Playable (list meets the
 * format target and every card is sleeved). Pass only countable rows (not Maybeboard / Sideboard).
 * "Sleeved" is the same rule as the deck page header and the tile's "(N sleeved)" count.
 */

export interface ReadinessSlot {
  copy_id?: number | null
  is_generic?: boolean | null
  generic_sleeved?: boolean | null
}

export interface DeckReadiness {
  /** Cards in the deck (generics included, any state). */
  size: number
  /** Cards that are physically sleeved (real copy, or a Sleeved generic). */
  sleeved: number
  unsleevedGenerics: number
  state: 'brewing' | 'assembling' | 'playable'
}

export function computeDeckReadiness(
  slots: readonly ReadinessSlot[],
  required: number | null,
  countRule: 'exact' | 'minimum' | null = 'exact'
): DeckReadiness {
  let sleeved = 0
  let unsleevedGenerics = 0
  for (const slot of slots) {
    if (slot.is_generic && slot.generic_sleeved === false) unsleevedGenerics++
    if (countsAsSleeved(slot)) sleeved++
  }
  const size = slots.length
  // Brewing: nothing sleeved. Playable: every counted card sleeved and the list meets the format target.
  // Commander (exact 100): 99 or 101 sleeved cards are never Playable.
  let meetsTarget: boolean
  if (required === null || countRule === null) meetsTarget = size > 0
  else if (countRule === 'exact') meetsTarget = size === required
  else meetsTarget = size >= required
  return {
    size,
    sleeved,
    unsleevedGenerics,
    state: sleeved === 0 ? 'brewing' : sleeved === size && meetsTarget ? 'playable' : 'assembling',
  }
}
