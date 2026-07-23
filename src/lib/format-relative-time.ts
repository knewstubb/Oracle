/**
 * Format an ISO date string as a human-readable relative time.
 * Extracted from DraftSessionTile for shared use across Dashboard + tiles.
 */
export function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate + 'Z').getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
