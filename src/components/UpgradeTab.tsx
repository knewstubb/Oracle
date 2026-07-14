'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Check,
  MessageSquare,
  Minus,
  RefreshCw,
  Sparkles,
  Sword,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { OwnershipBadge } from '@/components/OwnershipBadge'
import { ConflictAlert } from '@/components/ConflictAlert'
import {
  sortCandidates,
  filterCandidates,
  partitionBySource,
  type SortMode,
  type FilterChip,
  type UpgradeCandidate,
} from '@/lib/upgrade-candidates'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UpgradeTabProps {
  deckId: number
}

interface DebriefSession {
  id: number
  date: string
  total_fixes: number
  reviewed_fixes: number
  applied: number
  skipped: number
  pending: number
  changes: Array<{ from: string; to: string; skipped: boolean }>
}

interface ChangeLogEntry {
  id: number
  date: string
  cut_card: string
  add_card: string
  reason: string
  skipped: boolean
}

interface UpgradeData {
  candidates: UpgradeCandidate[]
  change_log: ChangeLogEntry[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}



// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UpgradeTab({ deckId }: UpgradeTabProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [sortMode, setSortMode] = useState<SortMode>('impact')
  const [activeFilters, setActiveFilters] = useState<Set<FilterChip>>(new Set())

