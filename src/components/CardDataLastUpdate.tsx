'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useCardDataStatus } from '@/hooks/useCardDataStatus'

/** "13 Jun '26" */
export function formatShortDate(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getDate()
  const month = d.toLocaleString('en-GB', { month: 'short' })
  const year = String(d.getFullYear()).slice(-2)
  return `${day} ${month} '${year}`
}

/** Top bar label showing when the card list was last updated; links to Settings to refresh. */
export function CardDataLastUpdate({ className }: { className?: string }) {
  const { data, isStale } = useCardDataStatus()
  const date = data?.lastSyncedAt ? formatShortDate(data.lastSyncedAt) : null
  if (!date) return null

  return (
    <Link
      href="/settings"
      title={isStale ? 'Card data is out of date. Refresh it in Settings.' : 'Card data last updated. Refresh in Settings.'}
      className={cn(
        'whitespace-nowrap text-xs transition-colors hover:text-foreground',
        isStale ? 'text-[var(--signal-warning)]' : 'text-muted-foreground',
        className
      )}
    >
      Last update {date}
    </Link>
  )
}
