'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InlineDeleteConfirmation } from '@/components/InlineDeleteConfirmation'
import { canDeleteDeck } from '@/lib/brew-v2-deck-state'
import { cn } from '@/lib/utils'

export interface DraftBannerProps {
  deckId: number
  deckName: string
  cardCount: number
  brewSessionId?: number | null
  status?: string
  onDeleted: () => void
}

type BannerState = 'info' | 'confirming'

export function DraftBanner({
  deckId,
  deckName,
  cardCount,
  brewSessionId,
  status = 'draft',
  onDeleted,
}: DraftBannerProps) {
  const [bannerState, setBannerState] = useState<BannerState>('info')
  const router = useRouter()
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${deckId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to delete deck')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      onDeleted()
    },
  })

  function handleContinueBrewing() {
    if (brewSessionId) {
      router.push(`/new-deck?resume=${brewSessionId}`)
    } else {
      router.push(`/decks/${deckId}`)
    }
  }

  function handleDeleteClick() {
    setBannerState('confirming')
  }

  function handleCancelDelete() {
    setBannerState('info')
  }

  function handleConfirmDelete() {
    deleteMutation.mutate()
  }

  return (
    <div
      className={cn(
        'w-full px-6 py-3',
        'border-b'
      )}
      style={{
        backgroundColor: 'rgba(55,138,221,0.06)',
        borderColor: 'rgba(55,138,221,0.2)',
      }}
      role="status"
      aria-label="Brewing deck banner"
    >
      <div className="mx-auto max-w-[var(--content-max-width)]">
        {bannerState === 'info' && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[length:var(--fs-md)] text-muted-foreground">
              <AlertTriangle
                className="size-4 shrink-0 text-[#378ADD]"
                aria-hidden="true"
              />
              <span>
                Brewing — {cardCount} cards
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleContinueBrewing}
                className="text-[length:var(--fs-sm)]"
                style={{
                  background: 'rgba(55,138,221,0.1)',
                  borderColor: 'rgba(55,138,221,0.3)',
                  color: '#378ADD',
                }}
              >
                Continue brewing →
              </Button>
              {canDeleteDeck(status) && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteClick}
                  className="text-[length:var(--fs-sm)]"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        )}

        {bannerState === 'confirming' && canDeleteDeck(status) && (
          <InlineDeleteConfirmation
            deckName={deckName}
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
            isDeleting={deleteMutation.isPending}
          />
        )}
      </div>
    </div>
  )
}
