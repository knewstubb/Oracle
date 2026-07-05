/**
 * Health Persistence Layer
 *
 * Reads and writes deck health results and threshold overrides to/from Supabase.
 * The deck_health table stores computed health results per deck.
 * The deck_strategy.health_overrides column stores per-deck threshold overrides.
 *
 * Uses Supabase client for all database operations (async).
 *
 * Validates: Requirements 1.5, 2.1, 2.2, 7.1, 7.4
 */

import { createServerClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthStatus = 'green' | 'amber' | 'red'

export interface CategoryHealth {
  category: string
  status: HealthStatus
  actual: number
  min: number
  max: number
}

export interface HealthResult {
  deckId: number
  categories: CategoryHealth[]
  overallStatus: HealthStatus
  computedAt: string
}

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
// Constants
// ---------------------------------------------------------------------------

/**
 * Default user ID for single-user operation.
 * This matches the UUID injected during data migration.
 */
const DEFAULT_USER_ID = process.env.SUPABASE_DEFAULT_USER_ID ?? '00000000-0000-0000-0000-000000000000'

// ---------------------------------------------------------------------------
// Health Result CRUD
// ---------------------------------------------------------------------------

/**
 * Upsert a health result into the deck_health table.
 * Replaces any previous result for the same deck.
 */
export async function upsertHealthResult(result: HealthResult): Promise<void> {
  const supabase = createServerClient()

  const { error } = await supabase
    .from('deck_health')
    .upsert(
      {
        deck_id: result.deckId,
        result_json: JSON.stringify(result.categories),
        overall_status: result.overallStatus,
        computed_at: result.computedAt,
        user_id: DEFAULT_USER_ID,
      },
      { onConflict: 'deck_id' }
    )

  if (error) {
    throw new Error(`Failed to upsert health result for deck ${result.deckId}: ${error.message}`)
  }
}

/**
 * Read the stored health result for a deck.
 * Returns null if no result exists.
 */
export async function getHealthResult(deckId: number): Promise<HealthResult | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('deck_health')
    .select('deck_id, result_json, overall_status, computed_at')
    .eq('deck_id', deckId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to get health result for deck ${deckId}: ${error.message}`)
  }

  if (!data) return null

  return {
    deckId: data.deck_id,
    categories: JSON.parse(data.result_json) as CategoryHealth[],
    overallStatus: data.overall_status as HealthStatus,
    computedAt: data.computed_at,
  }
}

// ---------------------------------------------------------------------------
// Health Overrides CRUD
// ---------------------------------------------------------------------------

/**
 * Read health overrides from deck_strategy for a deck.
 * Returns null if no overrides are configured or the deck has no strategy row.
 */
export async function getHealthOverrides(deckId: number): Promise<OverrideMap | null> {
  const supabase = createServerClient()

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
  const supabase = createServerClient()

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
  const supabase = createServerClient()

  const { error } = await supabase
    .from('deck_strategy')
    .update({ health_overrides: null })
    .eq('deck_id', deckId)

  if (error) {
    throw new Error(`Failed to clear health overrides for deck ${deckId}: ${error.message}`)
  }
}
