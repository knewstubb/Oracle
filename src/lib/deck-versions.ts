/**
 * Deck version history types and utilities
 */

import { createAdminClient } from '@/lib/supabase'

export type VersionTriggerType =
  | 'manual'       // User-initiated snapshot
  | 'import'       // After deck import/reimport
  | 'bulk_change'  // After bulk operation (5+ cards changed)
  | 'session_end'  // Auto-snapshot at end of editing session
  | 'milestone'    // Card count milestones (60, 80, 99, 100)

export interface CardSnapshot {
  card_name: string
  quantity: number
  categories: string | null
  scryfall_id: string | null
  set_code: string | null
  is_commander: boolean
}

export interface VersionDiff {
  added: string[]
  removed: string[]
  changed: string[]
  added_count: number
  removed_count: number
  changed_count: number
}

export interface DeckVersion {
  id: number
  deck_id: number
  user_id: string
  version_number: number
  version_name: string | null
  trigger_type: VersionTriggerType
  trigger_details: string | null
  cards_snapshot: CardSnapshot[]
  card_count: number
  creature_count: number
  land_count: number
  diff_from_previous: VersionDiff | null
  created_at: string
}

export interface CreateVersionResult {
  success: boolean
  version_id: number
  version_number: number
  card_count: number
  diff: VersionDiff
}

/**
 * Milestone card counts that trigger auto-snapshot
 */
export const MILESTONE_CARD_COUNTS = [60, 80, 99, 100]

/**
 * Minimum cards changed to trigger bulk_change snapshot
 */
export const BULK_CHANGE_THRESHOLD = 5

/**
 * Check if a card count represents a milestone
 */
export function isMilestoneCardCount(count: number): boolean {
  return MILESTONE_CARD_COUNTS.includes(count)
}

/**
 * Format a version for display
 */
export function formatVersionLabel(version: DeckVersion): string {
  if (version.version_name) {
    return `v${version.version_number}: ${version.version_name}`
  }
  
  const date = new Date(version.created_at)
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
  
  return `v${version.version_number} (${dateStr})`
}

/**
 * Format a diff for display
 */
export function formatDiffSummary(diff: VersionDiff | null): string {
  if (!diff) return 'Initial version'
  
  const parts: string[] = []
  if (diff.added_count > 0) parts.push(`+${diff.added_count}`)
  if (diff.removed_count > 0) parts.push(`-${diff.removed_count}`)
  if (diff.changed_count > 0) parts.push(`~${diff.changed_count}`)
  
  if (parts.length === 0) return 'No changes'
  return parts.join(' ')
}

/**
 * Get a human-readable description of the trigger
 */
export function getTriggerDescription(trigger: VersionTriggerType, details?: string | null): string {
  switch (trigger) {
    case 'manual':
      return details || 'Manual snapshot'
    case 'import':
      return 'After import'
    case 'bulk_change':
      return details || 'Bulk edit'
    case 'session_end':
      return 'Session save'
    case 'milestone':
      return details || 'Milestone reached'
    default:
      return trigger
  }
}


/**
 * Create a version snapshot for a deck.
 * Calls the RPC function directly without going through the API.
 * Used internally by import and bulk operations.
 * 
 * @returns The version result, or null if creation failed (logged but not thrown)
 */
export async function createVersionSnapshot(
  deckId: number,
  userId: string,
  triggerType: VersionTriggerType,
  triggerDetails?: string,
  versionName?: string
): Promise<CreateVersionResult | null> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase.rpc('create_deck_version', {
      p_deck_id: deckId,
      p_user_id: userId,
      p_trigger_type: triggerType,
      p_trigger_details: triggerDetails ?? null,
      p_version_name: versionName ?? null,
    })

    if (error) {
      console.error(`[deck-versions] Failed to create version for deck ${deckId}: ${error.message}`)
      return null
    }

    return data as CreateVersionResult
  } catch (err) {
    console.error(
      `[deck-versions] Unexpected error creating version for deck ${deckId}:`,
      err instanceof Error ? err.message : err
    )
    return null
  }
}

/**
 * Get the current card count for a deck.
 * Used to check for milestone triggers after adding cards.
 */
export async function getDeckCardCount(deckId: number): Promise<number> {
  const supabase = createAdminClient()

  const { count, error } = await supabase
    .from('deck_cards')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deckId)

  if (error) {
    console.error(`[deck-versions] Failed to get card count for deck ${deckId}: ${error.message}`)
    return 0
  }

  return count ?? 0
}

/**
 * Check if adding cards crosses a milestone boundary.
 * Returns the milestone value if crossed, null otherwise.
 * 
 * @param beforeCount Card count before the operation
 * @param afterCount Card count after the operation
 */
export function checkMilestoneCrossed(beforeCount: number, afterCount: number): number | null {
  for (const milestone of MILESTONE_CARD_COUNTS) {
    if (beforeCount < milestone && afterCount >= milestone) {
      return milestone
    }
  }
  return null
}
