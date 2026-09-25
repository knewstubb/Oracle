/**
 * Placement Source — contract types
 *
 * Shared by Backend route handlers and Frontend callers. Every placement write
 * (any operation that sets deck_cards.copy_id) carries a source value so undo,
 * validation and audit logging are shared across manual and AI placement.
 *
 * Decision: D-009
 */

// ═══════════════════════════════════════════════════════════════════════════
// Domain
// ═══════════════════════════════════════════════════════════════════════════

/** Source of a placement that filled a deck_cards slot. */
export type PlacementSource = 'manual' | 'ai' | 'import'

/** Valid placement source values. */
export const PLACEMENT_SOURCES: readonly PlacementSource[] = ['manual', 'ai', 'import']

/** Default source for user-initiated placement actions. */
export const DEFAULT_PLACEMENT_SOURCE: PlacementSource = 'manual'

// ═══════════════════════════════════════════════════════════════════════════
// API request bodies
// ═══════════════════════════════════════════════════════════════════════════

/** POST /api/allocation/assign */
export interface AssignBody {
  deckCardsId: number
  physicalCopyId?: number
  /** Defaults to 'manual'. */
  source?: PlacementSource
}

/** POST /api/allocation/claim-from-deck */
export interface ClaimFromDeckBody {
  deckCardsId: number
  physicalCopyId: number
  /** Defaults to 'manual'. */
  source?: PlacementSource
}

/** POST /api/allocation/assign-free-copy */
export interface AssignFreeCopyBody {
  copyId?: number
  /** @deprecated Use copyId. */
  physicalCopyId?: number
  targetDeckId: number
  cardName: string
  /** Defaults to 'manual'. */
  source?: PlacementSource
}

/** POST /api/allocation/reassign-to-deck */
export interface ReassignToDeckBody {
  copyId?: number
  /** @deprecated Use copyId. */
  physicalCopyId?: number
  targetDeckId: number
  cardName: string
  /** Defaults to 'manual'. */
  source?: PlacementSource
}

/** POST /api/allocation/undo */
export interface UndoBody {
  deckCardsId: number
  physicalCopyId: number
  restoreTo: { deckCardsId: number } | null
  /** Defaults to 'manual'. Undo is a manual action. */
  source?: PlacementSource
}

/** POST /api/allocation/add-proxy */
export interface AddProxyBody {
  deckCardsId: number
  cardId?: number
  /** @deprecated Use cardId. */
  cardDefinitionId?: number
  /** Defaults to 'manual'. */
  source?: PlacementSource
}

/** POST /api/allocation/replace-with-original */
export interface ReplaceWithOriginalBody {
  deckCardsId?: number
  proxyCopyId?: number
  originalCopyId: number
  proxyStorageLocationId: number | null
  /** Defaults to 'manual'. */
  source?: PlacementSource
}

// ═══════════════════════════════════════════════════════════════════════════
// RPC payloads
// ═══════════════════════════════════════════════════════════════════════════

/** Single element inside the `p_assignments` JSONB passed to `batch_assign_deck`. */
export interface BatchAssignmentElement {
  deckCardsId: number
  copyId?: number
  /** @deprecated Use copyId. */
  physicalCopyId?: number
  /** For Tier 3 reassigns: the source slot to clear. */
  clearDeckCardsId?: number | null
  /** Defaults to 'manual'. Auto-assign callers must pass 'ai'. */
  source?: PlacementSource
}

/** Parameters for the `batch_assign_deck` RPC. */
export interface BatchAssignDeckParams {
  p_deck_id: number
  p_user_id: string
  p_assignments: BatchAssignmentElement[]
}

// ═══════════════════════════════════════════════════════════════════════════
// Schema row type (extension to generated Supabase types)
// ═══════════════════════════════════════════════════════════════════════════

/** Fields added to `deck_cards` by the placement-source migration. */
export interface DeckCardsPlacementSourceRow {
  placement_source: PlacementSource | null
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Type guard for unknown placement source values. */
export function isPlacementSource(value: unknown): value is PlacementSource {
  return typeof value === 'string' && PLACEMENT_SOURCES.includes(value as PlacementSource)
}

/** Coerce an unknown value to a PlacementSource, falling back to a default. */
export function normalizePlacementSource(
  value: unknown,
  fallback: PlacementSource = DEFAULT_PLACEMENT_SOURCE
): PlacementSource {
  return isPlacementSource(value) ? value : fallback
}
