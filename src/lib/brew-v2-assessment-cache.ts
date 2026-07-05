// ---------------------------------------------------------------------------
// Brew Mode V2 — Assessment Cache
// ---------------------------------------------------------------------------
// Per-session cache for card assessments. Prevents duplicate Haiku calls
// within a session — the same card returns the same result without re-invoking
// the model.
//
// The cache is stored as a Map<string, CardAssessment> on BrewSessionState.
// Serialization/deserialization functions handle persistence to/from the
// `brew_sessions.assessment_cache_json` TEXT column.
//
// Validates: Requirements 5.1, 5.5
// ---------------------------------------------------------------------------

import { createServerClient } from '@/lib/supabase'
import type { CardAssessment } from './brew-v2-types'

// ---------------------------------------------------------------------------
// Cache Operations (Pure)
// ---------------------------------------------------------------------------

/**
 * Retrieves a cached assessment for a given card within a session.
 * Returns null if the card has not been assessed in this session.
 *
 * @param cache - The session's assessment cache map
 * @param cardName - The card name to look up (case-sensitive)
 * @returns The cached CardAssessment or null if not found
 */
export function getCachedAssessment(
  cache: Map<string, CardAssessment>,
  cardName: string
): CardAssessment | null {
  return cache.get(cardName) ?? null
}

/**
 * Stores an assessment result in the session cache.
 * Subsequent calls to getCachedAssessment for the same card will return
 * this result without requiring a Haiku model call.
 *
 * @param cache - The session's assessment cache map (mutated in place)
 * @param cardName - The card name to cache (case-sensitive)
 * @param assessment - The CardAssessment result to cache
 */
export function cacheAssessment(
  cache: Map<string, CardAssessment>,
  cardName: string,
  assessment: CardAssessment
): void {
  cache.set(cardName, assessment)
}

// ---------------------------------------------------------------------------
// Serialization (for database persistence)
// ---------------------------------------------------------------------------

/**
 * Serializes the assessment cache Map to a JSON string for storage in
 * `brew_sessions.assessment_cache_json`.
 *
 * @param cache - The session's assessment cache map
 * @returns JSON string representation of the cache
 */
export function serializeCache(cache: Map<string, CardAssessment>): string {
  const obj: Record<string, CardAssessment> = {}
  for (const [key, value] of cache) {
    obj[key] = value
  }
  return JSON.stringify(obj)
}

/**
 * Deserializes a JSON string from `brew_sessions.assessment_cache_json`
 * back into a Map<string, CardAssessment>.
 *
 * Returns an empty Map if the input is empty, null, or invalid JSON.
 *
 * @param json - The JSON string from the database column
 * @returns Reconstructed assessment cache Map
 */
export function deserializeCache(
  json: string | null | undefined
): Map<string, CardAssessment> {
  if (!json) {
    return new Map()
  }

  try {
    const obj = JSON.parse(json) as Record<string, CardAssessment>
    return new Map(Object.entries(obj))
  } catch {
    return new Map()
  }
}

// ---------------------------------------------------------------------------
// Supabase Persistence
// ---------------------------------------------------------------------------

/**
 * Loads the assessment cache from the brew_sessions table for a given session.
 * Returns the deserialized Map ready for in-memory use.
 */
export async function loadAssessmentCache(
  sessionId: number
): Promise<Map<string, CardAssessment>> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('brew_sessions')
    .select('assessment_cache_json')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load assessment cache for session ${sessionId}: ${error.message}`)
  }

  if (!data) {
    return new Map()
  }

  return deserializeCache(data.assessment_cache_json)
}

/**
 * Persists the assessment cache Map to the brew_sessions table.
 * Serializes the Map to JSON and updates the assessment_cache_json column.
 */
export async function persistAssessmentCache(
  sessionId: number,
  cache: Map<string, CardAssessment>
): Promise<void> {
  const supabase = createServerClient()
  const { error } = await supabase
    .from('brew_sessions')
    .update({
      assessment_cache_json: serializeCache(cache),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  if (error) {
    throw new Error(`Failed to persist assessment cache for session ${sessionId}: ${error.message}`)
  }
}

/**
 * Caches a single card assessment and immediately persists to the database.
 * Convenience function combining in-memory cache update with Supabase write.
 */
export async function cacheAndPersistAssessment(
  sessionId: number,
  cache: Map<string, CardAssessment>,
  cardName: string,
  assessment: CardAssessment
): Promise<void> {
  cache.set(cardName, assessment)
  await persistAssessmentCache(sessionId, cache)
}
