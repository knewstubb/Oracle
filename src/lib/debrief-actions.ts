// ---------------------------------------------------------------------------
// Debrief Actions — Data operations for the debrief flow
//
// GUARD: These functions modify deck_cards for LOCAL card swaps only.
// They do NOT fetch from Archidekt or trigger any auto-sync.
// All writes are user-initiated (explicit debrief actions via UI).
// See: deck-authority-split spec, Requirements 6.1, 6.2.
//
// Uses Supabase client for all database operations (async).
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase'
import type { ActionType, DebriefSummary } from './debrief-types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// applyCardSwap
// ---------------------------------------------------------------------------

/**
 * Apply a card swap to a deck.
 * Removes the cut card and adds the add card to deck_cards.
 * Returns success/failure — caller handles ownership resolution and note logging.
 *
 * Note: Without a true Postgres transaction via RPC, these are sequential operations.
 * If the insert fails after a successful delete, the cut card is lost from the deck.
 * For a debrief flow this is acceptable — the user can re-add manually if needed.
 */
export async function applyCardSwap(
  deckId: number,
  cutCard: string,
  addCard: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient()

    // DELETE the cut card from deck_cards
    const { data: deleted, error: deleteError } = await supabase
      .from('deck_cards')
      .delete()
      .eq('deck_id', deckId)
      .eq('card_name', cutCard)
      .select('id')

    if (deleteError) {
      throw new Error(`Failed to delete cut card: ${deleteError.message}`)
    }

    if (!deleted || deleted.length === 0) {
      throw new Error('Cut card not in deck')
    }

    // INSERT the add card into deck_cards
    const { error: insertError } = await supabase.from('deck_cards').insert({
      deck_id: deckId,
      card_name: addCard,
      quantity: 1,
      user_id: userId,
    })

    if (insertError) {
      throw new Error(`Failed to insert add card: ${insertError.message}`)
    }

    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// logDebriefAction
// ---------------------------------------------------------------------------

/**
 * Log a debrief action to the debrief_actions table.
 */
export async function logDebriefAction(
  sessionId: number,
  actionType: ActionType,
  cutCard: string,
  addCard: string,
  reason: string,
  notionLogged: boolean,
  userId: string
): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase.from('debrief_actions').insert({
    session_id: sessionId,
    action_type: actionType,
    cut_card: cutCard,
    add_card: addCard,
    reason,
    notion_logged: notionLogged,
    user_id: userId,
  })

  if (error) {
    throw new Error(
      `Failed to log debrief action for session ${sessionId}: ${error.message}`
    )
  }
}

// ---------------------------------------------------------------------------
// buildDebriefSummary
// ---------------------------------------------------------------------------

/**
 * Build the Debrief Summary from session actions.
 * Queries all debrief_actions for the given session and groups by action_type.
 */
export async function buildDebriefSummary(
  sessionId: number,
  deckId: number
): Promise<DebriefSummary> {
  const supabase = createAdminClient()

  const { data: rows, error } = await supabase
    .from('debrief_actions')
    .select('action_type, cut_card, add_card, reason')
    .eq('session_id', sessionId)

  if (error) {
    throw new Error(
      `Failed to fetch debrief actions for session ${sessionId}: ${error.message}`
    )
  }

  const appliedChanges: Array<{ cutCard: string; addCard: string; reason: string }> = []
  const skippedRecommendations: Array<{ cutCard: string; addCard: string }> = []
  const disagreedRecommendations: Array<{ cutCard: string; addCard: string }> = []

  for (const row of rows ?? []) {
    switch (row.action_type) {
      case 'applied':
        appliedChanges.push({
          cutCard: row.cut_card,
          addCard: row.add_card,
          reason: row.reason,
        })
        break
      case 'skipped':
        skippedRecommendations.push({
          cutCard: row.cut_card,
          addCard: row.add_card,
        })
        break
      case 'disagreed':
        disagreedRecommendations.push({
          cutCard: row.cut_card,
          addCard: row.add_card,
        })
        break
    }
  }

  return {
    sessionId,
    deckId,
    appliedChanges,
    skippedRecommendations,
    disagreedRecommendations,
    totalApplied: appliedChanges.length,
    totalSkipped: skippedRecommendations.length,
    totalDisagreed: disagreedRecommendations.length,
    deckDetailUrl: `/decks/${deckId}`,
  }
}

// ---------------------------------------------------------------------------
// formatNoteEntry
// ---------------------------------------------------------------------------

/**
 * Format a debrief action for note logging.
 * Returns formatted markdown for deck notes.
 */
export function formatNoteEntry(
  sessionId: number,
  cutCard: string,
  addCard: string,
  reason: string
): string {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = now.toLocaleString('en-GB', { month: 'short' })
  const year = now.getFullYear()
  const dateStr = `${day} ${month} ${year}`

  return `### Debrief #${sessionId} — ${dateStr}\n- **Cut:** ${cutCard}\n- **Add:** ${addCard}\n- **Reason:** ${reason}`
}
