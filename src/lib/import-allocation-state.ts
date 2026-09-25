/**
 * Import Allocation State — presentation state for the import-reconciliation list
 *
 * The summary lists only cards that need attention or carry a decision. Each
 * listed card is in exactly one of three states, derived from `owned` (real
 * copies the user has) and `sleeved` (slots demanding a REAL copy — claims whose
 * recorded intent is 'sleeve', plus already-finalized real sleeves):
 *
 * - `over`     — owned > 0 but demand exceeds it. A genuine physical
 *                impossibility needing a decision (Release to Planned, Proxy,
 *                or leave it unresolved).
 * - `unowned`  — owned === 0 with sleeve intent. NOT a conflict: no real copy is
 *                being double-booked, there is no surplus to release. Shown in
 *                the app's unowned pink; the sensible actions are Proxy or leave
 *                it Planned.
 * - `resolved` — demand fits within supply. Only LISTED when the user has
 *                recorded at least one non-sleeve decision (`decidedCount > 0`),
 *                shown green: the decision is visible AND reversible (flip a
 *                deck back to Sleeve and the conflict re-appears). Cards that
 *                were never contended and were never touched are omitted.
 *
 * `resolveAllocationState` trusts the database's `state` field when present and
 * otherwise derives it from `owned`/`sleeved`. The fallback matters because the
 * server function ships separately from the client — before a new migration is
 * applied, older payloads still carry the previous shapes ('balanced', or only
 * the legacy `overAllocated` flag) and must keep rendering correctly.
 *
 * See `.kiro/specs/deck-import-conflicts/requirements.md` (State Taxonomy).
 */

export type ImportAllocationState = 'over' | 'unowned' | 'resolved'

export interface AllocationStateInput {
  /** Real (non-proxy, non-missing) copies owned of this card, any printing. */
  owned: number
  /** Slots demanding a real copy: sleeve-intent claims + finalized real sleeves. */
  sleeved: number
  /** Server-derived state, when the payload is new enough to include it. */
  state?: string | null
  /** Legacy boolean. Only meaningful for the pre-`state` payload shape. */
  overAllocated?: boolean
  /** Slots with a recorded non-sleeve decision (Release/Proxy). v2 payloads. */
  decidedCount?: number
}

/** Resolve the presentation state for one allocation row. */
export function resolveAllocationState(allocation: AllocationStateInput): ImportAllocationState {
  const { state } = allocation
  if (state === 'over' || state === 'unowned' || state === 'resolved') return state
  // Legacy payload: 'balanced' meant "demand covered" — same meaning as resolved.
  if (state === 'balanced') return 'resolved'

  // No usable `state` from the server — derive it. A card the user owns nothing of
  // can never be over-committed, so `unowned` must be checked before the demand
  // comparison (which would otherwise be 1 > 0 on every unowned card).
  if (!(allocation.owned > 0)) return 'unowned'

  if (typeof allocation.overAllocated === 'boolean') {
    return allocation.overAllocated ? 'over' : 'resolved'
  }
  return allocation.sleeved > allocation.owned ? 'over' : 'resolved'
}

/**
 * Whether a card belongs in the reconciliation list. Over-committed and unowned
 * cards always show. A resolved card shows only when the user has decided
 * something about it (Release/Proxy) — that keeps the decision visible and
 * reversible, while untouched covered cards stay out of the way.
 */
export function shouldDisplayAllocation(allocation: AllocationStateInput): boolean {
  const state = resolveAllocationState(allocation)
  if (state === 'over' || state === 'unowned') return true
  return (allocation.decidedCount ?? 0) > 0
}

export interface AllocationStateCounts {
  /** Genuine over-commitments — the conflict count to surface. */
  over: number
  /** Cards the user owns nothing of. Not conflicts. */
  unowned: number
  /** Resolved cards with at least one decision (the green rows actually shown). */
  resolved: number
  /** Resolved cards with no decisions — present in the payload but not listed. */
  hidden: number
  /** Every row in the payload, listed or not. */
  total: number
}

/** Tally a whole allocation list by state (conflicts are `over` only). */
export function countAllocationStates(
  allocations: readonly AllocationStateInput[]
): AllocationStateCounts {
  const counts: AllocationStateCounts = {
    over: 0,
    unowned: 0,
    resolved: 0,
    hidden: 0,
    total: allocations.length,
  }
  for (const allocation of allocations) {
    const state = resolveAllocationState(allocation)
    if (state === 'over') counts.over += 1
    else if (state === 'unowned') counts.unowned += 1
    else if (shouldDisplayAllocation(allocation)) counts.resolved += 1
    else counts.hidden += 1
  }
  return counts
}

/**
 * Colours per state, from the app's design tokens (src/styles/tokens.css):
 * over → --signal-warning (amber conflict), resolved → --signal-success (green),
 * unowned → --status-unowned (the pink the app already uses for unowned cards).
 */
export const ALLOCATION_STATE_ACCENTS: Record<
  ImportAllocationState,
  { accent: string; border: string; background: string }
> = {
  over: {
    accent: 'var(--signal-warning)',
    border: 'rgba(239, 159, 39, 0.4)',
    background: 'rgba(239, 159, 39, 0.05)',
  },
  resolved: {
    accent: 'var(--signal-success)',
    border: 'rgba(29, 158, 117, 0.4)',
    background: 'rgba(29, 158, 117, 0.05)',
  },
  unowned: {
    accent: 'var(--status-unowned)',
    border: 'rgba(240, 51, 158, 0.4)',
    background: 'rgba(240, 51, 158, 0.05)',
  },
}
