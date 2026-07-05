'use client'

import { useState } from 'react'
import { InlineDeleteConfirmation } from '@/components/InlineDeleteConfirmation'
import { cn } from '@/lib/utils'
import type { DecisionLog } from '@/lib/brew-v2-types'

export interface ConceptTileProps {
  concept: { id: number; decisionLog: DecisionLog; createdAt: string }
  onContinue: (id: number) => void
  onDelete: (id: number) => void
}

type TileState = 'idle' | 'hover' | 'confirming'

/**
 * Extracts 2-3 strategy decisions from the decision log as a preview.
 */
function getPreviewDecisions(log: DecisionLog): { key: string; value: string }[] {
  const all = [
    ...log.strategy.map((e) => ({ key: e.key, value: e.value })),
    ...log.parameters.map((e) => ({ key: e.key, value: e.value })),
    ...log.constraints.map((e) => ({ key: e.key, value: e.value })),
  ]
  return all.slice(0, 3)
}

export function ConceptTile({ concept, onContinue, onDelete }: ConceptTileProps) {
  const [tileState, setTileState] = useState<TileState>('idle')

  const preview = getPreviewDecisions(concept.decisionLog)
  const createdDate = new Date(concept.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })

  function handleMouseEnter() {
    if (tileState === 'idle') setTileState('hover')
  }

  function handleMouseLeave() {
    if (tileState === 'hover') setTileState('idle')
  }

  function handleContinueExploring() {
    onContinue(concept.id)
  }

  function handleDeleteClick() {
    setTileState('confirming')
  }

  function handleCancelDelete() {
    setTileState('hover')
  }

  function handleConfirmDelete() {
    onDelete(concept.id)
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
      style={{ border: '1px dashed rgba(255,255,255,0.2)' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={`Concept session created ${createdDate}`}
    >
      {/* Concept illustration area — placeholder with hover overlay */}
      <div className="relative aspect-[4/3] overflow-hidden bg-[rgba(255,255,255,0.03)]">
        {/* Decision preview content */}
        <div className="flex h-full flex-col justify-center gap-2 px-4 py-3">
          {preview.length > 0 ? (
            preview.map((entry, i) => (
              <div
                key={i}
                className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5"
              >
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                  {entry.key}
                </span>
                <p className="mt-0.5 truncate text-[11px] text-[#d4d4d0]">
                  {entry.value}
                </p>
              </div>
            ))
          ) : (
            <p className="text-center text-xs text-muted-foreground italic">
              No decisions yet
            </p>
          )}
        </div>

        {/* Hover state — "Continue exploring" and "Delete concept" buttons */}
        {tileState === 'hover' && (
          <div
            className="absolute inset-0 flex items-center justify-center gap-3 bg-black/70 transition-opacity duration-200 opacity-100"
            aria-hidden={false}
          >
            <button
              type="button"
              onClick={handleContinueExploring}
              className="rounded-lg bg-[rgba(55,138,221,0.2)] px-3 py-1.5 text-xs font-medium text-[#378ADD] border border-[rgba(55,138,221,0.4)] hover:bg-[rgba(55,138,221,0.3)] transition-colors"
            >
              Continue exploring
            </button>
            <button
              type="button"
              onClick={handleDeleteClick}
              className="rounded-lg bg-[rgba(226,75,74,0.15)] px-3 py-1.5 text-xs font-medium text-[#E24B4A] border border-[rgba(226,75,74,0.3)] hover:bg-[rgba(226,75,74,0.25)] transition-colors"
            >
              Delete concept
            </button>
          </div>
        )}

        {/* Confirming state — inline delete confirmation */}
        {tileState === 'confirming' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85">
            <InlineDeleteConfirmation
              deckName="this concept"
              onConfirm={handleConfirmDelete}
              onCancel={handleCancelDelete}
              isDeleting={false}
            />
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="px-4 pb-3 pt-3">
        <h3 className="truncate text-base font-bold text-foreground leading-tight">
          Exploration session
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {createdDate}
        </p>

        {/* Concept badge */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[rgba(255,255,255,0.08)] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Concept
          </span>
        </div>
      </div>
    </div>
  )
}
