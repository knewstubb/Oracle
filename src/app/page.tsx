'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { AlertCircle, AlertTriangle, RefreshCw, Check, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusFilter } from '@/components/StatusFilter'
import { DeckImportButton } from '@/components/DeckImportButton'
import { NewDeckModal } from '@/components/NewDeckModal'
import { DeckTile } from '@/components/DeckTile'
import { DraftSessionTile } from '@/components/DraftSessionTile'
import { PageHeader } from '@/components/PageHeader'
import { CardImage } from '@/components/CardImage'
import { toast } from 'sonner'

interface Deck {
  id: number
  name: string
  commander_name: string
  commander_scryfall_id: string
  colour_identity: string
  card_count: number
  deck_type: string | null
  status: 'brewing' | 'in_rotation' | 'graveyard'
  allocate: boolean
  completeness?: { resolved: number; total: number; availableCount?: number; claimedCount?: number; unownedCount?: number } | null
  format?: string | null
  pipDistribution?: Record<string, number> | null
}

interface DraftSession {
  session_id: number
  commander_name: string | null
  status: string
  updated_at: string
  colour_identity: string | null
}

interface DecksResponse {
  decks: Deck[]
  draftSessions: DraftSession[]
}

type Tab = 'all-decks' | 'dashboard'
type ReadinessTier = 'green' | 'amber' | 'red'

function getReadinessTier(deck: Deck): ReadinessTier {
  const c = deck.completeness
  if (!c) return 'green' // No completeness data = treat as ready (no allocation tracking)
  if (c.resolved === c.total) return 'green'
  if ((c.unownedCount ?? 0) > 0) return 'red'
  return 'amber'
}

function getReadinessLabel(deck: Deck): string {
  const c = deck.completeness
  if (!c || c.resolved === c.total) return 'Ready'
  const unresolved = c.total - c.resolved
  const unowned = c.unownedCount ?? 0
  if (unowned > 0) return `${unowned} unowned`
  return `${unresolved} to pull`
}

