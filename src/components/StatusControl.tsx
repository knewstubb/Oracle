'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { DeckStatus, StatusUpdateResponse } from '@/lib/deck-status'
import { VALID_STATUSES } from '@/lib/deck-status'
import { validateDeckCount } from '@/lib/format-config'
import { deckKeys } from '@/hooks/useDeckQueryKeys'

export interface StatusControlProps {
  deckId: number
  currentStatus: DeckStatus
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
    label: 'Active',
    color: 'var(--accent-primary)',
    bg: 'var(--accent-primary-bg)',
    activeRing: 'ring-[var(--accent-primary)]/40',
  },
}

export function StatusControl({ deckId, currentStatus, cardCount, format }: StatusControlProps) {
  const [optimisticStatus, setOptimisticStatus] = useState<DeckStatus>(currentStatus)
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
      queryClient.invalidateQueries({ queryKey: deckKeys.all })
      queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) })
      queryClient.invalidateQueries({ queryKey: deckKeys.allocation(deckId) })
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

    // All transitions: no precondition
    setOptimisticStatus(newStatus)
    statusMutation.mutate(newStatus)
  }

  return (
    <div
      className="inline-flex flex-wrap items-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] p-0.5"
      role="radiogroup"
      aria-label="Deck status"
    >
      {VALID_STATUSES.map((status) => {
        const config = STATUS_CONFIG[status]
        const isSelected = optimisticStatus === status

        // Gate: Brewing → In Rotation requires valid card count
        const countValidation = validateDeckCount(cardCount ?? 0, format)
        const isGated = status === 'in_rotation' && optimisticStatus === 'brewing' && !countValidation.valid
        const isDisabled = statusMutation.isPending || isGated
        const gateReason = isGated ? countValidation.reason : null

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
  )
}
