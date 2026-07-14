/**
 * Deck Documentation & Notes Persistence Layer
 *
 * Data access module for the deck_documentation and deck_notes tables.
 * Native Supabase storage for deck narrative content and coaching notes.
 *
 * Uses Supabase client for all database operations (async).
 *
 * Validates: Requirements 5.1, 5.2, 5.5
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeckDocumentation {
  deck_id: number
  strategy_playstyle: string | null
  synergy_lines: string | null
  strengths_weaknesses: string | null
  matchup_notes: string | null
  mulligan_guide: string | null
  updated_at: string
}

export type DeckDocumentationFields = Omit<DeckDocumentation, 'deck_id' | 'updated_at'>

export interface DeckNote {
  id: number
  deck_id: number
  content: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Documentation (deck_documentation table)
// ---------------------------------------------------------------------------

/**
 * Retrieve the documentation row for a given deck.
 * Returns null if no documentation exists yet.
 */
export async function getDocumentation(deckId: number): Promise<DeckDocumentation | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('deck_documentation')
    .select('deck_id, strategy_playstyle, synergy_lines, strengths_weaknesses, matchup_notes, mulligan_guide, updated_at')
    .eq('deck_id', deckId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to get documentation for deck ${deckId}: ${error.message}`)
  }

  return data ?? null
}

/**
 * Insert or replace documentation for a deck.
 * Uses upsert semantics — always sets updated_at to now().
 * Validates synergy_lines is a valid JSON array if non-null.
 */
export async function upsertDocumentation(
  deckId: number,
  fields: Partial<DeckDocumentationFields>,
  userId: string
): Promise<void> {
  // Validate synergy_lines if provided and non-null
  if (fields.synergy_lines !== undefined && fields.synergy_lines !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(fields.synergy_lines)
    } catch {
      throw new Error('synergy_lines must be a valid JSON array')
    }
    if (!Array.isArray(parsed)) {
      throw new Error('synergy_lines must be a valid JSON array')
    }
  }

  // Read existing row to merge partial fields
  const existing = await getDocumentation(deckId)

  const strategy_playstyle = fields.strategy_playstyle !== undefined
    ? fields.strategy_playstyle
    : (existing?.strategy_playstyle ?? null)

  const synergy_lines = fields.synergy_lines !== undefined
    ? fields.synergy_lines
    : (existing?.synergy_lines ?? null)

  const strengths_weaknesses = fields.strengths_weaknesses !== undefined
    ? fields.strengths_weaknesses
    : (existing?.strengths_weaknesses ?? null)

  const matchup_notes = fields.matchup_notes !== undefined
    ? fields.matchup_notes
    : (existing?.matchup_notes ?? null)

  const mulligan_guide = fields.mulligan_guide !== undefined
    ? fields.mulligan_guide
    : (existing?.mulligan_guide ?? null)

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('deck_documentation')
    .upsert({
      deck_id: deckId,
      strategy_playstyle,
      synergy_lines,
      strengths_weaknesses,
      matchup_notes,
      mulligan_guide,
      user_id: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'deck_id' })

  if (error) {
    throw new Error(`Failed to upsert documentation for deck ${deckId}: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// Notes (deck_notes table)
// ---------------------------------------------------------------------------

/**
 * Retrieve notes for a deck, ordered by created_at DESC (newest first).
 * Optionally limit the number of results.
 */
export async function getNotes(deckId: number, limit?: number): Promise<DeckNote[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('deck_notes')
    .select('id, deck_id, content, created_at')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: false })

  if (limit !== undefined) {
    query = query.limit(limit)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to get notes for deck ${deckId}: ${error.message}`)
  }

  return data ?? []
}

/**
 * Append a new note for a deck.
 * Validates content is non-blank (at least one non-whitespace character).
 * Returns the inserted row id.
 */
export async function appendNote(deckId: number, content: string, userId: string): Promise<number> {
  if (!content || content.trim().length === 0) {
    throw new Error('Content must not be blank')
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('deck_notes')
    .insert({ deck_id: deckId, content, user_id: userId })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to append note for deck ${deckId}: ${error.message}`)
  }

  return data.id
}
