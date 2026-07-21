'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CardImage } from '@/components/CardImage'
import { Button } from '@/components/ui/button'
import { InlineDeleteConfirmation } from '@/components/InlineDeleteConfirmation'
import { canDeleteDeck } from '@/lib/brew-v2-deck-state'
import { cn } from '@/lib/utils'

export interface DraftDeckTileProps {
  id: number
  name: string
  commanderName: string
  commanderScryfallId: string
  colourIdentity: string[]
  cardCount?: number
  brewSessionId?: number | null
  status?: string
}

type TileState = 'idle' | 'hover' | 'confirming'

const COLOUR_BAR_MAP: Record<string, { hex: string; label: string }> = {
  W: { hex: '#F5F0C1', label: 'White' },
  U: { hex: '#6BA5C4', label: 'Blue' },
  B: { hex: '#9E9E9E', label: 'Black' },
  R: { hex: '#D4836A', label: 'Red' },
  G: { hex: '#7BC4A0', label: 'Green' },
}

const COLOUR_ORDER = ['W', 'U', 'B', 'R', 'G']

export function DraftDeckTile({
  id,
  name,
  commanderName,
  commanderScryfallId,
  colourIdentity,
  cardCount,
  brewSessionId,
  status = 'draft',
}: DraftDeckTileProps) {
  const [tileState, setTileState] = useState<TileState>('idle')
  const router = useRouter()
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to delete deck')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })
    },
  })

  const sorted = COLOUR_ORDER.filter((c) => colourIdentity.includes(c))
  const colourLabel = sorted.map((c) => COLOUR_BAR_MAP[c]?.label).filter(Boolean).join(', ')

  function handleMouseEnter() {
    if (tileState === 'idle') {
      setTileState('hover')
    }
  }

  function handleMouseLeave() {
    if (tileState === 'hover') {
      setTileState('idle')
    }
  }

  function handleContinueBrewing() {
    if (brewSessionId) {
      router.push(`/new-deck?resume=${brewSessionId}`)
    } else {
      router.push(`/decks/${id}`)
    }
  }

  function handleDeleteClick() {
    setTileState('confirming')
  }

  function handleCancelDelete() {
    setTileState('hover')
  }

  function handleConfirmDelete() {
    deleteMutation.mutate()
  }

  return (
    <div
      className={cn(
        'group relative block overflow-hidden rounded-2xl bg-card',
        '[box-shadow:0px_1px_3px_rgba(0,0,0,0.4),0px_4px_8px_3px_rgba(0,0,0,0.2)]',
        'transition-all duration-200 ease-out',
        'hover:-translate-y-1 hover:[box-shadow:0px_4px_8px_3px_rgba(0,0,0,0.4),0px_1px_3px_rgba(0,0,0,0.5)]',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background'
      )}
      style={{ border: '0.5px dashed rgba(55,138,221,0.3)' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={`Brewing: ${name} — ${commanderName}`}
    >
      {/* Commander art — with hover overlay */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <CardImage
          scryfallId={commanderScryfallId}
          alt={`${commanderName} card art`}
          width={400}
          height={300}
          artCrop
          noPreview
          className="h-full w-full object-cover opacity-50 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />

        {/* Hover state — "Continue brewing" and "Delete draft" buttons */}
        {tileState === 'hover' && (
          <div
            className="absolute inset-0 flex items-center justify-center gap-3 bg-black/70 transition-opacity duration-200 opacity-100"
            aria-hidden={false}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={handleContinueBrewing}
              className="text-[length:var(--fs-sm)]"
              style={{
                background: 'rgba(55,138,221,0.2)',
                borderColor: 'rgba(55,138,221,0.4)',
                color: '#378ADD',
              }}
            >
              Continue brewing
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
        )}

        {/* Confirming state — inline delete confirmation */}
        {tileState === 'confirming' && canDeleteDeck(status) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85">
            <InlineDeleteConfirmation
              deckName={name}
              onConfirm={handleConfirmDelete}
              onCancel={handleCancelDelete}
              isDeleting={deleteMutation.isPending}
            />
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="px-4 pb-3 pt-3">
        <h3 className="truncate text-[length:var(--fs-lg)] font-medium text-foreground leading-tight">
          {name}
        </h3>
        <p className="mt-0.5 truncate text-[length:var(--fs-md)] text-muted-foreground">
          {commanderName}
        </p>

        <div className="mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[rgba(55,138,221,0.15)] px-2 py-0.5 text-[length:var(--fs-xs)] font-medium text-[#378ADD]">
            Brewing
          </span>
        </div>
      </div>

      {/* Colour identity bars */}
      {sorted.length > 0 && (
        <div
          className="mx-3 mb-3 flex gap-1 overflow-hidden rounded-full"
          role="img"
          aria-label={colourLabel || 'Colourless'}
        >
          {sorted.map((c) => {
            const colour = COLOUR_BAR_MAP[c]
            if (!colour) return null
            return (
              <div
                key={c}
                className="h-1.5 flex-1 first:rounded-l-full last:rounded-r-full"
                style={{ backgroundColor: colour.hex }}
                aria-hidden="true"
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