export default function DashboardPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')

  const { data, isLoading, error } = useQuery<DecksResponse>({
    queryKey: ['decks'],
    queryFn: () => fetch('/api/decks').then(r => {
      if (!r.ok) throw new Error('Failed to load decks')
      return r.json()
    }),
    staleTime: 5 * 60 * 1000,
  })

  const decks = data?.decks
  const draftSessions = data?.draftSessions

  // ─── Stat strip computation ────────────────────────────────────
  const total = decks?.length ?? 0
  const activeCount = decks?.filter(d => d.status === 'in_rotation').length ?? 0
  const brewingCount = decks?.filter(d => d.status === 'brewing').length ?? 0
  const graveyardCount = decks?.filter(d => d.status === 'graveyard').length ?? 0
  const readyCount = decks?.filter(d =>
    d.status === 'in_rotation' && getReadinessTier(d) === 'green'
  ).length ?? 0

  // ─── Top-level empty check ─────────────────────────────────────
  const hasNothingAtAll = !isLoading && total === 0 && (!draftSessions || draftSessions.length === 0)

  // ─── Top-level empty state (no tabs) ───────────────────────────
  if (hasNothingAtAll) {
    return (
      <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
        <div className="mx-auto flex h-full w-full max-w-[var(--content-max-width)] flex-col">
          <PageHeader title="Decks" />
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-24 text-center">
            <h2 className="text-[length:var(--fs-xl)] font-medium text-foreground mb-2">
              Welcome to The Oracle
            </h2>
            <p className="mb-6 max-w-md text-[length:var(--fs-md)] text-muted-foreground">
              Track your physical MTG collection at the individual-card level. Know which card is in which deck, what's available, and what you're missing.
            </p>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[length:var(--fs-md)] font-medium text-white transition-colors"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              Bring your collection over
            </Link>
            <p className="mt-2 text-[length:var(--fs-xs)] text-muted-foreground">
              Import from Archidekt or Moxfield
            </p>
            <div className="mt-6 flex items-center gap-4 text-[length:var(--fs-sm)] text-muted-foreground">
              <DeckImportButton />
              <NewDeckModal />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
      <div className="mx-auto flex h-full w-full max-w-[var(--content-max-width)] flex-col">
      <PageHeader
        title="Decks"
        subtitle={total > 0 ? (
          <span>
            {total} {total === 1 ? 'deck' : 'decks'} · {activeCount} Active, {brewingCount} Brewing, {graveyardCount} Graveyard · {readyCount} of {activeCount} Active {activeCount === 1 ? 'deck' : 'decks'} ready to play
          </span>
        ) : undefined}
        actions={
          <>
            <DeckImportButton />
            <NewDeckModal />
          </>
        }
      />

      {/* ─── Tab Bar ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border px-5">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`relative pb-2.5 pt-1 text-[length:var(--fs-md)] font-medium transition-colors ${
              activeTab === 'dashboard'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Dashboard
            {activeTab === 'dashboard' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[var(--accent-primary)]" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('all-decks')}
            className={`relative pb-2.5 pt-1 text-[length:var(--fs-md)] font-medium transition-colors ${
              activeTab === 'all-decks'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All decks
            {activeTab === 'all-decks' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[var(--accent-primary)]" />
            )}
          </button>
        </div>
      </div>

      {/* ─── Tab Content ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5">

      {/* ═══ Dashboard Tab ═══ */}
      {activeTab === 'dashboard' && (
        <DashboardContent decks={decks ?? []} draftSessions={draftSessions ?? []} isLoading={isLoading} />
      )}

      {/* ═══ All Decks Tab ═══ */}
      {activeTab === 'all-decks' && (
        <>
          <StatusFilter className="mb-6" />
          {error && (
            <div
              role="alert"
              className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-[length:var(--fs-md)] text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">
                Couldn&apos;t load decks. {(error as Error).message}
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['decks'] })}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" data-icon="inline-start" />
                Retry
              </Button>
            </div>
          )}

          {isLoading ? (
            <div
              role="list"
              aria-label="Loading decks"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} role="listitem" className="overflow-hidden rounded-2xl bg-[#F6F3EE] dark:bg-card [box-shadow:0px_1px_3px_rgba(0,0,0,0.12),0px_4px_8px_3px_rgba(0,0,0,0.06)]">
                  <Skeleton className="aspect-[4/3] w-full rounded-none" />
                  <div className="px-4 pb-2 pt-3 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-none" />
                </div>
              ))}
            </div>
          ) : decks && decks.length === 0 && (!draftSessions || draftSessions.length === 0) ? (
            // This shouldn't show (top-level empty state handles it) but keep as safety net
            null
          ) : decks && decks.length > 0 || (draftSessions && draftSessions.length > 0) ? (
            <>
            <div
              role="list"
              aria-label="Deck list"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            >
              {draftSessions && draftSessions.map((session) => (
                <div key={`draft-${session.session_id}`} role="listitem">
                  <DraftSessionTile
                    sessionId={session.session_id}
                    commanderName={session.commander_name}
                    status={session.status}
                    updatedAt={session.updated_at}
                    colourIdentity={session.colour_identity ? session.colour_identity.split(',').flatMap(s => s.trim().length === 1 ? [s.trim()] : s.trim().split('')) : []}
                  />
                </div>
              ))}
              {decks && decks.map((deck) => (
                <div key={deck.id} role="listitem">
                  <DeckTile
                    id={deck.id}
                    name={deck.name}
                    commanderName={deck.commander_name}
                    commanderScryfallId={deck.commander_scryfall_id}
                    colourIdentity={deck.colour_identity ? deck.colour_identity.split(',').flatMap(s => s.trim().length === 1 ? [s.trim()] : s.trim().split('')) : []}
                    cardCount={deck.card_count}
                    status={deck.status}
                    completeness={deck.completeness}
                    allocate={deck.allocate}
                    format={deck.format}
                    pipDistribution={deck.pipDistribution}
                  />
                </div>
              ))}
            </div>

            {/* Rotation summary */}
            {(() => {
              if (!decks) return null
              const inRotation = decks.filter((d: any) => d.status === 'in_rotation')
              const needsCards = inRotation.filter((d: any) => d.completeness && d.completeness.resolved < d.completeness.total)
              if (inRotation.length === 0) return null
              return (
                <div className="mt-4 flex items-center gap-3 text-[length:var(--fs-sm)] text-muted-foreground">
                  <span>{inRotation.length} {inRotation.length === 1 ? 'deck' : 'decks'} active</span>
                  {needsCards.length > 0 && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[length:var(--fs-xs)] font-medium transition-colors hover:bg-[rgba(228,75,74,0.1)]"
                      style={{ color: 'var(--signal-critical)' }}
                    >
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      {needsCards.length} {needsCards.length === 1 ? 'deck needs' : 'decks need'} cards
                    </button>
                  )}
                </div>
              )
            })()}
            </>
          ) : null}
        </>
      )}

      </div>{/* end scrollable content */}
      </div>{/* end max-width container */}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard Content
// ═══════════════════════════════════════════════════════════════════════════════

