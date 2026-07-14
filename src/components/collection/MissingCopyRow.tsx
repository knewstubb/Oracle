'use client'

import { X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface MissingCopyRowProps {
  physicalCopyId: number
  cardName: string
  setName?: string
  condition?: string | null
  isFoil?: boolean
}

/**
 * Row treatment for a physical copy marked as Missing.
 * Shows dimmed row with strikethrough name, "Missing" badge, and "Mark as found" button.
 *
 * When the "×" button is clicked, calls DELETE /api/physical-copies/[id]/missing
 * and invalidates the collection query.
 */
export function MissingCopyRow({
  physicalCopyId,
  cardName,
  setName,
  condition,
  isFoil,
}: MissingCopyRowProps) {
  const queryClient = useQueryClient()

  const unmarkMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/physical-copies/${physicalCopyId}/missing`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to un-mark copy')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['decks'] })
    },
  })

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 opacity-50"
      aria-label={`${cardName} — marked as missing`}
    >
      {/* Card name with strikethrough */}
      <span className="flex-1 truncate text-[length:var(--fs-base)] text-[var(--text-tertiary)] line-through">
        {cardName}
      </span>

      {/* Set + condition info */}
      {(setName || condition || isFoil) && (
        <span className="shrink-0 text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">
          {[setName, condition, isFoil ? 'Foil' : null].filter(Boolean).join(' · ')}
        </span>
      )}

      {/* Missing badge */}
      <span
        className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium"
        style={{
          color: 'var(--signal-critical)',
          backgroundColor: 'rgba(228, 75, 74, 0.10)',
        }}
      >
        Missing
      </span>

      {/* Mark as found button */}
      <button
        type="button"
        onClick={() => unmarkMutation.mutate()}
        disabled={unmarkMutation.isPending}
        className="shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50"
        aria-label={`Mark ${cardName} as found`}
        title="Mark as found"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
