/**
 * Pure utility functions for sorting, filtering, and partitioning upgrade candidates.
 *
 * No React, no DB, no side effects — these are standalone functions
 * used by the UpgradeTab component and tested via property-based tests.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OwnershipStatus = 'original' | 'proxy' | null

export type SortMode = 'impact' | 'cheapest' | 'owned' | 'edhrec'

export type FilterChip = 'owned_only' | 'under_5'

export interface UpgradeCandidate {
  priority: number
  impact: number // 0–100
  source: 'debrief' | 'analysis'
  cut: {
    card_name: string
    reason: string
    ownership_status: OwnershipStatus
    holder_deck_name?: string
  }
  add: {
    card_name: string
    reason: string
    ownership_status: OwnershipStatus
    holder_deck_name?: string
    edhrec_percent?: number
    price?: number
  }
  conflict?: {
    deck_name: string
  }
}

// ---------------------------------------------------------------------------
// Ownership tier mapping (for 'owned' sort mode)
// ---------------------------------------------------------------------------

const OWNERSHIP_TIER: Record<OwnershipStatus, number> = {
  original: 0,
  proxy: 1,
  not_owned: 2,
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

/**
 * Sort candidates by the given mode.
 *
 * - `impact`: descending by impact score
 * - `cheapest`: ascending by add card price (missing price treated as 999)
 * - `owned`: ascending by ownership tier (original=0, proxy=1, not_owned=2)
 * - `edhrec`: descending by EDHREC percentage (missing treated as 0)
 */
export function sortCandidates(
  candidates: UpgradeCandidate[],
  mode: SortMode
): UpgradeCandidate[] {
  return [...candidates].sort(comparatorForMode(mode))
}

function comparatorForMode(mode: SortMode): (a: UpgradeCandidate, b: UpgradeCandidate) => number {
  switch (mode) {
    case 'impact':
      return (a, b) => b.impact - a.impact
    case 'cheapest':
      return (a, b) => (a.add.price ?? 999) - (b.add.price ?? 999)
    case 'owned':
      return (a, b) =>
        OWNERSHIP_TIER[a.add.ownership_status] - OWNERSHIP_TIER[b.add.ownership_status]
    case 'edhrec':
      return (a, b) => (b.add.edhrec_percent ?? 0) - (a.add.edhrec_percent ?? 0)
  }
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

/**
 * Filter candidates by active filter chips.
 *
 * - `owned_only`: keep only candidates where add card ownership_status is 'original' or 'proxy'
 * - `under_5`: keep only candidates where add card price < 5
 */
export function filterCandidates(
  candidates: UpgradeCandidate[],
  filters: Set<FilterChip>
): UpgradeCandidate[] {
  let result = candidates

  if (filters.has('owned_only')) {
    result = result.filter(
      (c) => c.add.ownership_status === 'original' || c.add.ownership_status === 'proxy'
    )
  }

  if (filters.has('under_5')) {
    result = result.filter((c) => (c.add.price ?? 0) < 5)
  }

  return result
}

// ---------------------------------------------------------------------------
// Partition by source (debrief-first)
// ---------------------------------------------------------------------------

/**
 * Partition candidates so all debrief-sourced candidates appear before
 * all analysis-sourced candidates. Order within each partition is preserved.
 *
 * This should be called AFTER filter and sort so that the within-partition
 * ordering reflects the active SortMode.
 */
export function partitionBySource(candidates: UpgradeCandidate[]): UpgradeCandidate[] {
  const debrief = candidates.filter((c) => c.source === 'debrief')
  const analysis = candidates.filter((c) => c.source === 'analysis')
  return [...debrief, ...analysis]
}
