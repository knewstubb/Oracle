'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConflictCard } from './ConflictCard'
import { ReconciliationNav, type ReconciliationSelection } from './ReconciliationNav'
import { partitionRowsByOwnership } from '@/lib/import-reconciliation'
import type {
  ReconciliationView,
  ConflictInstance,
  InstanceState,
} from '@/types/import-reconciliation'
import type { BatchResolutionResult } from '@/lib/warm-start-resolve'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReconciliationSummaryProps {
  batchResult: BatchResolutionResult | null
  batchId: string | null
  onFinish: () => void
}

// ---------------------------------------------------------------------------
// Loading skeleton (matches PicklistV2 pattern)
// ---------------------------------------------------------------------------

function SummarySkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-[var(--border-default)] px-4 py-3"
          >
            <div className="mb-2 h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-6 w-8 animate-pulse rounded bg-white/[0.06]" />
          </div>
        ))}
      </div>
      <div className="h-8 w-64 animate-pulse rounded bg-white/[0.06]" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
          >
            <div className="flex items-start gap-3">
              <div className="h-11 w-8 animate-pulse rounded bg-white/[0.06]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-3 w-48 animate-pulse rounded bg-white/[0.06]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[var(--border-default)] px-4 py-12 text-center">
      <p className="text-[length:var(--fs-lg)] font-medium text-foreground">
        All imported cards are reconciled.
      </p>
      <p className="max-w-sm text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
        Every slot fits within your collection or has been marked Proxy/Unsleeved.
      </p>
      <Button onClick={onFinish}>Allocate Cards</Button>
    </div>
  )
}

function LoadErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--signal-critical)]/40 px-4 py-12 text-center">
      <p className="text-[length:var(--fs-lg)] font-medium text-foreground">
        Unable to load reconciliation data.
      </p>
      <p className="max-w-xl text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
        Refresh the page and try again. Details: {message}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReconciliationSummary({
  batchResult,
  batchId,
  onFinish,
}: ReconciliationSummaryProps) {
  const [view, setView] = useState<ReconciliationView | null>(null)
  const [viewLoading, setViewLoading] = useState(true)
  const [viewError, setViewError] = useState<string | null>(null)
  // Cards that have needed a decision at any point. Cards that were fine from
  // the start never appear; cards the user resolves stay so they can change their mind.
  const [attentionKeys, setAttentionKeys] = useState<Set<string>>(new Set())
  const [mutatingClaimId, setMutatingClaimId] = useState<number | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [selection, setSelection] = useState<ReconciliationSelection | null>(null)

  function applyView(next: ReconciliationView) {
    setView(next)
    setAttentionKeys((prev) => {
      const updated = new Set(prev)
      for (const row of next.rows) {
        if (!row.resolved) updated.add(`${row.cardName}|${row.printingId}`)
      }
      return updated
    })
  }

  // Fetch reconciliation view on mount / batchId change.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const qs = batchId ? `?batchId=${encodeURIComponent(batchId)}` : ''
        const res = await fetch(`/api/onboarding/reconciliation${qs}`)
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: unknown } | null
          const detail = typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`
          throw new Error(detail)
        }
        const data: ReconciliationView = await res.json()
        if (!cancelled) {
          applyView(data)
          setViewError(null)
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          setView(null)
          setViewError(message)
          toast.error(`Failed to load reconciliation data: ${message}`)
        }
      } finally {
        if (!cancelled) setViewLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [batchId])

  // The server lists resolved cards last, so a card would jump to the bottom
  // the moment a choice is made. Keep a fixed order so nothing moves.
  const stableRows = useMemo(() => {
    if (!view) return []
    return view.rows
      .filter((row) => attentionKeys.has(`${row.cardName}|${row.printingId}`))
      .sort(
      (a, b) =>
        a.cardName.localeCompare(b.cardName) || a.printingId.localeCompare(b.printingId)
    )
  }, [view, attentionKeys])

  const { owned: ownedRows, unowned: unownedRows } = useMemo(
    () => partitionRowsByOwnership(stableRows),
    [stableRows]
  )

  const unresolvedTotal = view?.counts.unresolvedTotal ?? 0

  // -------------------------------------------------------------------------
  // State change handler
  // -------------------------------------------------------------------------

  async function handleInstanceStateChange(
    instance: ConflictInstance,
    state: InstanceState
  ) {
    setMutatingClaimId(instance.claimId)
    try {
      const res = await fetch('/api/onboarding/reconciliation/instance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId: instance.claimId, state, batchId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(body.error || 'Failed to update allocation')
      }
      const data: { view: ReconciliationView } = await res.json()
      applyView(data.view)
      toast.success(
        state === 'planned'
          ? 'Marked as Unsleeved'
          : state === 'proxy'
            ? 'Marked as Proxy'
            : 'Marked as Sleeved'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update allocation')
    } finally {
      setMutatingClaimId(null)
    }
  }

  // -------------------------------------------------------------------------
  // Alternate printing handler
  // -------------------------------------------------------------------------

  async function handleAlternatePrintingChange(
    instance: ConflictInstance,
    printingId: string | null
  ) {
    setMutatingClaimId(instance.claimId)
    try {
      const res = await fetch('/api/onboarding/reconciliation/instance/printing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId: instance.claimId, printingId, batchId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(body.error || 'Failed to update printing')
      }
      const data: { view: ReconciliationView; demoted?: boolean } = await res.json()
      applyView(data.view)
      if (data.demoted) {
        toast.success('Alternate printing selected; state set to Unsleeved because the copy is allocated elsewhere')
      } else {
        toast.success('Alternate printing selected')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update printing')
    } finally {
      setMutatingClaimId(null)
    }
  }

  // -------------------------------------------------------------------------
  // Wishlist handler
  // -------------------------------------------------------------------------

  async function handleWishlistChange(instance: ConflictInstance, checked: boolean) {
    setMutatingClaimId(instance.claimId)
    try {
      const res = await fetch('/api/onboarding/reconciliation/instance/wishlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId: instance.claimId, wishlisted: checked, batchId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(body.error || 'Failed to update wishlist')
      }
      const data: { view: ReconciliationView } = await res.json()
      applyView(data.view)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update wishlist')
    } finally {
      setMutatingClaimId(null)
    }
  }

  // -------------------------------------------------------------------------
  // Finish
  // -------------------------------------------------------------------------

  async function handleFinish() {
    if (unresolvedTotal > 0) {
      const ok = window.confirm(
        `${unresolvedTotal.toLocaleString()} conflict printing${unresolvedTotal === 1 ? '' : 's'} still unresolved. ` +
          'Those decks will keep asserting copies you do not have. Continue to Decks?'
      )
      if (!ok) return
    }

    setFinishing(true)
    try {
      const res = await fetch('/api/onboarding/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      })
      if (!res.ok) {
        const body: { error?: string } = await res.json().catch(() => ({}))
        throw new Error(body.error || `Finalize failed (HTTP ${res.status})`)
      }
      const data = (await res.json().catch(() => ({}))) as {
        finalizedCount?: number
        proxiedCount?: number
        releasedCount?: number
        leftOpenCount?: number
        settledCount?: number
      }

      const parts: string[] = []
      const sleeved = data.finalizedCount ?? 0
      if (sleeved > 0) parts.push(`sleeved ${sleeved.toLocaleString()}`)
      const proxied = data.proxiedCount ?? 0
      if (proxied > 0) parts.push(`added ${proxied.toLocaleString()} proxy copies`)
      const released = data.releasedCount ?? 0
      if (released > 0) parts.push(`kept ${released.toLocaleString()} slot(s) unsleeved`)
      if (parts.length === 0) parts.push('nothing to assign')
      toast.success(parts.join(' · '))
      onFinish()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Finalize failed')
    } finally {
      setFinishing(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!batchResult) return null

  const navDecks = batchResult.results.map((result) => {
    const conflicted = view?.decks.find((d) => d.deckId === result.deckId)
    return {
      deckId: result.deckId,
      deckName: result.deckName,
      isActive: conflicted?.isActive ?? result.lifecycle === 'active',
      unresolved: conflicted?.conflictPrintingCount ?? 0,
    }
  })

  if (viewLoading) {
    return <SummarySkeleton />
  }

  if (viewError) {
    return <LoadErrorState message={viewError} />
  }

  if (!view || view.rows.length === 0) {
    return <EmptyState onFinish={onFinish} />
  }

  const firstConflictedDeck = navDecks.find((d) => d.unresolved > 0)
  const activeSelection: ReconciliationSelection =
    selection ??
    (firstConflictedDeck
      ? `deck:${firstConflictedDeck.deckId}`
      : view.counts.unresolvedOwned > 0
        ? 'owned'
        : 'unowned')

  const selectedDeckId = activeSelection.startsWith('deck:')
    ? Number(activeSelection.slice('deck:'.length))
    : undefined
  const selectedDeck = navDecks.find((d) => d.deckId === selectedDeckId)

  const visibleRows =
    activeSelection === 'owned'
      ? ownedRows
      : activeSelection === 'unowned'
        ? unownedRows
        : stableRows.filter((row) => row.instances.some((i) => i.deckId === selectedDeckId))

  const panelTitle =
    activeSelection === 'owned'
      ? 'All owned'
      : activeSelection === 'unowned'
        ? 'All unowned'
        : selectedDeck?.deckName ?? 'Deck'

  const panelHint =
    activeSelection === 'owned'
      ? 'Cards in your collection that more than one deck wants, or that are in a different printing.'
      : activeSelection === 'unowned'
        ? 'Cards that are not in your collection. Choose Proxy or leave them Unsleeved.'
        : 'Cards in this deck that need a decision.'

  const disabled = mutatingClaimId !== null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[length:var(--fs-xl)] font-semibold">Reconcile imported decks</h1>
        <p className="mt-1 text-[length:var(--fs-md)] text-muted-foreground">
          Choose how each card slot is filled. Nothing is final until you press{' '}
          <strong>Allocate Cards</strong>.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
          <ReconciliationNav
            selected={activeSelection}
            onSelect={setSelection}
            decks={navDecks}
            ownedUnresolved={view.counts.unresolvedOwned}
            unownedUnresolved={view.counts.unresolvedUnowned}
          />
        </aside>

        <section aria-label={panelTitle} className="flex min-w-0 flex-col gap-4">
          <header>
            <h2 className="text-[length:var(--fs-lg)] font-semibold text-foreground">{panelTitle}</h2>
            <p className="mt-0.5 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">{panelHint}</p>
          </header>

          {visibleRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-default)] px-4 py-12 text-center text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
              Nothing here needs a decision.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleRows.map((printing) => (
                <ConflictCard
                  key={printing.printingId}
                  printing={printing}
                  focusDeckId={selectedDeckId}
                  showClaimantDecks={selectedDeckId !== undefined}
                  onInstanceStateChange={handleInstanceStateChange}
                  onAlternatePrintingChange={handleAlternatePrintingChange}
                  onWishlistChange={handleWishlistChange}
                  disabled={disabled}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="mx-auto flex max-w-[1220px] items-center justify-between gap-4">
          <p className="text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
            {unresolvedTotal > 0
              ? `${unresolvedTotal} card${unresolvedTotal === 1 ? '' : 's'} still need a decision across ${navDecks.length} deck${navDecks.length === 1 ? '' : 's'}`
              : 'All imported cards are reconciled.'}
          </p>
          <Button onClick={handleFinish} disabled={finishing}>
            {finishing && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {finishing
              ? 'Applying…'
              : unresolvedTotal > 0
                ? `Allocate Cards (${unresolvedTotal})`
                : 'Allocate Cards'}
          </Button>
        </div>
      </div>

      <div className="h-16" />
    </div>
  )
}
