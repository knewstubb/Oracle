'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DeckImportProgressList } from '@/components/DeckImportProgressList'
import { ConflictCard } from './ConflictCard'
import { DeckList } from './DeckList'
import { partitionRowsByOwnership } from '@/lib/import-reconciliation'
import type {
  ReconciliationView,
  ConflictInstance,
  InstanceState,
  ReconciliationTab,
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
        Every slot fits within your collection or has been marked Proxy/Planned.
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
  const [mutatingClaimId, setMutatingClaimId] = useState<number | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [activeTab, setActiveTab] = useState<ReconciliationTab>('decks')

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
          setView(data)
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

  const { owned: ownedRows, unowned: unownedRows } = useMemo(() => {
    if (!view) return { owned: [], unowned: [] }
    return partitionRowsByOwnership(view.rows)
  }, [view])

  const tabCounts = useMemo(() => {
    if (!view) return { decks: 0, owned: 0, unowned: 0 }
    return {
      decks: view.counts.unresolvedTotal,
      owned: view.counts.unresolvedOwned,
      unowned: view.counts.unresolvedUnowned,
    }
  }, [view])

  const unresolvedTotal = tabCounts.decks

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
      setView(data.view)
      toast.success(
        state === 'planned'
          ? 'Marked as Planned'
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
      setView(data.view)
      if (data.demoted) {
        toast.success('Alternate printing selected; state set to Planned because the copy is allocated elsewhere')
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
      setView(data.view)
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
      if (released > 0) parts.push(`kept ${released.toLocaleString()} slot(s) planned`)
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

  const totalDecks = batchResult.decksProcessed

  const decksProgress = batchResult.results.map((result) => ({
    id: result.deckId,
    name: result.deckName,
    state: 'done' as const,
    result,
  }))

  // Conflict overlay: a deck is flagged iff it still has unresolved conflict printings.
  const conflictedDeckIds = new Set(view?.decks.map((d) => d.deckId) ?? [])

  if (viewLoading) {
    return <SummarySkeleton />
  }

  if (viewError) {
    return <LoadErrorState message={viewError} />
  }

  if (!view || view.rows.length === 0) {
    return <EmptyState onFinish={onFinish} />
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[length:var(--fs-xl)] font-semibold">Reconcile imported decks</h1>
        <p className="mt-1 text-[length:var(--fs-md)] text-muted-foreground">
          Choose how each card slot is filled. Nothing is final until you press{' '}
          <strong>Allocate Cards</strong>.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-[var(--border-default)] px-4 py-3">
          <p className="text-[length:var(--fs-xs)] text-muted-foreground">Decks imported</p>
          <p className="text-[length:var(--fs-xl)] font-semibold">{totalDecks}</p>
        </div>
        <div className="rounded-lg border border-[var(--border-default)] px-4 py-3">
          <p className="text-[length:var(--fs-xs)] text-muted-foreground">Needs a decision</p>
          <p
            className="text-[length:var(--fs-xl)] font-semibold"
            style={unresolvedTotal > 0 ? { color: 'var(--signal-warning)' } : undefined}
          >
            {unresolvedTotal}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border-default)] px-4 py-3">
          <p className="text-[length:var(--fs-xs)] text-muted-foreground">Resolved</p>
          <p className="text-[length:var(--fs-xl)] font-semibold text-[var(--signal-success)]">
            {view.counts.rowsTotal - unresolvedTotal}
          </p>
        </div>
      </div>

      {/* Decks imported list */}
      <div className="flex flex-col gap-2">
        <h2 className="text-[length:var(--fs-md)] font-medium">Decks</h2>
        <DeckImportProgressList
          decks={decksProgress.map((d) => ({ ...d, conflicted: conflictedDeckIds.has(d.id) }))}
          isRunning={false}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReconciliationTab)}>
        <TabsList variant="line" className="w-full justify-start gap-2">
          <TabTrigger value="decks" label="Decks" count={tabCounts.decks} />
          <TabTrigger value="owned" label="Owned" count={tabCounts.owned} />
          <TabTrigger value="unowned" label="Unowned" count={tabCounts.unowned} />
        </TabsList>

        <TabsContent value="decks" className="mt-5">
          <p className="mb-4 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
            Decks with no conflicts are hidden from this tab.
          </p>
          <DeckList
            decks={view.decks}
            rows={view.rows}
            onInstanceStateChange={handleInstanceStateChange}
            onAlternatePrintingChange={handleAlternatePrintingChange}
            onWishlistChange={handleWishlistChange}
            disabled={mutatingClaimId !== null}
          />
        </TabsContent>

        <TabsContent value="owned" className="mt-5">
          <p className="mb-4 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
            Owned conflict printings that appear in imported decks.
          </p>
          <div className="flex flex-col gap-3">
            {ownedRows.map((printing) => (
              <ConflictCard
                key={printing.printingId}
                printing={printing}
                onInstanceStateChange={handleInstanceStateChange}
                onAlternatePrintingChange={handleAlternatePrintingChange}
                disabled={mutatingClaimId !== null}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="unowned" className="mt-5">
          <p className="mb-4 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
            Unowned conflict printings that appear in imported decks.
          </p>
          <div className="flex flex-col gap-3">
            {unownedRows.map((printing) => (
              <ConflictCard
                key={printing.printingId}
                printing={printing}
                onInstanceStateChange={handleInstanceStateChange}
                onWishlistChange={handleWishlistChange}
                disabled={mutatingClaimId !== null}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Finish bar */}
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <p className="text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
            {unresolvedTotal > 0
              ? `${unresolvedTotal} unresolved conflict printing${unresolvedTotal === 1 ? '' : 's'} across all tabs`
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

      {/* Bottom padding for fixed finish bar */}
      <div className="h-16" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab trigger with count badge
// ---------------------------------------------------------------------------

function TabTrigger({ value, label, count }: { value: ReconciliationTab; label: string; count: number }) {
  return (
    <TabsTrigger value={value} className="gap-2">
      {label}
      <span
        className="inline-flex min-w-[22px] items-center justify-center rounded-full px-1.5 py-0.5 text-[length:var(--fs-xs)] font-semibold"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      >
        {count}
      </span>
    </TabsTrigger>
  )
}
