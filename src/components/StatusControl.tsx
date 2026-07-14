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

export interface StatusControlProps {
  deckId: number
  currentStatus: DeckStatus
  /** Current allocate state — needed to decide if archive confirmation is required */
  allocate?: boolean
}

const STATUS_CONFIG: Record<DeckStatus, { label: string; color: string; bg: string; activeRing: string }> = {
  brew: {
    label: 'Brew',
    color: 'var(--accent-primary)',
    bg: 'var(--accent-primary-bg)',
    activeRing: 'ring-[var(--accent-primary)]/40',
  },
  boxed: {
    label: 'Boxed',
    color: 'var(--accent-primary)',
    bg: 'var(--accent-primary-bg)',
    activeRing: 'ring-[var(--accent-primary)]/40',
  },
  archived: {
    label: 'Archived',
    color: 'var(--text-secondary)',
    bg: 'var(--bg-card)',
    activeRing: 'ring-[var(--text-secondary)]/20',
  },
}

export function StatusControl({ deckId, currentStatus, allocate }: StatusControlProps) {
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

    // Show confirmation for archived transition when allocate is currently on
    // (archiving forces allocate off — same risk as manually toggling allocate off)
    if (newStatus === 'archived' && allocate) {
      setPendingStatus(newStatus)
      setConfirmOpen(true)
      return
    }

    // Optimistic update + mutate
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

  function handleCancel() {
    setConfirmOpen(false)
    setPendingStatus(null)
  }

  return (
    <>
      <div
        className="inline-flex items-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] p-0.5"
        role="radiogroup"
        aria-label="Deck status"
      >
        {VALID_STATUSES.map((status) => {
          const config = STATUS_CONFIG[status]
          const isSelected = optimisticStatus === status

          return (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`Set status to ${config.label}`}
              disabled={statusMutation.isPending}
              onClick={() => handleStatusChange(status)}
              className={cn(
                'relative rounded-md px-3 py-1.5 text-[length:var(--fs-md)] font-medium transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent',
                isSelected
                  ? `ring-1 ${config.activeRing}`
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                statusMutation.isPending && 'cursor-not-allowed opacity-60'
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

      {/* Confirmation dialog — same as allocate-off toggle, triggered on archive when allocate is on */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) handleCancel() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive this deck?</DialogTitle>
            <DialogDescription>
              Archiving will turn off allocation for this deck. These cards will no longer be
              reserved against your collection — they may show as available to other decks even
              though they&apos;re still physically in this deck.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={handleCancel}>Cancel</Button>
            <Button onClick={handleConfirm}>Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