  // Fetch debrief session (if table exists)
  const { data: debriefSession } = useQuery<DebriefSession | null>({
    queryKey: ['decks', deckId, 'debrief-session'],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/decks/${deckId}/debrief-session`)
        if (!res.ok) return null
        return res.json()
      } catch {
        return null
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  // Fetch upgrade data
  const { data: upgradeData, isLoading } = useQuery<UpgradeData | null>({
    queryKey: ['decks', deckId, 'upgrade'],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/upgrade`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error('Failed to load upgrade data')
      const raw = await res.json()
      // Normalise: existing API may return { directions, cuts } format
      if (raw.candidates) return raw as UpgradeData
      // Adapt the existing format gracefully
      return { candidates: [], change_log: [] }
    },
    staleTime: 5 * 60 * 1000,
  })

  // Refresh analysis mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/upgrade/refresh`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to refresh analysis')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'upgrade'] })
      toast.success('Analysis refreshed')
    },
    onError: () => {
      toast.error('Failed to refresh analysis')
    },
  })

  // Make change mutation
  const makeChangeMutation = useMutation({
    mutationFn: async (candidate: UpgradeCandidate) => {
      const res = await fetch(`/api/decks/${deckId}/upgrade/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cut: candidate.cut.card_name,
          add: candidate.add.card_name,
        }),
      })
      if (!res.ok) throw new Error('Failed to apply change')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'upgrade'] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
      toast.success('Change applied')
    },
    onError: () => {
      toast.error('Failed to apply change')
    },
  })

  // Skip mutation
  const skipMutation = useMutation({
    mutationFn: async (candidate: UpgradeCandidate) => {
      const res = await fetch(`/api/decks/${deckId}/upgrade/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cut: candidate.cut.card_name,
          add: candidate.add.card_name,
        }),
      })
      if (!res.ok) throw new Error('Failed to skip')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'upgrade'] })
      toast.success('Skipped')
    },
    onError: () => {
      toast.error('Failed to skip')
    },
  })

  // Computed candidates
  const candidates = useMemo(() => {
    if (!upgradeData?.candidates) return []
    const filtered = filterCandidates(upgradeData.candidates, activeFilters)
    const sorted = sortCandidates(filtered, sortMode)
    return partitionBySource(sorted)
  }, [upgradeData, sortMode, activeFilters])

  const changeLog = upgradeData?.change_log ?? []
  const thisMonthCount = changeLog.filter((entry) => {
    const d = new Date(entry.date)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  // Toggle a filter chip
  function toggleFilter(chip: FilterChip) {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(chip)) next.delete(chip)
      else next.add(chip)
      return next
    })
  }

  // ─── Loading ───
  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1080px] space-y-6 p-4">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    )
  }

  // ─── Render ───
  return (
    <div className="mx-auto max-w-[1080px] space-y-6 pb-12">
      {/* ─── 1. Last Debrief Banner (conditional) ─── */}
      {debriefSession && <DebriefBanner session={debriefSession} deckId={deckId} />}

      {/* ─── 2. Toolbar ─── */}
      <Toolbar
        sortMode={sortMode}
        onSortChange={setSortMode}
        activeFilters={activeFilters}
        onToggleFilter={toggleFilter}
        onRefresh={() => refreshMutation.mutate()}
        isRefreshing={refreshMutation.isPending}
      />

      {/* ─── 3. Upgrade Candidates ─── */}
      {candidates.length > 0 ? (
        <div className="space-y-3">
          {candidates.map((candidate, i) => (
            <UpgradeCard
              key={`${candidate.cut.card_name}-${candidate.add.card_name}-${i}`}
              candidate={candidate}
              onMakeChange={() => makeChangeMutation.mutate(candidate)}
              onSkip={() => skipMutation.mutate(candidate)}
              onDiscuss={() => router.push(`/decks/${deckId}/chat?topic=${encodeURIComponent(candidate.add.card_name)}`)}
              isMutating={makeChangeMutation.isPending || skipMutation.isPending}
            />
          ))}
        </div>
      ) : (
        /* Show fresh analysis prompt as primary view when no candidates */
        null
      )}

      {/* ─── 4. Fresh Analysis Prompt ─── */}
      <FreshAnalysisPrompt
        onRun={() => refreshMutation.mutate()}
        isRunning={refreshMutation.isPending}
      />

      {/* ─── 5. Change Log ─── */}
      {changeLog.length > 0 && (
        <ChangeLogSection entries={changeLog} thisMonthCount={thisMonthCount} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DebriefBanner({
  session,
  deckId,
}: {
  session: DebriefSession
  deckId: number
}) {
  const hasPendingFixes = session.reviewed_fixes < session.total_fixes

  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={{
        background: 'rgba(29,158,117,0.05)',
        border: '0.5px solid rgba(29,158,117,0.2)',
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sword className="h-4 w-4 text-[#1D9E75]" />
          <span className="text-[length:var(--fs-md)] font-medium">
            Last debrief — {formatDate(session.date)} · {session.reviewed_fixes} of{' '}
            {session.total_fixes} fixes reviewed
          </span>
        </div>
        {hasPendingFixes && (
          <a
            href={`/decks/${deckId}?debrief=true&resume=${session.id}`}
            className="inline-flex items-center gap-1 text-[length:var(--fs-sm)] font-medium hover:opacity-80 transition-opacity"
            style={{ color: '#1D9E75' }}
          >
            Resume debrief <ArrowRight className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Summary line */}
      <div className="flex items-center gap-4 text-[length:var(--fs-sm)] text-muted-foreground">
        <span>{session.applied} change made</span>
        <span>{session.skipped} skipped</span>
        <span>{session.pending} pending</span>
      </div>

      {/* Changes as pills */}
      {session.changes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {session.changes.map((change, i) =>
            change.skipped ? (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground opacity-60"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '0.5px solid rgba(255,255,255,0.1)',
                }}
              >
                Skipped: {change.from} → {change.to}
              </span>
            ) : (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                style={{
                  background: 'rgba(29,158,117,0.1)',
                  color: '#1D9E75',
                }}
              >
                {change.from} → {change.to}
              </span>
            )
          )}
        </div>
      )}
    </div>
  )
}

function Toolbar({
  sortMode,
  onSortChange,
  activeFilters,
  onToggleFilter,
  onRefresh,
  isRefreshing,
}: {
  sortMode: SortMode
  onSortChange: (mode: SortMode) => void
  activeFilters: Set<FilterChip>
  onToggleFilter: (chip: FilterChip) => void
  onRefresh: () => void
  isRefreshing: boolean
}) {
  const sortOptions: { value: SortMode; label: string }[] = [
    { value: 'impact', label: 'Impact' },
    { value: 'cheapest', label: 'Cheapest' },
    { value: 'owned', label: 'Owned' },
    { value: 'edhrec', label: 'EDHREC' },
  ]

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Sort segmented control */}
      <div
        className="inline-flex rounded-md overflow-hidden"
        style={{ border: '0.5px solid rgba(255,255,255,0.1)' }}
        role="group"
        aria-label="Sort options"
      >
        {sortOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSortChange(opt.value)}
            className="px-3 py-1.5 text-[length:var(--fs-sm)] font-medium transition-colors"
            style={{
              background:
                sortMode === opt.value
                  ? 'rgba(29,158,117,0.15)'
                  : 'transparent',
              color: sortMode === opt.value ? '#1D9E75' : 'rgba(255,255,255,0.5)',
            }}
            aria-pressed={sortMode === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Filter chips */}
      <FilterChipButton
        label="Owned only"
        active={activeFilters.has('owned_only')}
        onClick={() => onToggleFilter('owned_only')}
      />
      <FilterChipButton
        label="Under $5"
        active={activeFilters.has('under_5')}
        onClick={() => onToggleFilter('under_5')}
      />

      {/* Refresh button — right-aligned */}
      <div className="ml-auto">
        <Button
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="text-[length:var(--fs-sm)] text-muted-foreground"
        >
          <RefreshCw
            className={`mr-1 h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          Refresh analysis
        </Button>
      </div>
    </div>
  )
}

function FilterChipButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1 text-[length:var(--fs-sm)] font-medium transition-colors"
      style={{
        background: active ? 'rgba(29,158,117,0.15)' : 'rgba(255,255,255,0.04)',
        color: active ? '#1D9E75' : 'rgba(255,255,255,0.5)',
        border: active
          ? '0.5px solid rgba(29,158,117,0.4)'
          : '0.5px solid rgba(255,255,255,0.1)',
      }}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

function UpgradeCard({
  candidate,
  onMakeChange,
  onSkip,
  onDiscuss,
  isMutating,
}: {
  candidate: UpgradeCandidate
  onMakeChange: () => void
  onSkip: () => void
  onDiscuss: () => void
  isMutating: boolean
}) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: '0.5px solid rgba(255,255,255,0.06)',
        borderLeft: candidate.source === 'debrief' ? '2px solid rgba(29,158,117,0.4)' : undefined,
      }}
    >
      {/* Header: priority + impact bar + source badge */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="text-[length:var(--fs-sm)] font-medium text-muted-foreground tabular-nums">
          #{candidate.priority}
        </span>
        <ImpactBar value={candidate.impact} />
        <SourceBadge source={candidate.source} />
      </div>

      {/* Cut / Add two-column layout */}
      <div className="grid grid-cols-2">
        {/* Cut side */}
        <div className="px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-flex items-center justify-center rounded-sm"
              style={{
                width: 16,
                height: 16,
                background: 'rgba(226,75,74,0.15)',
              }}
            >
              <Minus className="h-2.5 w-2.5 text-[#E24B4A]" />
            </span>
            <span className="text-[length:var(--fs-xs)] font-medium text-[#E24B4A] uppercase">
              Cut
            </span>
          </div>
          <p className="text-[13px] font-medium">{candidate.cut.card_name}</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {candidate.cut.reason}
          </p>
          <OwnershipBadge
            status={candidate.cut.ownership_status}
            holderDeckName={candidate.cut.holder_deck_name}
          />
        </div>

        {/* Divider */}
        <div
          className="px-4 py-3 space-y-1.5"
          style={{ borderLeft: '0.5px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="inline-flex items-center justify-center rounded-sm"
              style={{
                width: 16,
                height: 16,
                background: 'rgba(29,158,117,0.15)',
              }}
            >
              <Check className="h-2.5 w-2.5 text-[#1D9E75]" />
            </span>
            <span className="text-[length:var(--fs-xs)] font-medium text-[#1D9E75] uppercase">
              Add
            </span>
          </div>
          <p className="text-[13px] font-medium">{candidate.add.card_name}</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {candidate.add.reason}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <OwnershipBadge
              status={candidate.add.ownership_status}
              holderDeckName={candidate.add.holder_deck_name}
            />
            {candidate.add.edhrec_percent != null && (
              <span className="text-[length:var(--fs-xs)] text-muted-foreground">
                {candidate.add.edhrec_percent}% EDHREC
              </span>
            )}
            {candidate.add.price != null && (
              <span className="text-[length:var(--fs-xs)] text-muted-foreground">
                ${candidate.add.price.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Conflict alert (inline, below card) */}
      {candidate.conflict && (
        <div className="px-4 pb-3">
          <ConflictAlert
            affectedDeckName={candidate.conflict.deck_name}
            cardName={candidate.add.card_name}
          />
        </div>
      )}

      {/* Action buttons */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}
      >
        <Button
          size="sm"
          onClick={onMakeChange}
          disabled={isMutating}
          className="text-[length:var(--fs-sm)] text-white hover:opacity-90"
          style={{ background: '#1D9E75' }}
        >
          <Check className="mr-1 h-3 w-3" />
          Make change
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onSkip}
          disabled={isMutating}
          className="text-[length:var(--fs-sm)]"
        >
          <X className="mr-1 h-3 w-3" />
          Skip
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDiscuss}
          className="ml-auto text-[11px] text-muted-foreground"
        >
          <MessageSquare className="mr-1 h-3 w-3" />
          Discuss in debrief
        </Button>
      </div>
    </div>
  )
}

function ImpactBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      className="flex-1 h-1 rounded-full overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.06)', maxWidth: 120 }}
      role="meter"
      aria-label={`Impact: ${clamped}%`}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${clamped}%`,
          background: '#1D9E75',
        }}
      />
    </div>
  )
}

