'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Printer,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import { cn } from '@/lib/utils'
import type { RankedCandidate, CandidateTier } from '@/lib/allocation-candidates'

/* ─── Types ─────────────────────────────────────────────────────────── */

interface PicklistProps {
  deckId: number
  deckName: string
}

interface PicklistCard {
  deckCardsId: number
  cardName: string
  isResolved: boolean
  physicalCopyId: number | null
  ownershipStatus: string | null
  candidates: RankedCandidate[]
}

interface PicklistResponse {
  deckName: string
  cards: PicklistCard[]
  progress: { resolved: number; total: number }
}

interface AssignResponse {
  success: boolean
  previousAssignment: PreviousAssignment | null
  physicalCopyId?: number
}

interface PreviousAssignment {
  deckCardsId: number
  deckId: number
  deckName: string
  physicalCopyId: number
}

interface UndoEntry {
  id: string
  cardName: string
  deckCardsId: number
  physicalCopyId: number
  previousAssignment: PreviousAssignment | null
  timestamp: number
}

interface Tier4Pending {
  card: PicklistCard
  candidate: RankedCandidate
}

/* ─── Constants ─────────────────────────────────────────────────────── */

const TIER_LABELS: Record<CandidateTier, string> = {
  1: 'Free in Storage',
  2: 'Free Proxy in Storage',
  3: 'From Brew Decks',
  4: 'From Boxed Decks',
  5: 'No Copy Available',
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

function groupByTier(cards: PicklistCard[]): Map<CandidateTier, Array<{ card: PicklistCard; candidate: RankedCandidate }>> {
  const groups = new Map<CandidateTier, Array<{ card: PicklistCard; candidate: RankedCandidate }>>()

  for (const card of cards) {
    if (card.isResolved || card.candidates.length === 0) continue

    // Use the best (first) candidate's tier for grouping
    const bestCandidate = card.candidates[0]
    const tier = bestCandidate.tier

    if (!groups.has(tier)) {
      groups.set(tier, [])
    }
    groups.get(tier)!.push({ card, candidate: bestCandidate })
  }

  return groups
}

function formatLocation(candidate: RankedCandidate): string {
  const entry = candidate.entry
  if (entry.storageLocationName) return entry.storageLocationName
  if (entry.assignedTo) return `${entry.assignedTo.deckName}`
  return 'Unknown'
}

function formatCopyDetails(candidate: RankedCandidate): string {
  const entry = candidate.entry
  const parts: string[] = []
  if (entry.condition) parts.push(entry.condition.replace('_', ' '))
  if (entry.isFoil) parts.push('Foil')
  else parts.push('Non-foil')
  if (entry.isProxy) parts.push('Proxy')
  return parts.join(' · ')
}

/* ─── Component ─────────────────────────────────────────────────────── */

export function Picklist({ deckId, deckName }: PicklistProps) {
  const queryClient = useQueryClient()
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set())
  const [loadingRows, setLoadingRows] = useState<Set<number>>(new Set())
  const [undoHistory, setUndoHistory] = useState<UndoEntry[]>([])
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [tier4Pending, setTier4Pending] = useState<Tier4Pending | null>(null)
  const [tier4Loading, setTier4Loading] = useState(false)

  // ─── Data fetching ─────────────────────────────────────────────────
  const {
    data: picklist,
    isLoading,
    error,
  } = useQuery<PicklistResponse>({
    queryKey: ['picklist', deckId],
    queryFn: () =>
      fetch(`/api/decks/${deckId}/picklist`).then((r) => {
        if (!r.ok) throw new Error('Failed to load picklist')
        return r.json()
      }),
    staleTime: 30 * 1000, // 30s — picklist changes frequently during use
  })

  // ─── Assign mutation ───────────────────────────────────────────────
  const assignMutation = useMutation({
    mutationFn: async (body: {
      deckCardsId: number
      physicalCopyId?: number
      tier?: number
      createProxy?: boolean
      cardDefinitionId?: number
    }): Promise<AssignResponse> => {
      const res = await fetch('/api/allocation/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        // 409 = copy was just claimed by another deck — stale candidate list
        if (res.status === 409 || err.stale) {
          // Refresh candidates so the user sees the updated state
          queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
          queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
          throw new Error(err.error || 'That card was just claimed elsewhere. Refreshing available options.')
        }
        throw new Error(err.error || 'Assignment failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'picklist'] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'health'] })
    },
  })

  // ─── Undo mutation ─────────────────────────────────────────────────
  const undoMutation = useMutation({
    mutationFn: async (body: {
      deckCardsId: number
      physicalCopyId: number
      restoreTo: { deckCardsId: number } | null
    }) => {
      const res = await fetch('/api/allocation/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Undo failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picklist', deckId] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'picklist'] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'health'] })
    },
  })

  // ─── Handlers ──────────────────────────────────────────────────────

  const handleAssign = useCallback(
    async (card: PicklistCard, candidate: RankedCandidate) => {
      // Tier 4: gate with confirmation modal
      if (candidate.tier === 4) {
        setTier4Pending({ card, candidate })
        return
      }

      await executeAssign(card, candidate)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const executeAssign = async (card: PicklistCard, candidate: RankedCandidate) => {
    setLoadingRows((prev) => new Set(prev).add(card.deckCardsId))

    try {
      const result = await assignMutation.mutateAsync({
        deckCardsId: card.deckCardsId,
        physicalCopyId: candidate.entry.physicalCopyId,
        tier: candidate.tier,
      })

      if (result.success) {
        const undoEntry: UndoEntry = {
          id: `${card.deckCardsId}-${Date.now()}`,
          cardName: card.cardName,
          deckCardsId: card.deckCardsId,
          physicalCopyId: candidate.entry.physicalCopyId,
          previousAssignment: result.previousAssignment,
          timestamp: Date.now(),
        }

        setUndoHistory((prev) => [undoEntry, ...prev])

        // Show toast with undo button
        toast.success(`Assigned ${card.cardName}`, {
          action: {
            label: 'Undo',
            onClick: () => handleUndo(undoEntry),
          },
          duration: 8000,
        })
      }
    } catch (err) {
      toast.error(
        `Failed to assign ${card.cardName}: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    } finally {
      setLoadingRows((prev) => {
        const next = new Set(prev)
        next.delete(card.deckCardsId)
        return next
      })
    }
  }

  const handlePrintProxy = async (card: PicklistCard) => {
    // Tier 5: must have cardDefinitionId from a synthetic candidate
    // Get the card_definition_id from the first candidate's entry
    const candidate = card.candidates[0]
    if (!candidate) return

    setLoadingRows((prev) => new Set(prev).add(card.deckCardsId))

    try {
      // For tier 5, we need to resolve card_definition_id
      // The synthetic entry has -1, so we need to look it up
      const res = await fetch(
        `/api/allocation/candidates?cardName=${encodeURIComponent(card.cardName)}`
      )
      const { candidates } = await res.json()

      // If there are real candidates, use the first one's cardDefinitionId
      // Otherwise we need to get it from card_definitions
      let cardDefinitionId: number | undefined

      if (candidates?.length > 0 && candidates[0].entry.cardDefinitionId > 0) {
        cardDefinitionId = candidates[0].entry.cardDefinitionId
      } else {
        // Fetch from card_definitions directly
        const defRes = await fetch(
          `/api/cards/${encodeURIComponent(card.cardName)}`
        )
        if (defRes.ok) {
          const defData = await defRes.json()
          cardDefinitionId = defData.id ?? defData.cardDefinitionId
        }
      }

      if (!cardDefinitionId) {
        toast.error(`Cannot create proxy: card definition not found for "${card.cardName}"`)
        return
      }

      const result = await assignMutation.mutateAsync({
        deckCardsId: card.deckCardsId,
        createProxy: true,
        cardDefinitionId,
      })

      if (result.success) {
        const undoEntry: UndoEntry = {
          id: `${card.deckCardsId}-${Date.now()}`,
          cardName: card.cardName,
          deckCardsId: card.deckCardsId,
          physicalCopyId: result.physicalCopyId!,
          previousAssignment: null,
          timestamp: Date.now(),
        }

        setUndoHistory((prev) => [undoEntry, ...prev])
        toast.success(`Printed proxy for ${card.cardName}`, {
          action: {
            label: 'Undo',
            onClick: () => handleUndo(undoEntry),
          },
          duration: 8000,
        })
      }
    } catch (err) {
      toast.error(
        `Failed to print proxy for ${card.cardName}: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    } finally {
      setLoadingRows((prev) => {
        const next = new Set(prev)
        next.delete(card.deckCardsId)
        return next
      })
    }
  }

  const handleTier4Confirm = async () => {
    if (!tier4Pending) return
    setTier4Loading(true)
    try {
      await executeAssign(tier4Pending.card, tier4Pending.candidate)
    } finally {
      setTier4Loading(false)
      setTier4Pending(null)
    }
  }

  const handleUndo = async (entry: UndoEntry) => {
    try {
      const result = await undoMutation.mutateAsync({
        deckCardsId: entry.deckCardsId,
        physicalCopyId: entry.physicalCopyId,
        restoreTo: entry.previousAssignment
          ? { deckCardsId: entry.previousAssignment.deckCardsId }
          : null,
      })

      if (result.success === false && result.reason === 'slot_claimed_elsewhere') {
        toast.error("Can't undo — that slot has been claimed by another deck since.")
        return
      }

      // Remove from undo history
      setUndoHistory((prev) => prev.filter((e) => e.id !== entry.id))
      toast.success(`Undid assignment of ${entry.cardName}`)
    } catch (err) {
      toast.error(
        `Undo failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    }
  }

  const toggleExpand = (deckCardsId: number) => {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(deckCardsId)) next.delete(deckCardsId)
      else next.add(deckCardsId)
      return next
    })
  }

  // ─── Derived data ──────────────────────────────────────────────────

  const unresolvedCards = useMemo(
    () => (picklist?.cards ?? []).filter((c) => !c.isResolved),
    [picklist]
  )

  const tierGroups = useMemo(() => groupByTier(unresolvedCards), [unresolvedCards])

  const sortedTiers = useMemo(
    () => Array.from(tierGroups.keys()).sort((a, b) => a - b) as CandidateTier[],
    [tierGroups]
  )

  // ─── Loading state ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-destructive">
        Failed to load picklist. Please try again.
      </div>
    )
  }

  if (!picklist) return null

  const { progress } = picklist

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--border-default, rgba(255,255,255,0.1))' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress.total > 0 ? (progress.resolved / progress.total) * 100 : 0}%`,
                background: 'var(--accent-primary)',
              }}
            />
          </div>
        </div>
        <span className="shrink-0 text-[length:var(--fs-md)] font-medium">
          {progress.resolved}/{progress.total} resolved
        </span>
      </div>

      {/* All resolved state */}
      {progress.resolved === progress.total && progress.total > 0 && (
        <div
          className="rounded-lg px-4 py-3 text-[length:var(--fs-md)]"
          style={{ background: 'rgba(29, 158, 117, 0.1)', color: 'var(--accent-primary)' }}
        >
          All {progress.total} cards are resolved. This deck is ready to be Boxed.
        </div>
      )}

      {/* Tier groups — all tiers always shown, unavailable ones disabled */}
      {([1, 2, 3, 4, 5] as CandidateTier[]).map((tier) => {
        const items = tierGroups.get(tier) ?? []

        return (
          <section key={tier} className="flex flex-col gap-1">
            {/* Tier header */}
            <h3
              className="flex items-center gap-2 border-b py-2 text-[length:var(--fs-sm)] font-medium uppercase tracking-wide text-muted-foreground"
              style={{ borderColor: 'var(--border-default)' }}
            >
              {tier === 4 && (
                <AlertTriangle
                  className="size-3.5"
                  style={{ color: 'var(--signal-warning)' }}
                  aria-hidden="true"
                />
              )}
              {TIER_LABELS[tier]}
              <span className="text-muted-foreground/60">({items.length})</span>
            </h3>

            {/* Empty state for unavailable tiers */}
            {items.length === 0 && (
              <div className="px-3 py-2 text-[length:var(--fs-sm)] text-muted-foreground/50 italic">
                None available
              </div>
            )}

            {/* Rows */}
            {items.map(({ card, candidate }) => {
              const isExpanded = expandedCards.has(card.deckCardsId)
              const isRowLoading = loadingRows.has(card.deckCardsId)
              const hasMultiple = card.candidates.length > 1

              return (
                <div key={card.deckCardsId} className="flex flex-col">
                  {/* Main row */}
                  <div
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 transition-colors',
                      'hover:bg-white/[0.03]',
                      isRowLoading && 'opacity-60'
                    )}
                  >
                    {/* Control: checkbox for tiers 1-4, button for tier 5 */}
                    {tier !== 5 ? (
                      <div className="shrink-0">
                        {isRowLoading ? (
                          <Loader2
                            className="size-4 animate-spin text-muted-foreground"
                            aria-label="Assigning..."
                          />
                        ) : (
                          <Checkbox
                            checked={false}
                            onCheckedChange={() => handleAssign(card, candidate)}
                            disabled={isRowLoading}
                            aria-label={`Assign ${card.cardName}`}
                          />
                        )}
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePrintProxy(card)}
                        disabled={isRowLoading}
                        className="shrink-0 gap-1.5"
                        style={{ fontSize: '11px', height: '28px' }}
                      >
                        {isRowLoading ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Printer className="size-3" />
                        )}
                        Print Proxy
                      </Button>
                    )}

                    {/* Card name */}
                    <span className="flex-1 font-medium text-[length:var(--fs-md)]">
                      {card.cardName}
                    </span>

                    {/* Candidate details */}
                    {tier !== 5 && (
                      <span className="text-[length:var(--fs-sm)] text-muted-foreground">
                        {hasMultiple ? (
                          <button
                            type="button"
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                            onClick={() => toggleExpand(card.deckCardsId)}
                          >
                            {card.candidates.length} copies available
                            {isExpanded ? (
                              <ChevronDown className="size-3" />
                            ) : (
                              <ChevronRight className="size-3" />
                            )}
                          </button>
                        ) : (
                          <span>{formatCopyDetails(candidate)}</span>
                        )}
                      </span>
                    )}

                    {/* Location */}
                    {tier !== 5 && (
                      <span className="shrink-0 text-[length:var(--fs-sm)] text-muted-foreground/70">
                        {candidate.entry.assignedTo
                          ? `In: ${candidate.entry.assignedTo.deckName} (${candidate.entry.assignedTo.deckStatus})`
                          : candidate.entry.storageLocationName ?? ''}
                      </span>
                    )}

                    {/* Tier 4 warning */}
                    {tier === 4 && (
                      <AlertTriangle
                        className="size-3.5 shrink-0"
                        style={{ color: 'var(--signal-warning)' }}
                        aria-label="Requires confirmation"
                      />
                    )}
                  </div>

                  {/* Expanded candidates list */}
                  {isExpanded && hasMultiple && (
                    <div className="ml-10 flex flex-col gap-0.5 pb-2">
                      {card.candidates.map((alt, idx) => (
                        <div
                          key={`${alt.entry.physicalCopyId}-${idx}`}
                          className="flex items-center gap-3 rounded px-3 py-1.5 hover:bg-white/[0.02]"
                        >
                          <Checkbox
                            checked={false}
                            onCheckedChange={() => handleAssign(card, alt)}
                            disabled={isRowLoading}
                            aria-label={`Assign ${card.cardName} from ${formatLocation(alt)}`}
                          />
                          <span className="text-[length:var(--fs-sm)]">
                            {formatCopyDetails(alt)}
                          </span>
                          <span className="text-[length:var(--fs-sm)] text-muted-foreground/70">
                            {alt.entry.assignedTo
                              ? `In: ${alt.entry.assignedTo.deckName} (${alt.entry.assignedTo.deckStatus})`
                              : alt.entry.storageLocationName ?? 'Storage'}
                          </span>
                          {idx === 0 && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[length:var(--fs-xs)]"
                              style={{
                                background: 'rgba(29, 158, 117, 0.15)',
                                color: 'var(--accent-primary)',
                              }}
                            >
                              Best match
                            </span>
                          )}
                          {alt.tier === 4 && (
                            <AlertTriangle
                              className="size-3"
                              style={{ color: 'var(--signal-warning)' }}
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )
      })}

      {/* No unresolved cards */}
      {unresolvedCards.length === 0 && progress.total > 0 && (
        <p className="py-8 text-center text-muted-foreground">
          No unresolved cards remaining.
        </p>
      )}

      {/* ─── Undo History Panel ─────────────────────────────────────── */}
      {undoHistory.length > 0 && (
        <section
          className="mt-4 rounded-lg border"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[length:var(--fs-sm)] font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setHistoryExpanded(!historyExpanded)}
          >
            <Undo2 className="size-3.5" />
            Recent assignments ({undoHistory.length})
            {historyExpanded ? (
              <ChevronDown className="ml-auto size-3.5" />
            ) : (
              <ChevronRight className="ml-auto size-3.5" />
            )}
          </button>

          {historyExpanded && (
            <div
              className="flex flex-col gap-1 border-t px-4 py-2"
              style={{ borderColor: 'var(--border-default)' }}
            >
              {undoHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 py-1.5 text-[length:var(--fs-sm)]"
                >
                  <span className="flex-1">
                    <span className="font-medium">{entry.cardName}</span>
                    {entry.previousAssignment && (
                      <span className="text-muted-foreground">
                        {' '}← pulled from {entry.previousAssignment.deckName}
                      </span>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUndo(entry)}
                    disabled={undoMutation.isPending}
                    className="h-6 gap-1 px-2 text-[length:var(--fs-xs)]"
                  >
                    <Undo2 className="size-3" />
                    Undo
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ─── Tier 4 Confirmation Modal ────────────────────────────── */}
      <ConfirmationModal
        open={tier4Pending !== null}
        onConfirm={handleTier4Confirm}
        onCancel={() => setTier4Pending(null)}
        title="Reassign from Boxed deck?"
        description={
          tier4Pending
            ? `This is the only copy of ${tier4Pending.card.cardName} and it's currently in ${tier4Pending.candidate.entry.assignedTo?.deckName ?? 'another deck'}. Removing it will make that deck incomplete and no longer playable. Continue?`
            : undefined
        }
        confirmLabel="Reassign"
        isLoading={tier4Loading}
      />
    </div>
  )
}
