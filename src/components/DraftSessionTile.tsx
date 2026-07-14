'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { InlineDeleteConfirmation } from '@/components/InlineDeleteConfirmation'
import { cn } from '@/lib/utils'

export interface DraftSessionTileProps {
  sessionId: number
  commanderName: string | null
  status: string
  updatedAt: string
  colourIdentity: string[]
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

const STATUS_LABELS: Record<string, string> = {
  investigating: 'Investigating',
  confirming: 'Confirming',
  generating: 'Generating',
  refining: 'Refining',
  exploring: 'Exploring',
  building: 'Building',
}

function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate + 'Z').getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function DraftSessionTile({
  sessionId,
  commanderName,
  status,
  updatedAt,
  colourIdentity,
}: DraftSessionTileProps) {
  const [tileState, setTileState] = useState<TileState>('idle')
  const router = useRouter()
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/brew-sessions/${sessionId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to delete brew session')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })
    },
  })

  const sorted = COLOUR_ORDER.filter((c) => colourIdentity.includes(c))
  const colourLabel = sorted.map((c) => COLOUR_BAR_MAP[c]?.label).filter(Boolean).join(', ')
  const displayName = commanderName || 'New Concept'

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

  function handleResume() {
    router.push(`/new-deck?sessionId=${sessionId}`)
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
        'group relative overflow-hidden rounded-2xl bg-card',
        '[box-shadow:0px_1px_3px_rgba(0,0,0,0.4),0px_4px_8px_3px_rgba(0,0,0,0.2)]',
        'transition-all duration-200 ease-out',
        'hover:-translate-y-1 hover:[box-shadow:0px_4px_8px_3px_rgba(0,0,0,0.4),0px_1px_3px_rgba(0,0,0,0.5)]',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background'
      )}
      style={{ border: '0.5px dashed rgba(55,138,221,0.4)' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={`Draft brew: ${displayName} — ${STATUS_LABELS[status] || status}`}
    >
      {/* Art area — show commander art if available, otherwise sparkle icon */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-[rgba(55,138,221,0.1)] to-[rgba(55,138,221,0.2)]">
        {commanderName ? (
          <img
            src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(commanderName)}&format=image&version=art_crop`}
            alt={commanderName}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="size-10 text-[rgba(55,138,221,0.3)]" aria-hidden="true" />
          </div>
        )}

        {/* Hover state — "Resume" and "Delete" buttons */}
        {tileState === 'hover' && (
          <div
            className="absolute inset-0 flex items-center justify-center gap-3 bg-black/70 transition-opacity duration-200 opacity-100"
            aria-hidden={false}
          >
            <button
              type="button"
              onClick={handleResume}
              className="rounded-lg bg-[rgba(55,138,221,0.2)] px-3 py-1.5 text-[length:var(--fs-sm)] font-medium text-[#378ADD] border border-[rgba(55,138,221,0.4)] hover:bg-[rgba(55,138,221,0.3)] transition-colors"
            >
              Resume brewing
            </button>
            <button
              type="button"
              onClick={handleDeleteClick}
              className="rounded-lg bg-[rgba(226,75,74,0.15)] px-3 py-1.5 text-[length:var(--fs-sm)] font-medium text-[#E24B4A] border border-[rgba(226,75,74,0.3)] hover:bg-[rgba(226,75,74,0.25)] transition-colors"
            >
              Delete
            </button>
          </div>
        )}

        {/* Confirming state — inline delete confirmation */}
        {tileState === 'confirming' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85">
            <InlineDeleteConfirmation
              deckName={displayName}
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
          {commanderName ? `${commanderName} Brew` : 'New Concept'}
        </h3>
        <p className="mt-0.5 truncate text-[length:var(--fs-md)] text-muted-foreground">
          {commanderName ?? (STATUS_LABELS[status] || status)}
        </p>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full bg-[rgba(55,138,221,0.15)] px-2 py-0.5 text-[length:var(--fs-xs)] font-medium text-[#378ADD]">
            Draft
          </span>
          <span className="text-[length:var(--fs-xs)] text-muted-foreground/60">
            {formatRelativeTime(updatedAt)}
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
