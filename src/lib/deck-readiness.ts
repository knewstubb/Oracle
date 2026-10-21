/**
 * Deck readiness from sleeved counts (D-002, generic-basic-lands §3A).
 *
 * A generic basic counts toward the deck SIZE whatever its state, but toward "sleeved N/100" only
 * while Sleeved. A complete list with any Unsleeved generic is Assembling, not Playable.
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
  state: 'draft' | 'assembling' | 'playable'
}

export function computeDeckReadiness(slots: readonly ReadinessSlot[], required: number | null): DeckReadiness {
  let sleeved = 0
  let unsleevedGenerics = 0
  for (const slot of slots) {
    if (slot.is_generic) {
      if (slot.generic_sleeved === false) unsleevedGenerics++
      else sleeved++
    } else if (slot.copy_id != null) {
      sleeved++
    }
  }
  const size = slots.length
  const complete = required === null ? size > 0 : size >= required
  const allSleeved = sleeved === size
  return {
    size,
    sleeved,
    unsleevedGenerics,
    state: !complete ? 'draft' : allSleeved ? 'playable' : 'assembling',
  }
}
