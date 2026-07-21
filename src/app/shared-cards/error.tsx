'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SharedCardsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-[var(--content-max-width)] px-6 py-6">
      <div
        role="alert"
        className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-[length:var(--fs-md)] text-destructive"
      >
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          Couldn&apos;t load shared cards. {error.message}
        </span>
        <Button variant="destructive" size="sm" onClick={reset}>
          <RefreshCw className="size-3.5" aria-hidden="true" data-icon="inline-start" />
          Retry
        </Button>
      </div>
    </div>
  )
}
