'use client'

import { useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export interface PriceStaleIndicatorProps {
  isPriceStale: boolean
  lastPriceRefresh: string | null
}

/**
 * Amber warning banner displayed when price data is >48h old.
 * Non-blocking: prices are still shown, just flagged as potentially outdated.
 * Includes a "Refresh Prices" button that triggers the price refresh API.
 *
 * Validates: Requirements 1.7
 */
export function PriceStaleIndicator({
  isPriceStale,
  lastPriceRefresh,
}: PriceStaleIndicatorProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<string | null>(null)

  if (!isPriceStale) return null

  async function handleRefresh() {
    setIsRefreshing(true)
    setRefreshResult(null)
    try {
      const res = await fetch('/api/collection/prices/refresh', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setRefreshResult(
          `Prices updated — ${data.entriesProcessed.toLocaleString()} entries loaded. Reload the page to see prices.`
        )
      } else {
        setRefreshResult(data.error || 'Failed to refresh prices.')
      }
    } catch {
      setRefreshResult('Network error — could not refresh prices.')
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div
      role="status"
      aria-label="Price data warning"
      className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
    >
      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        {refreshResult || (
          <>
            Pricing may be outdated
            {lastPriceRefresh && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                — Last refreshed: {formatRefreshTimestamp(lastPriceRefresh)}
              </span>
            )}
          </>
        )}
      </span>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="ml-2 flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-900/80"
      >
        <RefreshCw className={`size-3 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
        {isRefreshing ? 'Refreshing…' : 'Refresh Prices'}
      </button>
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
