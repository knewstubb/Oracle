/**
 * Deck version history types and utilities
 */

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
