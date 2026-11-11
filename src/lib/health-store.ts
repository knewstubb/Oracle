/**
 * Health Persistence Layer
 *
 * Reads and writes per-deck threshold overrides (deck_strategy.health_overrides).
 * Deck health itself is computed on request (src/lib/deck-health.ts) and no longer stored;
 * old deck_health rows are left alone (contract section 4).
 *
 * Uses Supabase client for all database operations (async).
 *
 * Validates: Requirements 1.5, 2.1, 2.2, 7.1, 7.4
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThresholdEntry {
  min: number
  max: number
}

export interface ThresholdSet {
  [category: string]: ThresholdEntry
}

export interface OverrideMap {
  thresholds?: Partial<ThresholdSet>
  amber_margin?: number
}

// ---------------------------------------------------------------------------
// Health Overrides CRUD
// ---------------------------------------------------------------------------

/**
 * Read health overrides from deck_strategy for a deck.
 * Returns null if no overrides are configured or the deck has no strategy row.
 */
export async function getHealthOverrides(deckId: number): Promise<OverrideMap | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('deck_strategy')
    .select('health_overrides')
    .eq('deck_id', deckId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to get health overrides for deck ${deckId}: ${error.message}`)
  }

  if (!data || data.health_overrides === null) return null

  return JSON.parse(data.health_overrides) as OverrideMap
}

/**
 * Save health overrides to deck_strategy for a deck.
 */
export async function saveHealthOverrides(
  deckId: number,
  overrides: OverrideMap
): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('deck_strategy')
    .update({ health_overrides: JSON.stringify(overrides) })
    .eq('deck_id', deckId)

  if (error) {
    throw new Error(`Failed to save health overrides for deck ${deckId}: ${error.message}`)
  }
}

/**
 * Remove health overrides for a deck (revert to global defaults).
 */
export async function clearHealthOverrides(deckId: number): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('deck_strategy')
    .update({ health_overrides: null })
    .eq('deck_id', deckId)

  if (error) {
    throw new Error(`Failed to clear health overrides for deck ${deckId}: ${error.message}`)
  }
}
