// precon-mod-engine.ts — Pure computation logic for precon mod state.
// No database dependencies; this module is imported by the store, API, and tests.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreconModInput {
  /** Cards currently in the deck */
  deckCards: Array<{ card_name: string; rarity: string | null; price_ck: number | null }>
  /** Cards from the original precon list */
  preconCards: Array<{ card_name: string }>
}

export interface PreconModState {
  swaps_used: number
  sol_ring_removed: boolean
  rarity_mythic_used: number
  rarity_rare_used: number
  rarity_uncommon_used: number
  rarity_common_used: number
  budget_spent: number
}

export interface TradeDownResult {
  mythic_total: number   // always 1
  rare_total: number     // base 2 + unused mythic slots
  uncommon_total: number // base 3 + unused rare slots (after trade-down)
  common_total: number   // base 4 + unused uncommon slots (after trade-down)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a card name for case-insensitive comparison. */
function normalise(name: string): string {
  return name.toLowerCase().trim()
}

// ---------------------------------------------------------------------------
// computePreconModState
// ---------------------------------------------------------------------------

/**
 * Compute the precon mod state from a deck diff.
 * Pure function — no DB access, no side effects.
 *
 * - Cards in deckCards but NOT in preconCards → "added" (contribute to swaps, rarity, budget)
 * - Cards in preconCards but NOT in deckCards → "removed" (contribute to swap count only)
 * - Sol Ring removal is detected by its absence from deckCards
 */
export function computePreconModState(input: PreconModInput): PreconModState {
  const { deckCards, preconCards } = input

  // Build sets for fast lookup (case-insensitive)
  const deckSet = new Set(deckCards.map((c) => normalise(c.card_name)))
  const preconSet = new Set(preconCards.map((c) => normalise(c.card_name)))

  // Cards added: in deck but not in precon
  const addedCards = deckCards.filter((c) => !preconSet.has(normalise(c.card_name)))

  // Cards removed: in precon but not in deck
  const removedCount = preconCards.filter((c) => !deckSet.has(normalise(c.card_name))).length

  // Swaps = cards added (not in precon) + cards removed (were in precon)
  const swaps_used = addedCards.length + removedCount

  // Sol Ring check (case-insensitive)
  const sol_ring_removed = !deckSet.has(normalise('Sol Ring'))

  // Rarity tallies from added cards only
  let rarity_mythic_used = 0
  let rarity_rare_used = 0
  let rarity_uncommon_used = 0
  let rarity_common_used = 0
  let budget_spent = 0

  for (const card of addedCards) {
    const rarity = card.rarity?.toLowerCase().trim() ?? ''
    if (rarity === 'mythic') rarity_mythic_used++
    else if (rarity === 'rare') rarity_rare_used++
    else if (rarity === 'uncommon') rarity_uncommon_used++
    else if (rarity === 'common') rarity_common_used++

    budget_spent += card.price_ck ?? 0
  }

  return {
    swaps_used,
    sol_ring_removed,
    rarity_mythic_used,
    rarity_rare_used,
    rarity_uncommon_used,
    rarity_common_used,
    budget_spent,
  }
}

// ---------------------------------------------------------------------------
// computeTradeDown
// ---------------------------------------------------------------------------

/**
 * Compute trade-down rarity totals from current usage.
 * Pure function — called at render time.
 *
 * Trade-down logic:
 * - mythic_total is always 1
 * - rare_total = 2 + max(0, 1 - mythic_used)
 * - uncommon_total = 3 + max(0, rare_total - rare_used)
 * - common_total = 4 + max(0, uncommon_total - uncommon_used)
 */
export function computeTradeDown(
  state: Pick<PreconModState, 'rarity_mythic_used' | 'rarity_rare_used' | 'rarity_uncommon_used' | 'rarity_common_used'>
): TradeDownResult {
  const mythic_total = 1
  const rare_total = 2 + Math.max(0, 1 - state.rarity_mythic_used)
  const uncommon_total = 3 + Math.max(0, rare_total - state.rarity_rare_used)
  const common_total = 4 + Math.max(0, uncommon_total - state.rarity_uncommon_used)

  return {
    mythic_total,
    rare_total,
    uncommon_total,
    common_total,
  }
}

// ---------------------------------------------------------------------------
// budgetColour
// ---------------------------------------------------------------------------

/**
 * Determine the budget progress bar colour based on spend ratio.
 *
 * - teal: spent/cap <= 0.8
 * - amber: 0.8 < spent/cap <= 1.0
 * - red: spent/cap > 1.0
 */
export function budgetColour(spent: number, cap: number): 'teal' | 'amber' | 'red' {
  const ratio = spent / cap
  if (ratio <= 0.8) return 'teal'
  if (ratio <= 1.0) return 'amber'
  return 'red'
}