function SourceBadge({ source }: { source: 'debrief' | 'analysis' }) {
  if (source === 'debrief') {
    return (
      <span
        className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium"
        style={{
          border: '0.5px solid rgba(29,158,117,0.4)',
          color: '#1D9E75',
        }}
      >
        <Sword className="h-2.5 w-2.5" />
        From debrief
      </span>
    )
  }
  return (
    <span
      className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium"
      style={{
        border: '0.5px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.5)',
      }}
    >
      Analysis
    </span>
  )
}

function FreshAnalysisPrompt({
  onRun,
  isRunning,
}: {
  onRun: () => void
  isRunning: boolean
}) {
  return (
    <div
      className="rounded-lg p-6 text-center space-y-3"
      style={{
        border: '1px dashed rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <Sparkles className="mx-auto h-5 w-5 text-muted-foreground" />
      <h4 className="text-[length:var(--fs-md)] font-medium">Run a fresh analysis</h4>
      <p className="text-[length:var(--fs-md)] text-muted-foreground">
        Generates new suggestions from scratch — useful after significant deck changes.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={onRun}
        disabled={isRunning}
        className="text-[length:var(--fs-sm)]"
      >
        {isRunning ? (
          <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <span className="mr-1">▶</span>
        )}
        Run analysis
      </Button>
    </div>
  )
}

function ChangeLogSection({
  entries,
  thisMonthCount,
}: {
  entries: ChangeLogEntry[]
  thisMonthCount: number
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-[length:var(--fs-md)] font-medium text-muted-foreground">
        Change log · {thisMonthCount} change{thisMonthCount !== 1 ? 's' : ''} this month
      </h3>

      <div className="space-y-1">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-[length:var(--fs-sm)] ${
              entry.skipped ? 'opacity-50' : ''
            }`}
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            {/* Status dot */}
            <span
              className="shrink-0 rounded-full"
              style={{
                width: 6,
                height: 6,
                background: entry.skipped ? 'rgba(255,255,255,0.15)' : '#1D9E75',
              }}
              aria-hidden="true"
            />

            {/* Description */}
            <span className="flex-1 min-w-0 truncate">
              {entry.skipped ? (
                <span className="text-muted-foreground">
                  Skipped: {entry.cut_card} → {entry.add_card}
                </span>
              ) : (
                <>
                  Cut <strong>{entry.cut_card}</strong> → Added{' '}
                  <strong>{entry.add_card}</strong>
                </>
              )}
            </span>

            {/* Date */}
            <span className="shrink-0 text-muted-foreground">
              {formatDate(entry.date)}
            </span>

            {/* Reason (truncated) */}
            {entry.reason && !entry.skipped && (
              <span className="hidden md:inline shrink-0 max-w-[180px] truncate text-muted-foreground">
                {entry.reason}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
