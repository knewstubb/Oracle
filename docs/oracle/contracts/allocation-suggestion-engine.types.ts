/**
 * Allocation Suggestion Engine — Contract Types
 *
 * Read-only API contract for the allocation suggestion engine that reuses the
 * V2 resolver compute layer without writing allocations.
 *
 * Source of truth for the compute logic:
 *   src/lib/allocation-candidates.ts
 *
 * Locked decision:
 *   D-007 — destructive clear-and-recompute resolver is retired; compute layer
 *   is reused as a suggestion engine.
 */

// ---------------------------------------------------------------------------
// Core domain types (mirrors the V2 compute layer)
// ---------------------------------------------------------------------------

/** Finish of a physical copy. Stored as free text in the database. */
export type CopyFinish = 'nonfoil' | 'foil' | 'etched'

/** Condition of a physical copy. Stored as free text in the database. */
export type CopyCondition = 'near_mint' | 'lightly_played' | 'moderately_played' | 'heavily_played' | 'damaged' | null

/** Assignment status of a physical copy when it is already in a deck slot. */
export interface CopyAssignment {
  /** The `deck_cards.id` row that currently holds this copy. */
  deckCardsId: number
  /** The `decks.id` of the deck that currently holds this copy. */
  deckId: number
  /** Display name of the deck that currently holds this copy. */
  deckName: string
  /** Whether the deck is active (`decks.is_active`). */
  isActive?: boolean
}

/**
 * Enriched view of a physical copy for allocation purposes.
 * Built from `user_copies` joined with `deck_cards`, `decks`, and `user_locations`.
 */
export interface EnrichedSupplyEntry {
  /** `user_copies.id` */
  physicalCopyId: number
  /** `user_cards.id` */
  cardId: number
  /** `user_copies.printing_id` — a scryfall_id for a specific printing. */
  printingId: string | null
  /** `user_copies.finish` */
  finish: CopyFinish
  /** `user_copies.is_proxy` */
  isProxy: boolean
  /** `user_copies.condition` */
  condition: CopyCondition
  /** `user_copies.location_id` */
  locationId: number | null
  /** `user_locations.name` for the location above. */
  locationName: string | null
  /**
   * `null` = the copy is free (unallocated).
   * Otherwise describes the `deck_cards` row that currently claims it.
   */
  assignedTo: CopyAssignment | null
}

/** Priority tier for candidate ranking. Lower is better. */
export type CandidateTier = 1 | 2 | 3 | 5

/**
 * A ranked candidate ready for picklist display or bulk suggestion.
 *
 * Tier 5 is synthetic: it has `physicalCopyId = -1`, `cardId = -1`,
 * `isProxy = true`, and `assignedTo = null`, indicating that printing a new
 * proxy is the only option.
 */
export interface RankedCandidate {
  /** The physical copy details (or synthetic Tier 5 details). */
  entry: EnrichedSupplyEntry
  /** Priority tier (1 = best, 5 = only option is print new proxy). */
  tier: CandidateTier
  /** Human-readable tier explanation for UI display. */
  tierLabel: string
  /** Within-tier score (higher = better match). */
  withinTierScore: number
  /** Whether the UI may auto-select this candidate (tiers 1 and 2 only). */
  autoSelectable: boolean
}

// ---------------------------------------------------------------------------
// API request / response types
// ---------------------------------------------------------------------------

/** GET /api/allocation/candidates */
export interface GetCandidatesRequest {
  /** Card name to resolve. */
  cardName: string
  /** Optional preferred `scryfall_id` for within-tier scoring. */
  preferredScryfall?: string | null
}

/** GET /api/allocation/candidates response body. */
export interface GetCandidatesResponse {
  candidates: RankedCandidate[]
}

/** POST /api/allocation/candidates/batch request body. */
export interface GetBatchCandidatesRequest {
  /** Card names to look up. */
  cardNames: string[]
  /**
   * Optional per-name preferred `scryfall_id`.
   * Names not present are treated as having no preferred printing.
   */
  preferredScryfallByName?: Record<string, string | null>
}

/** POST /api/allocation/candidates/batch response body. */
export interface GetBatchCandidatesResponse {
  /** Map of requested card name to its ranked candidates. */
  results: Record<string, RankedCandidate[]>
}

// ---------------------------------------------------------------------------
// Error shapes
// ---------------------------------------------------------------------------

/** Standard error response body for all suggestion-engine endpoints. */
export interface AllocationSuggestionError {
  /** Human-readable error message. */
  error: string
  /** Optional stable code for programmatic handling. */
  code?: string
}

