/**
 * Rating Store — Persistence layer for deck ratings.
 *
 * Reads and writes computed deck rating results to/from Supabase.
 * The deck_ratings table stores the full JSON content (scores, contributing cards,
 * key cards, primer, weaknesses, metadata) per deck.
 *
 * The rating-engine.ts module handles pure computation logic.
 * This module handles storage only.
 *
 * Uses Supabase client for all database operations (async).
 *
 * Validates: Requirements 5.1, 5.5
 */

import { createServerClient } from '@/lib/supabase'
import type { DeckRatingsContent } from '@/lib/rating-engine'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default user ID for single-user operation.
 * This matches the UUID injected during data migration.
 */
const DEFAULT_USER_ID = process.env.SUPABASE_DEFAULT_USER_ID ?? '00000000-0000-0000-0000-000000000000'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredDeckRating {
  deckId: number
  content: DeckRatingsContent
  generatedAt: string
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Upsert a deck rating into the deck_ratings table.
 * Replaces any previous rating for the same deck (deck_id is PK).
 */
export async function upsertDeckRating(
  deckId: number,
  content: DeckRatingsContent
): Promise<void> {
  const supabase = createServerClient()

  const { error } = await supabase
    .from('deck_ratings')
    .upsert(
      {
        deck_id: deckId,
        content: JSON.stringify(content),
        user_id: DEFAULT_USER_ID,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'deck_id' }
    )

  if (error) {
    throw new Error(`Failed to upsert deck rating for deck ${deckId}: ${error.message}`)
  }
}

/**
 * Read the stored rating for a deck.
 * Returns null if no rating exists or if the stored JSON is malformed.
 */
export async function getDeckRating(deckId: number): Promise<StoredDeckRating | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('deck_ratings')
    .select('deck_id, content, generated_at')
    .eq('deck_id', deckId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to get deck rating for deck ${deckId}: ${error.message}`)
  }

  if (!data) return null

  try {
    return {
      deckId: data.deck_id,
      content: JSON.parse(data.content) as DeckRatingsContent,
      generatedAt: data.generated_at,
    }
  } catch {
    // Malformed JSON — treat as missing
    return null
  }
}

/**
 * Read stored ratings for multiple decks.
 * Returns an array of ratings (excludes decks without ratings or with malformed JSON).
 */
export async function getDeckRatings(deckIds: number[]): Promise<StoredDeckRating[]> {
  if (deckIds.length === 0) return []

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('deck_ratings')
    .select('deck_id, content, generated_at')
    .in('deck_id', deckIds)

  if (error) {
    throw new Error(`Failed to get deck ratings: ${error.message}`)
  }

  if (!data) return []

  const results: StoredDeckRating[] = []
  for (const row of data) {
    try {
      results.push({
        deckId: row.deck_id,
        content: JSON.parse(row.content) as DeckRatingsContent,
        generatedAt: row.generated_at,
      })
    } catch {
      // Skip malformed JSON rows
    }
  }

  return results
}

/**
 * Read all stored deck ratings.
 * Returns an array of all ratings (excludes rows with malformed JSON).
 */
export async function getAllDeckRatings(): Promise<StoredDeckRating[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('deck_ratings')
    .select('deck_id, content, generated_at')

  if (error) {
    throw new Error(`Failed to get all deck ratings: ${error.message}`)
  }

  if (!data) return []

  const results: StoredDeckRating[] = []
  for (const row of data) {
    try {
      results.push({
        deckId: row.deck_id,
        content: JSON.parse(row.content) as DeckRatingsContent,
        generatedAt: row.generated_at,
      })
    } catch {
      // Skip malformed JSON rows
    }
  }

  return results
}

/**
 * Delete the stored rating for a deck.
 * No-op if no rating exists for the given deck.
 */
export async function deleteDeckRating(deckId: number): Promise<void> {
  const supabase = createServerClient()

  const { error } = await supabase
    .from('deck_ratings')
    .delete()
    .eq('deck_id', deckId)

  if (error) {
    throw new Error(`Failed to delete deck rating for deck ${deckId}: ${error.message}`)
  }
}
