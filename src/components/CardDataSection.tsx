'use client'

import { useState } from 'react'
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCardDataStatus } from '@/hooks/useCardDataStatus'

function formatDate(iso: string | null): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Settings → "Card data": last updated date and a refresh button. */
export function CardDataSection() {
  const { data, isLoading, isError, isStale, invalidate } = useCardDataStatus()
  const [startError, setStartError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const refresh = data?.refresh
  const running = starting || refresh?.phase === 'running'

  async function handleRefresh() {
    setStartError(null)
    setStarting(true)
    try {
      const res = await fetch('/api/card-data/refresh', { method: 'POST' })
      // 409 means one is already running — just show its progress.
      if (!res.ok && res.status !== 409) {
        setStartError('Could not start the refresh. Please try again.')
        return
      }
      await invalidate()
    } catch {
      setStartError('Network error — could not start the refresh.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border-default)] p-6" aria-labelledby="card-data-heading">
      <h2 id="card-data-heading" className="text-[length:var(--fs-lg)] font-medium">
        Card data
      </h2>
      <p className="mt-1 text-[length:var(--fs-sm)] text-muted-foreground">
        The card list Oracle uses to recognise cards. Refresh it when new sets come out.
      </p>

      <p className="mt-4 text-[length:var(--fs-md)]">
        {isLoading ? 'Checking…' : isError ? 'Could not check when card data was last updated.' : `Last updated: ${formatDate(data?.lastSyncedAt ?? null)}`}
      </p>

      {isStale && !running && (
        <p className="mt-2 flex items-center gap-2 text-[length:var(--fs-sm)] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-4" aria-hidden="true" />
          Card data is out of date — new cards may not match when you import.
        </p>
      )}

      <div className="mt-4">
        <Button onClick={handleRefresh} disabled={running} className="gap-2">
          {running ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
          {running ? 'Refreshing…' : 'Refresh card data'}
        </Button>
      </div>

      {running && (
        <p role="status" className="mt-3 text-[length:var(--fs-sm)] text-muted-foreground">
          {refresh?.phase === 'running' && refresh.message ? refresh.message : 'Starting…'} This takes a few minutes — you can
          keep using Oracle.
        </p>
      )}

      {!running && refresh?.phase === 'succeeded' && (
        <p role="status" className="mt-3 flex items-center gap-2 text-[length:var(--fs-sm)] text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {refresh.message}
        </p>
      )}
      {!running && refresh?.phase === 'failed' && (
        <p role="alert" className="mt-3 flex items-center gap-2 text-[length:var(--fs-sm)] text-destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          {refresh.message}
        </p>
      )}
      {startError && (
        <p role="alert" className="mt-3 text-[length:var(--fs-sm)] text-destructive">
          {startError}
        </p>
      )}
    </section>
  )
}
