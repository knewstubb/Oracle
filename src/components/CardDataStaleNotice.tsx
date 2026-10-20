'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { useCardDataStatus } from '@/hooks/useCardDataStatus'

/**
 * One-line notice shown when the local card list is more than 7 days old.
 * Intended for the ManaBox import dialogs (wire in after T-56 merges).
 * Renders nothing while loading, on error, or when data is fresh.
 */
export function CardDataStaleNotice() {
  const { data, isStale } = useCardDataStatus()
  if (!data || !isStale) return null

  const age =
    data.ageDays === null
      ? 'out of date'
      : `${data.ageDays} ${data.ageDays === 1 ? 'day' : 'days'} old`

  return (
    <div
      role="status"
      aria-label="Card data warning"
      className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[length:var(--fs-sm)] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
    >
      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
      <span>
        Card data is {age} — new cards may not match.{' '}
        <Link href="/settings" className="font-medium underline underline-offset-2">
          Refresh in Settings
        </Link>
        .
      </span>
    </div>
  )
}