function DashboardContent({ decks, draftSessions, isLoading }: { decks: Deck[]; draftSessions: DraftSession[]; isLoading: boolean }) {
  const queryClient = useQueryClient()
  const activeDecks = decks.filter(d => d.status === 'in_rotation')
  const brewingDecks = decks.filter(d => d.status === 'brewing')

  // Mark Active mutation
  const promoteMutation = useMutation({
    mutationFn: async (deckId: number) => {
      const res = await fetch(`/api/decks/${deckId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_rotation' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to promote deck')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      toast.success('Deck promoted to Active')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to promote')
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  // Low-data state: no Active decks but Brewing decks exist
  if (activeDecks.length === 0) {
    if (brewingDecks.length > 0) {
      return (
        <div>
          <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium text-foreground">
            Ready to Play
          </h2>
          <p className="mb-4 text-[length:var(--fs-sm)] text-muted-foreground">
            No Active decks yet. Promote a Brewing deck to start tracking allocation:
          </p>
          <div className="space-y-2">
            {brewingDecks.slice(0, 5).map((deck) => (
              <div
                key={deck.id}
                className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--border-default)] px-3 py-2.5"
              >
                <div className="size-8 shrink-0 overflow-hidden rounded">
                  <CardImage
                    scryfallId={deck.commander_scryfall_id}
                    alt=""
                    width={32}
                    height={32}
                    artCrop
                    noPreview
                    className="size-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[length:var(--fs-md)] font-medium text-foreground">{deck.name}</p>
                  <p className="truncate text-[length:var(--fs-xs)] text-muted-foreground">{deck.commander_name}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => promoteMutation.mutate(deck.id)}
                  disabled={promoteMutation.isPending}
                  className="shrink-0 text-[length:var(--fs-xs)]"
                >
                  Mark Active
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-6 text-[length:var(--fs-sm)] text-muted-foreground">
            More coming soon
          </p>
        </div>
      )
    }

    // No Active, no Brewing (but sessions exist — handled by top-level empty state)
    return (
      <div>
        <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium text-foreground">
          Ready to Play
        </h2>
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">
          No decks ready yet — your brews are in Recently Active below
        </p>
        <p className="mt-6 text-[length:var(--fs-sm)] text-muted-foreground">
          More coming soon
        </p>
      </div>
    )
  }

  // Normal state: show Active decks sorted by readiness (red → amber → green)
  const sortedActive = [...activeDecks].sort((a, b) => {
    const tierOrder: Record<ReadinessTier, number> = { red: 0, amber: 1, green: 2 }
    const tierA = tierOrder[getReadinessTier(a)]
    const tierB = tierOrder[getReadinessTier(b)]
    if (tierA !== tierB) return tierA - tierB
    return a.name.localeCompare(b.name)
  })

  return (
    <div>
      <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium text-foreground">
        Ready to Play
      </h2>
      <div className="space-y-1.5">
        {sortedActive.map((deck) => (
          <ReadyToPlayRow key={deck.id} deck={deck} />
        ))}
      </div>
      <p className="mt-6 text-[length:var(--fs-sm)] text-muted-foreground">
        More coming soon
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Ready to Play Row
// ═══════════════════════════════════════════════════════════════════════════════

const TIER_STYLES: Record<ReadinessTier, { color: string; bg: string }> = {
  green: { color: 'var(--accent-primary)', bg: 'var(--accent-primary-bg)' },
  amber: { color: 'var(--signal-warning)', bg: 'rgba(239, 159, 39, 0.15)' },
  red: { color: 'var(--signal-critical)', bg: 'rgba(226, 75, 74, 0.12)' },
}

function ReadyToPlayRow({ deck }: { deck: Deck }) {
  const tier = getReadinessTier(deck)
  const label = getReadinessLabel(deck)
  const style = TIER_STYLES[tier]

  return (
    <Link
      href={`/decks/${deck.id}`}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--bg-surface-hover)]"
    >
      {/* Commander art thumbnail */}
      <div className="size-9 shrink-0 overflow-hidden rounded-md">
        <CardImage
          scryfallId={deck.commander_scryfall_id}
          alt=""
          width={36}
          height={36}
          artCrop
          noPreview
          className="size-full object-cover"
        />
      </div>

      {/* Deck name */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-[length:var(--fs-md)] font-medium text-foreground">
          {deck.name}
        </p>
      </div>

      {/* Readiness badge */}
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium"
        style={{ color: style.color, backgroundColor: style.bg }}
      >
        {tier === 'green' && <Check className="size-3" />}
        {tier === 'amber' && <Circle className="size-3" />}
        {tier === 'red' && <AlertTriangle className="size-3" />}
        {label}
      </span>
    </Link>
  )
}
