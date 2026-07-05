'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftDeck {
  id: number
  name: string
  commanderName: string
  cardCount: number
  colourIdentity: string[]
}

export interface DraftDeckTileProps {
  deck: DraftDeck
  onContinue: (id: number) => void
  onDelete: (id: number) => void
}

type TileState = 'idle' | 'hover' | 'confirming'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLOUR_BAR_MAP: Record<string, { hex: string; label: string }> = {
  W: { hex: '#F5F0C1', label: 'White' },
  U: { hex: '#6BA5C4', label: 'Blue' },
  B: { hex: '#9E9E9E', label: 'Black' },
  R: { hex: '#D4836A', label: 'Red' },
  G: { hex: '#7BC4A0', label: 'Green' },
}

const COLOUR_ORDER = ['W', 'U', 'B', 'R', 'G']

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DraftDeckTile({ deck, onContinue, onDelete }: DraftDeckTileProps) {
  const [tileState, setTileState] = useState<TileState>('idle')

  const sorted = COLOUR_ORDER.filter((c) => deck.colourIdentity.includes(c))
  const colourLabel = sorted
    .map((c) => COLOUR_BAR_MAP[c]?.label)
    .filter(Boolean)
    .join(', ')

  function handleMouseEnter() {
    if (tileState === 'idle') setTileState('hover')
  }

  function handleMouseLeave() {
    if (tileState === 'hover') setTileState('idle')
  }

  function handleContinue() {
    onContinue(deck.id)
  }

  function handleDeleteClick() {
    setTileState('confirming')
  }

  function handleCancelDelete() {
    setTileState('hover')
  }

  function handleConfirmDelete() {
    onDelete(deck.id)
  }

  return (
    <div
      className={cn(
        'group relative block overflow-hidden rounded-2xl bg-card',
        'border-dashed border border-blue-400/30',
        '[box-shadow:0px_1px_3px_rgba(0,0,0,0.4),0px_4px_8px_3px_rgba(0,0,0,0.2)]',
        'transition-all duration-200 ease-out',
        'hover:-translate-y-1 hover:[box-shadow:0px_4px_8px_3px_rgba(0,0,0,0.4),0px_1px_3px_rgba(0,0,0,0.5)]',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background'
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={`Draft deck: ${deck.name} — ${deck.commanderName}`}
    >
      {/* Content area with hover overlay */}
      <div className="relative px-4 py-4">
        {/* Header: name + badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold text-foreground leading-tight">
              {deck.name}
            </h3>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {deck.commanderName}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-[#378ADD]">
            Draft
          </span>
        </div>

        {/* Card count */}
        <p className="mt-2 text-xs text-muted-foreground/70">
          {deck.cardCount}/100
        </p>

        {/* Colour identity bars */}
        {sorted.length > 0 && (
          <div
            className="mt-3 flex gap-1 overflow-hidden rounded-full"
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

        {/* Hover actions overlay */}
        {tileState === 'hover' && (
          <div className="absolute inset-0 flex items-center justify-center gap-3 rounded-2xl bg-black/80">
            <button
              type="button"
              onClick={handleContinue}
              className="rounded-lg bg-[rgba(55,138,221,0.2)] px-3 py-1.5 text-xs font-medium text-[#378ADD] border border-[rgba(55,138,221,0.4)] hover:bg-[rgba(55,138,221,0.3)] transition-colors"
            >
              Continue brewing
            </button>
            <button
              type="button"
              onClick={handleDeleteClick}
              className="rounded-lg bg-[rgba(226,75,74,0.15)] px-3 py-1.5 text-xs font-medium text-[#E24B4A] border border-[rgba(226,75,74,0.3)] hover:bg-[rgba(226,75,74,0.25)] transition-colors"
            >
              Delete draft
            </button>
          </div>
        )}

        {/* Confirming state — inline delete confirmation */}
        {tileState === 'confirming' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/90">
            <div
              className="flex flex-col items-center justify-center gap-3 p-4 text-center"
              role="alertdialog"
              aria-label={`Confirm deletion of ${deck.name}`}
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  Delete &ldquo;{deck.name}&rdquo;?
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This will permanently remove the draft.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-[rgba(255,255,255,0.1)] text-muted-foreground border border-border',
                    'hover:bg-muted hover:text-foreground'
                  )}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-[rgba(226,75,74,0.15)] text-[#E24B4A] border border-[rgba(226,75,74,0.3)]',
                    'hover:bg-[rgba(226,75,74,0.25)]'
                  )}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
