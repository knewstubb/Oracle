/**
 * One rule for "can this copy be used as supply / counted as spare?".
 * Contract: docs/oracle/contracts/know-where-cards-are.md sections 6 and 8.
 *
 * A copy marked Missing or In your hand is not supply: it is not spare, never a candidate and never assigned.
 * It is still OWNED (owned counts keep counting it). Every reader that decides "free / spare / available"
 * must filter with SUPPLY_ELIGIBLE_FILTER (database queries) or isSupplyEligible (rows already in memory).
 */
import {
  isSpare as contractIsSpare,
  isSupplyEligible as contractIsSupplyEligible,
  type CopyAvailabilityRow,
} from '../../docs/oracle/contracts/know-where-cards-are.types'

export type { CopyAvailabilityRow }

/** Column filters that keep only supply-eligible copies. Use with `.eq(column, value)` on user_copies. */
export const SUPPLY_ELIGIBLE_FILTER = { missing: false, in_hand: false } as const

export const isSupplyEligible = contractIsSupplyEligible
export const isSpare = contractIsSpare
