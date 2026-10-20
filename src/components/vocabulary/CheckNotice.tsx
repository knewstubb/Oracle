'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { MaterialSymbol } from './MaterialSymbol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckNoticeKind = 'failed' | 'stale'

export interface CheckNoticeProps {
  kind: CheckNoticeKind
  checkedAt?: Date | number | string
  onRetry: () => void
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(value: Date | number | string): string {
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Section-level check notice for failed or stale lookups (D-043).
 *
 * - failed: "Couldn't check availability for this deck. Your cards and
 *   sleeves haven't changed." with Try again.
 * - stale: "Last checked 10:42" with Refresh.
 */
export function CheckNotice({
  kind,
  checkedAt,
  onRetry,
  className,
}: CheckNoticeProps) {
  if (kind === 'failed') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[length:var(--fs-sm)]',
          className
        )}
        style={{
          color: 'var(--text-primary)',
          backgroundColor: 'var(--state-failed-bg)',
          borderColor: 'var(--state-failed)',
        }}
        role="alert"
      >
        <MaterialSymbol
          name="error"
          style={{ color: 'var(--state-failed)' }}
        />
        <span>
          Couldn&apos;t check availability for this deck. Your cards and sleeves
          haven&apos;t changed.
        </span>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onRetry}
          className="h-auto p-0 text-[length:var(--fs-sm)]"
          style={{ color: 'var(--text-primary)' }}
        >
          Try again
        </Button>
      </div>
    )
  }

  const timeText = checkedAt ? formatTime(checkedAt) : '—'

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[length:var(--fs-sm)]',
        className
      )}
      style={{ color: 'var(--text-secondary)' }}
      role="status"
    >
      <MaterialSymbol
        name="history"
        style={{ color: 'var(--state-stale)' }}
      />
      <span>Last checked {timeText}</span>
      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={onRetry}
        className="h-auto p-0 text-[length:var(--fs-sm)]"
        style={{ color: 'var(--text-primary)' }}
      >
        Refresh
      </Button>
    </div>
  )
}
