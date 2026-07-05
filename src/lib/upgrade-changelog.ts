/**
 * Upgrade Change Log — Pure utility functions for formatting change log entries
 * (markdown) and computing month-based counts.
 *
 * This module has no database access, no React, no side effects.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChangeLogEntry {
  id: number
  date: string
  cut_card: string
  add_card: string
  reason: string
  skipped: boolean
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Produces a markdown block for a single change log entry.
 *
 * Format:
 * ```
 * **Change Log Entry — {date}**
 * • {Applied|Skipped}: Cut {cut_card} → Add {add_card}
 * • Reason: {reason}
 * ```
 */
export function formatChangeLogEntry(
  cut: string,
  add: string,
  action: 'applied' | 'skipped',
  reason: string,
  date: string
): string {
  const actionLabel = action === 'applied' ? 'Applied' : 'Skipped'
  return [
    `**Change Log Entry — ${date}**`,
    `• ${actionLabel}: Cut ${cut} → Add ${add}`,
    `• Reason: ${reason}`,
  ].join('\n')
}

/**
 * Counts applied (non-skipped) entries whose date falls within the current
 * calendar month and year.
 *
 * Expects `entry.date` to be parseable by `new Date()` (ISO date string or
 * similar format like "YYYY-MM-DD").
 */
export function computeThisMonthCount(entries: ChangeLogEntry[]): number {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  return entries.filter((entry) => {
    if (entry.skipped) return false
    const entryDate = new Date(entry.date)
    return (
      entryDate.getMonth() === currentMonth &&
      entryDate.getFullYear() === currentYear
    )
  }).length
}
