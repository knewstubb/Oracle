'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { DeckStatus, StatusUpdateResponse } from '@/lib/deck-status'
import { VALID_STATUSES } from '@/lib/deck-status'
import { validateDeckCount } from '@/lib/format-config'

export interface StatusControlProps {
  deckId: number
  currentStatus: DeckStatus
  /** Current allocate state — needed to decide if archive confirmation is required */
  allocate?: boolean
  /** Current card count — used for Brewing→In Rotation gate */
  cardCount?: number
  /** Deck format — used for count validation */
  format?: string | null
}

const STATUS_CONFIG: Record<DeckStatus, { label: string; color: string; bg: string; activeRing: string }> = {
  brewing: {
    label: 'Brewing',
    color: '#378ADD',
    bg: 'rgba(55,138,221,0.15)',
    activeRing: 'ring-[#378ADD]/40',
  },
  in_rotation: {
    label: 'In Rotation',
    color: 'var(--accent-primary)',
    bg: 'var(--accent-primary-bg)',
    activeRing: 'ring-[var(--accent-primary)]/40',
  },
  graveyard: {
    label: 'Graveyard',
    color: 'var(--text-secondary)',
    bg: 'var(--bg-card)',
    activeRing: 'ring-[var(--text-secondary)]/20',
  },
}

export function StatusControl({ deckId, currentStatus, allocate, cardCount, format }: StatusControlProps) {
  const [optimisticStatus, setOptimisticStatus] = useState<DeckStatus>(currentStatus)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<DeckStatus | null>(null)
  const queryClient = useQueryClient()

  const statusMutation = useMutation({
    mutationFn: async (newStatus: DeckStatus): Promise<StatusUpdateResponse> => {
      const res = await fetch(`/api/decks/${deckId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update status')
      }
      return data as StatusUpdateResponse
    },
    onSuccess: (data) => {
      setOptimisticStatus(data.deck.status)
      // Invalidate all relevant queries so UI updates without manual refresh
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
      queryClient.invalidateQueries({ queryKey: ['shared-cards'] })
      queryClient.invalidateQueries({ queryKey: ['allocation', deckId] })
      queryClient.invalidateQueries({ queryKey: ['proxy-report'] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['rollup-v2'] })
      toast.success(`Deck status updated to ${STATUS_CONFIG[data.deck.status].label}`)
    },
    onError: (err: Error) => {
      setOptimisticStatus(currentStatus)
      toast.error(err.message || 'Failed to update deck status')
    },
  })

  function handleStatusChange(newStatus: DeckStatus) {
    if (newStatus === optimisticStatus) return

    // Graveyard transition: prompt if the deck has claimed cards (allocate is on = likely has claims)
    if (newStatus === 'graveyard' && allocate) {
      setPendingStatus(newStatus)
      setConfirmOpen(true)
      return
    }

    // All other transitions: no precondition
    setOptimisticStatus(newStatus)
    statusMutation.mutate(newStatus)
  }

  function handleConfirm() {
    if (!pendingStatus) return
    setConfirmOpen(false)
    setOptimisticStatus(pendingStatus)
    statusMutation.mutate(pendingStatus)
    setPendingStatus(null)
  }

  function handleConfirmWithRelease() {
    if (!pendingStatus) return
    setConfirmOpen(false)
    setOptimisticStatus(pendingStatus)
    // Break down (release all claims) then set status
    breakdownMutation.mutate()
  }

  function handleCancel() {
    setConfirmOpen(false)
    setPendingStatus(null)
  }

  // Break-down mutation: release all claimed cards, then set graveyard status
  const breakdownMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/breakdown`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to release cards')
      }
      // Now set the status to graveyard
      const statusRes = await fetch(`/api/decks/${deckId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'graveyard' }),
      })
      if (!statusRes.ok) {
        const data = await statusRes.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update status')
      }
      return statusRes.json() as Promise<StatusUpdateResponse>
    },
    onSuccess: (data) => {
      setOptimisticStatus(data.deck.status)
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
      queryClient.invalidateQueries({ queryKey: ['shared-cards'] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      toast.success('Cards released and deck moved to Graveyard')
    },
    onError: (err: Error) => {
      setOptimisticStatus(currentStatus)
      toast.error(err.message)
    },
  })

  return (
    <>
      <div
        className="inline-flex flex-wrap items-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] p-0.5"
        role="radiogroup"
        aria-label="Deck status"
      >
        {VALID_STATUSES.map((status) => {
          const config = STATUS_CONFIG[status]
          const isSelected = optimisticStatus === status

          // Gate: Brewing → In Rotation requires valid card count
          // Gate: Graveyard → In Rotation not allowed (must resurrect to Brewing first)
          const countValidation = validateDeckCount(cardCount ?? 0, format)
          const isCountGated = status === 'in_rotation' && optimisticStatus === 'brewing' && !countValidation.valid
          const isResurrectGated = status === 'in_rotation' && optimisticStatus === 'graveyard'
          const isGated = isCountGated || isResurrectGated
          const isDisabled = statusMutation.isPending || isGated
          const gateReason = isCountGated ? countValidation.reason : isResurrectGated ? 'Resurrect to Brewing first' : null

          return (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`Set status to ${config.label}`}
              title={isGated ? gateReason ?? undefined : undefined}
              disabled={isDisabled}
              onClick={() => handleStatusChange(status)}
              className={cn(
                'relative rounded-md px-3 py-1.5 text-[length:var(--fs-md)] font-medium transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent',
                isSelected
                  ? `ring-1 ${config.activeRing}`
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                isDisabled && 'cursor-not-allowed opacity-60'
              )}
              style={
                isSelected
                  ? { backgroundColor: config.bg, color: config.color }
                  : undefined
              }
            >
              {statusMutation.isPending && isSelected && (
                <Loader2 className="mr-1 inline-block size-3 animate-spin" aria-hidden="true" />
              )}
              {config.label}
            </button>
          )
        })}
      </div>

      {/* Confirmation dialog — Graveyard transition when deck has claimed cards */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) handleCancel() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move to Graveyard?</DialogTitle>
            <DialogDescription>
              This deck has cards claimed from your collection. Moving it to the graveyard
              will retire it from active use.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={handleCancel}>Cancel</Button>
            <Button variant="outline" onClick={() => { handleConfirmWithRelease() }}>
              Release cards for other decks
            </Button>
            <Button onClick={handleConfirm}>Keep cards claimed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