/** Validation error when a required query parameter or body field is missing. */
export interface AllocationSuggestionValidationError extends AllocationSuggestionError {
  error: string
  code: 'MISSING_PARAMETER' | 'INVALID_BODY' | 'EMPTY_BATCH'
}

/** Unexpected internal error (database, compute, etc.). */
export interface AllocationSuggestionInternalError extends AllocationSuggestionError {
  error: string
  code: 'INTERNAL_ERROR'
}

// ---------------------------------------------------------------------------
// Compute-layer function signatures (allowed read-only functions)
// ---------------------------------------------------------------------------

/**
 * Fetch enriched supply for a single card name.
 *
 * Allowed caller: suggestion engine, picklist UI.
 * Forbidden: any write path.
 */
export type FetchEnrichedSupply = (
  cardName: string,
  userId: string
) => Promise<EnrichedSupplyEntry[]>

/**
 * Batch fetch enriched supply for many card names.
 *
 * Allowed caller: suggestion engine, import reconciliation, bulk suggestion.
 * Forbidden: any write path.
 */
export type FetchBatchEnrichedSupply = (
  cardNames: string[],
  userId: string
) => Promise<Map<string, EnrichedSupplyEntry[]>>

/**
 * Classify an enriched supply entry into a priority tier.
 *
 * Returns tiers 1, 2, or 3 only. Tier 5 is generated separately as a synthetic
 * candidate when no physical copies exist.
 */
export type ClassifyTier = (entry: EnrichedSupplyEntry) => Exclude<CandidateTier, 5>

/**
 * Score a candidate within its tier.
 *
 * +2 if printing_id matches preferredScryfallId.
 * +1 if finish is nonfoil.
 * +1 if condition is near_mint.
 */
export type ScoreCandidate = (
  entry: EnrichedSupplyEntry,
  preferredScryfallId: string | null
) => number

/** Get ranked candidates for a single card. */
export type GetRankedCandidates = (
  cardName: string,
  userId: string,
  preferredScryfallId?: string | null
) => Promise<RankedCandidate[]>

/** Get ranked candidates for many cards. */
export type GetBatchRankedCandidates = (
  cardNames: string[],
  userId: string
) => Promise<Map<string, RankedCandidate[]>>

// ---------------------------------------------------------------------------
// RPC / operation allow-list
// ---------------------------------------------------------------------------

/**
 * Allowed RPCs and operations for the suggestion engine.
 *
 * These are read-only. No RPC in this list mutates allocation state.
 */
export type AllowedSuggestionOperation =
  | { type: 'function'; name: 'getRankedCandidates' }
  | { type: 'function'; name: 'getBatchRankedCandidates' }
  | { type: 'function'; name: 'fetchEnrichedSupply' }
  | { type: 'function'; name: 'fetchBatchEnrichedSupply' }
  | { type: 'function'; name: 'classifyTier' }
  | { type: 'function'; name: 'scoreCandidate' }
  | { type: 'sql'; table: 'user_cards'; operation: 'SELECT' }
  | { type: 'sql'; table: 'user_copies'; operation: 'SELECT' }
  | { type: 'sql'; table: 'deck_cards'; operation: 'SELECT' }
  | { type: 'sql'; table: 'decks'; operation: 'SELECT' }
  | { type: 'sql'; table: 'user_locations'; operation: 'SELECT' }

/**
 * Forbidden RPCs and operations.
 *
 * The suggestion engine must never invoke these. They are write paths or the
 * retired destructive resolver.
 */
export type ForbiddenSuggestionOperation =
  | { type: 'rpc'; name: 'assign_physical_copy' }
  | { type: 'rpc'; name: 'force_claim_copy' }
  | { type: 'rpc'; name: 'add_proxy_to_slot' }
  | { type: 'rpc'; name: 'allocation_clear_active_decks' }
  | { type: 'sql'; table: 'deck_cards'; operation: 'INSERT' | 'UPDATE' | 'DELETE' }
  | { type: 'sql'; table: 'user_copies'; operation: 'INSERT' | 'UPDATE' | 'DELETE' }
  | { type: 'sql'; table: 'user_cards'; operation: 'INSERT' | 'UPDATE' | 'DELETE' }
  | { type: 'sql'; table: 'decks'; operation: 'INSERT' | 'UPDATE' | 'DELETE' }
  | { type: 'sql'; table: 'user_locations'; operation: 'INSERT' | 'UPDATE' | 'DELETE' }
  | { type: 'sql'; table: 'import_sleeve_claims'; operation: 'INSERT' | 'UPDATE' | 'DELETE' }
