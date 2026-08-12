'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { deckKeys } from '@/hooks/useDeckQueryKeys'

export interface ActiveToggleProps {
  deckId: number
  isActive: boolean
}

/**
 * Simple toggle for deck Active status.
 * Active decks appear at the top of the decks page.
 */
export function ActiveToggle({ deckId, isActive }: ActiveToggleProps) {
  const [optimisticActive, setOptimisticActive] = useState(isActive)
  const queryClient = useQueryClient()

  const toggleMutation = useMutation({
    mutationFn: async (newActive: boolean) => {
      const res = await fetch(`/api/decks/${deckId}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newActive }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update active status')
      }
      return data as { deck: { id: number; name: string; is_active: boolean } }
    },
    onMutate: async (newActive) => {
      // Optimistic update
      setOptimisticActive(newActive)
    },
    onSuccess: (data) => {
      setOptimisticActive(data.deck.is_active)
      // Invalidate deck queries so lists re-sort
      queryClient.invalidateQueries({ queryKey: deckKeys.all })
      queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) })
      toast.success(data.deck.is_active ? 'Deck marked as Active' : 'Deck marked as Inactive')
    },
    onError: (err: Error) => {
      // Revert optimistic update
      setOptimisticActive(isActive)
      toast.error(err.message || 'Failed to update active status')
    },
  })

  function handleToggle() {
    toggleMutation.mutate(!optimisticActive)
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={toggleMutation.isPending}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[length:var(--fs-md)] font-medium transition-all',
        'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        optimisticActive
          ? 'border-[var(--accent-primary)]/30 bg-[var(--accent-primary-bg)] text-[var(--accent-primary)] ring-[var(--accent-primary)]/40'
          : 'border-[var(--border-default)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
        toggleMutation.isPending && 'cursor-wait opacity-70'
      )}
      aria-pressed={optimisticActive}
      aria-label={optimisticActive ? 'Mark deck as inactive' : 'Mark deck as active'}
    >
      {toggleMutation.isPending && (
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      )}
      {optimisticActive ? 'Active' : 'Inactive'}
    </button>
  )
}
