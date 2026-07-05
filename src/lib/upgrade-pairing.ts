/**
 * Upgrade Pairing — Pure logic module for pairing upgrade candidates with dead weight cuts,
 * applying budget filtering, enforcing format constraints, and sorting results.
 *
 * This module has no database access or MCP calls.
 * It takes pre-fetched data and returns pairing/filtering results.
 */

import {
  type DeadWeightFlag,
  type DeadWeightResult,
  type FormatRules,
  exceedsRarityRestriction,
  RARITY_ORDER,
} from './dead-weight-classifier'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpgradeCandidate {
  cardName: string
  role: string
  synergyScore: number
  reason: string
  owned: boolean
  price: number | null
  rarity?: string | null
}

export interface PairedUpgrade {
  cardName: string
  role: string
  synergyScore: number
  reason: string
  owned: boolean
  price: number | null
  suggestedCut: string | null
  cutFlag: DeadWeightFlag | null
}

export interface UpgradeComputeResult {
  deckId: number
  budgetMode: 'collection' | 'budget' | 'unrestricted'
  upgrades: PairedUpgrade[]
  formatViolations: string[] // cards excluded by format rules
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Priority ordering for dead weight flags — higher priority cuts get matched first */
const FLAG_PRIORITY: Record<DeadWeightFlag, number> = {
  format_violation: 0,
  off_strategy: 1,
  redundant: 2,
  bracket_mismatch: 3,
}

/**
 * Role-to-flag matching heuristic.
 * Maps an upgrade's functional role to the preferred dead weight flag
 * on the cut it should be paired with.
 */
const ROLE_TO_PREFERRED_FLAG: Record<string, DeadWeightFlag> = {
  Ramp: 'redundant',
  Draw: 'redundant',
  Removal: 'off_strategy',
  Counterspell: 'off_strategy',
  'Board Wipe': 'off_strategy',
  Recursion: 'redundant',
  Tutor: 'redundant',
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Pair upgrade candidates with dead weight cards as suggested cuts.
 *
 * Algorithm:
 * 1. Sort dead weight cards by flag priority (format_violation first)
 * 2. Sort upgrade candidates by synergy descending
 * 3. For each upgrade, find the best matching cut:
 *    - Prefer a cut whose flag matches the upgrade's improvement role
 *    - If no preferred match, use first available dead weight card
 * 4. No cut is used for more than one upgrade
 *
 * @param candidates - upgrade candidates with ownership and price data
 * @param deadWeightCards - cards flagged as dead weight in the deck
 * @returns paired upgrades with suggested cuts
 */
export function pairUpgradesWithCuts(
  candidates: UpgradeCandidate[],
  deadWeightCards: DeadWeightResult[]
): PairedUpgrade[] {
  // Sort candidates by synergy descending
  const sortedCandidates = [...candidates].sort(
    (a, b) => b.synergyScore - a.synergyScore
  )

  // Sort dead weight cards by flag priority (format_violation > off_strategy > redundant > bracket_mismatch)
  const availableCuts = [...deadWeightCards].sort(
    (a, b) => FLAG_PRIORITY[a.flag] - FLAG_PRIORITY[b.flag]
  )

  // Track which cuts have been used
  const usedCuts = new Set<string>()

  const paired: PairedUpgrade[] = sortedCandidates.map((candidate) => {
    const preferredFlag = ROLE_TO_PREFERRED_FLAG[candidate.role]

    // Try to find a preferred match first
    let matchedCut: DeadWeightResult | undefined

    if (preferredFlag) {
      matchedCut = availableCuts.find(
        (cut) => cut.flag === preferredFlag && !usedCuts.has(cut.cardName)
      )
    }

    // Fallback: use first available dead weight card
    if (!matchedCut) {
      matchedCut = availableCuts.find(
        (cut) => !usedCuts.has(cut.cardName)
      )
    }

    // Mark the cut as used
    if (matchedCut) {
      usedCuts.add(matchedCut.cardName)
    }

    return {
      cardName: candidate.cardName,
      role: candidate.role,
      synergyScore: candidate.synergyScore,
      reason: candidate.reason,
      owned: candidate.owned,
      price: candidate.price,
      suggestedCut: matchedCut?.cardName ?? null,
      cutFlag: matchedCut?.flag ?? null,
    }
  })

  return paired
}

/**
 * Apply budget mode filtering to upgrade candidates.
 *
 * - collection: only cards where owned = true
 * - budget: owned = true OR price ≤ budgetCeiling
 * - unrestricted: all cards pass
 *
 * @param upgrades - paired upgrades to filter
 * @param budgetMode - the active budget mode
 * @param budgetCeiling - the maximum price (used only for 'budget' mode)
 * @returns filtered upgrades matching the budget criteria
 */
export function applyBudgetFilter(
  upgrades: PairedUpgrade[],
  budgetMode: 'collection' | 'budget' | 'unrestricted',
  budgetCeiling: number | null
): PairedUpgrade[] {
  switch (budgetMode) {
    case 'collection':
      return upgrades.filter((u) => u.owned)

    case 'budget':
      return upgrades.filter(
        (u) => u.owned || (u.price !== null && budgetCeiling !== null && u.price <= budgetCeiling)
      )

    case 'unrestricted':
      return upgrades

    default:
      return upgrades
  }
}

/**
 * Apply format constraints to upgrade candidates.
 *
 * Enforces:
 * - rarity_restriction: exclude upgrades whose rarity exceeds the max allowed
 * - swap_limit: when existingSwapCount >= limit, return no additional suggestions
 * - value_cap: exclude candidates where existingAddedValue + price > cap
 *
 * @param upgrades - paired upgrades to constrain
 * @param formatRules - the deck's format rules (or null if none)
 * @param existingSwapCount - number of swaps already made
 * @param existingAddedValue - cumulative dollar value already added
 * @returns accepted upgrades and list of rejected card names
 */
export function applyFormatConstraints(
  upgrades: PairedUpgrade[],
  formatRules: FormatRules | null,
  existingSwapCount: number,
  existingAddedValue: number
): { accepted: PairedUpgrade[]; rejected: string[] } {
  if (!formatRules) {
    return { accepted: upgrades, rejected: [] }
  }

  // Swap limit: if already at or over the limit, return nothing
  if (
    formatRules.swap_limit !== undefined &&
    existingSwapCount >= formatRules.swap_limit
  ) {
    return {
      accepted: [],
      rejected: upgrades.map((u) => u.cardName),
    }
  }

  const accepted: PairedUpgrade[] = []
  const rejected: string[] = []
  let runningValue = existingAddedValue

  for (const upgrade of upgrades) {
    let excluded = false

    // Rarity restriction check
    if (formatRules.rarity_restriction && (upgrade as UpgradeCandidate & { rarity?: string | null }).rarity) {
      // We need rarity data on the upgrade — check via the extended type
      // The PairedUpgrade doesn't carry rarity directly, so we use a cast pattern.
      // In practice, the caller should attach rarity before calling this function.
      // We'll check via a type-safe pattern using Object access.
      const rarity = (upgrade as unknown as { rarity?: string | null }).rarity
      if (rarity && exceedsRarityRestriction(rarity, formatRules.rarity_restriction)) {
        excluded = true
      }
    }

    // Value cap check
    if (
      !excluded &&
      formatRules.value_cap !== undefined &&
      upgrade.price !== null
    ) {
      if (runningValue + upgrade.price > formatRules.value_cap) {
        excluded = true
      }
    }

    // Swap limit: check if adding this upgrade would exceed the limit
    if (
      !excluded &&
      formatRules.swap_limit !== undefined &&
      existingSwapCount + accepted.length >= formatRules.swap_limit
    ) {
      excluded = true
    }

    if (excluded) {
      rejected.push(upgrade.cardName)
    } else {
      if (upgrade.price !== null && formatRules.value_cap !== undefined) {
        runningValue += upgrade.price
      }
      accepted.push(upgrade)
    }
  }

  return { accepted, rejected }
}

/**
 * Extended version of applyFormatConstraints that accepts rarity data alongside upgrades.
 * This allows format rarity checking without modifying the PairedUpgrade type.
 *
 * @param upgrades - paired upgrades to constrain
 * @param rarities - map of cardName → rarity string
 * @param formatRules - the deck's format rules (or null if none)
 * @param existingSwapCount - number of swaps already made
 * @param existingAddedValue - cumulative dollar value already added
 * @returns accepted upgrades and list of rejected card names
 */
export function applyFormatConstraintsWithRarity(
  upgrades: PairedUpgrade[],
  rarities: Map<string, string>,
  formatRules: FormatRules | null,
  existingSwapCount: number,
  existingAddedValue: number
): { accepted: PairedUpgrade[]; rejected: string[] } {
  if (!formatRules) {
    return { accepted: upgrades, rejected: [] }
  }

  // Swap limit: if already at or over the limit, return nothing
  if (
    formatRules.swap_limit !== undefined &&
    existingSwapCount >= formatRules.swap_limit
  ) {
    return {
      accepted: [],
      rejected: upgrades.map((u) => u.cardName),
    }
  }

  const accepted: PairedUpgrade[] = []
  const rejected: string[] = []
  let runningValue = existingAddedValue

  for (const upgrade of upgrades) {
    let excluded = false

    // Rarity restriction check
    if (formatRules.rarity_restriction) {
      const rarity = rarities.get(upgrade.cardName)
      if (rarity && exceedsRarityRestriction(rarity, formatRules.rarity_restriction)) {
        excluded = true
      }
    }

    // Value cap check
    if (
      !excluded &&
      formatRules.value_cap !== undefined &&
      upgrade.price !== null
    ) {
      if (runningValue + upgrade.price > formatRules.value_cap) {
        excluded = true
      }
    }

    // Swap limit: check if adding this upgrade would exceed the limit
    if (
      !excluded &&
      formatRules.swap_limit !== undefined &&
      existingSwapCount + accepted.length >= formatRules.swap_limit
    ) {
      excluded = true
    }

    if (excluded) {
      rejected.push(upgrade.cardName)
    } else {
      if (upgrade.price !== null && formatRules.value_cap !== undefined) {
        runningValue += upgrade.price
      }
      accepted.push(upgrade)
    }
  }

  return { accepted, rejected }
}

/**
 * Sort upgrades: owned first, then synergy descending within each group.
 *
 * @param upgrades - upgrades to sort
 * @returns sorted array (new array, does not mutate input)
 */
export function sortUpgrades(upgrades: PairedUpgrade[]): PairedUpgrade[] {
  return [...upgrades].sort((a, b) => {
    // Owned cards come first
    if (a.owned && !b.owned) return -1
    if (!a.owned && b.owned) return 1
    // Within same ownership group, sort by synergy descending
    return b.synergyScore - a.synergyScore
  })
}
