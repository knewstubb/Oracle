'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface AllocationFailureBannerProps {
  deckId: number
  errors: string[]
}

/**
 * Warning banner shown on a deck page when the post-import allocation
 * resolver encountered errors. Provides a "Re-run Allocation" action
 * to retry without re-importing the entire deck.
 */
export function AllocationFailureBanner({ deckId, errors }: AllocationFailureBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const queryClient = useQueryClient()

  const rerunMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/allocate`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Allocation failed' }))
        throw new Error(body.error ?? 'Allocation failed')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Allocation re-run complete')
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
      setDismissed(true)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to re-run allocation')
    },
  })

  if (dismissed) return null

  return (
    <div
      className="mx-auto max-w-[1280px] px-6 pt-3"
      aria-live="polite"
      role="alert"
    >
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
        <div className="flex-1 space-y-1">
          <p className="text-[length:var(--fs-md)] font-medium text-foreground">
            Allocation completed with errors
          </p>
          <ul className="space-y-0.5">
            {errors.map((err, i) => (
              <li key={i} className="text-[length:var(--fs-md)] text-muted-foreground">
                {err}
              </li>
            ))}
          </ul>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => rerunMutation.mutate()}
          disabled={rerunMutation.isPending}
          className="shrink-0"
        >
          {rerunMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden="true" />
          )}
          {rerunMutation.isPending ? 'Running...' : 'Re-run Allocation'}
        </Button>
      </div>
    </div>
  )
}
