'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Upload, CheckCircle2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface PushToArchidektProps {
  deckId: number
  isOracleNative: boolean
}

interface PushResponse {
  success: boolean
  action: 'created' | 'updated'
  error?: string
}

export function PushToArchidekt({ deckId, isOracleNative }: PushToArchidektProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (): Promise<PushResponse> => {
      const res = await fetch(`/api/decks/${deckId}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data: PushResponse = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Push to Archidekt failed')
      }
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
      const message = data.action === 'created'
        ? 'Deck created on Archidekt'
        : 'Archidekt updated with latest changes'
      toast.success(message)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Push to Archidekt failed')
    },
  })

  const buttonText = isOracleNative ? 'Create on Archidekt' : 'Push to Archidekt'

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        aria-label={mutation.isPending ? 'Pushing to Archidekt…' : buttonText}
      >
        {mutation.isPending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : mutation.isSuccess ? (
          <CheckCircle2 className="size-3.5 text-green-500" aria-hidden="true" />
        ) : (
          <Upload className="size-3.5" aria-hidden="true" />
        )}
        <span>{mutation.isPending ? 'Pushing…' : buttonText}</span>
      </Button>

      {mutation.isError && (
        <div className="flex items-center gap-2 text-xs text-destructive" role="alert">
          <span className="truncate">{mutation.error.message}</span>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            aria-label="Retry push to Archidekt"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
