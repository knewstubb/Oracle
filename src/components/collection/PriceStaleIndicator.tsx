'use client'

import { AlertTriangle } from 'lucide-react'

export interface PriceStaleIndicatorProps {
  isPriceStale: boolean
  lastPriceRefresh: string | null
}

/**
 * Amber warning banner displayed when price data is >48h old.
 * Non-blocking: prices are still shown, just flagged as potentially outdated.
 *
 * Validates: Requirements 1.7
 */
export function PriceStaleIndicator({
  isPriceStale,
  lastPriceRefresh,
}: PriceStaleIndicatorProps) {
  if (!isPriceStale) return null

  return (
    <div
      role="status"
      aria-label="Price data warning"
      className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
    >
      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
      <span>
        Pricing may be outdated
        {lastPriceRefresh && (
          <span className="ml-1 text-amber-600 dark:text-amber-400">
            — Last refreshed: {formatRefreshTimestamp(lastPriceRefresh)}
          </span>
        )}
      </span>
    </div>
  )
}

/**
 * Formats an ISO timestamp into a human-readable relative format.
 * e.g. "Jun 15 at 3:00 AM"
 */
function formatRefreshTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)

  if (isNaN(date.getTime())) {
    return 'Unknown'
  }

  const month = date.toLocaleString('en-US', { month: 'short' })
  const day = date.getDate()
  const time = date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return `${month} ${day} at ${time}`
}
