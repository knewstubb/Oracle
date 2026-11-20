'use client'
// One line that says where autosave stands. Used where a Save button used to be. The text is announced politely
// to screen readers; the icon is never the only signal.
import { Check, Loader2, WifiOff, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AutosaveStatus } from '@/hooks/useAutosave'
import { FOCUS_RING } from '@/components/deck-strategy/focus'

export interface SaveStatusProps {
  status: AutosaveStatus
  lastSavedAt: Date | null
  /** Runs the save again after a failure. */
  onRetry: () => void
  className?: string
  /** Replaces the default error line (the default talks about text). */
  errorText?: string
}

const timeText = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function SaveStatus({ status, lastSavedAt, onRetry, className, errorText }: SaveStatusProps) {
  return (
    <div role="status" aria-live="polite" data-testid="save-status" className={cn('flex min-h-11 items-center gap-2 text-[length:var(--fs-sm)]', className)}>
      {status === 'saving' && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Saving…
        </span>
      )}
      {status === 'saved' && lastSavedAt && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Check className="size-4" aria-hidden="true" />
          Saved at {timeText(lastSavedAt)}
        </span>
      )}
      {status === 'error' && (
        <span className="flex flex-wrap items-center gap-2 text-red-300">
          <span className="flex items-center gap-1.5">
            <XCircle className="size-4 shrink-0" aria-hidden="true" />
            {errorText ?? "Couldn't save. Your text is still here."}
          </span>
          <button
            type="button"
            onClick={onRetry}
            className={cn('inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-red-400 px-3 font-medium text-red-300', FOCUS_RING)}
          >
            Try again
          </button>
        </span>
      )}
      {status === 'offline' && (
        <span className="flex items-center gap-1.5 text-amber-300">
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          Offline. Will save when you&apos;re back
        </span>
      )}
    </div>
  )
}
