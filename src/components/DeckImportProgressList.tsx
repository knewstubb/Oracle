'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Check, AlertTriangle, ChevronRight, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DeckResolutionResult } from '@/lib/warm-start-resolve'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContentionEntry {
  cardName: string
  keptByDeckId: number
  keptByDeckName: string
  lostByDeckId: number
  lostByDeckName: string
}

type DeckRowState = 'queued' | 'active' | 'done'

interface DeckRowData {
  id: number | string
  name: string
  state: DeckRowState
  result?: DeckResolutionResult
}

export interface DeckImportProgressListProps {
  /** All decks in the batch, in order */
  decks: DeckRowData[]
  /** Contentions — only available after the full batch completes */
  contentions?: ContentionEntry[]
  /** Whether the batch is still running */
  isRunning: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeckImportProgressList({
  decks,
  contentions,
  isRunning,
}: DeckImportProgressListProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {decks.map((deck) => (
        <DeckProgressRow
          key={deck.id}
          deck={deck}
          contentions={contentions}
          isRunning={isRunning}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-Deck Row
// ---------------------------------------------------------------------------

function DeckProgressRow({
  deck,
  contentions,
  isRunning,
}: {
  deck: DeckRowData
  contentions?: ContentionEntry[]
  isRunning: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const { state, result } = deck
  const isComplete = state === 'done' && result && result.unresolved === 0 && result.errors.length === 0
  const hasIssues = state === 'done' && result && (result.unresolved > 0 || result.errors.length > 0)
  const isExpandable = state === 'done' && result && result.unresolvedCards.length > 0

  // Get contentions for this specific deck
  const deckContentions = contentions?.filter(
    (c) => c.lostByDeckId === result?.deckId
  ) ?? []

  return (
    <div>
      <button
        type="button"
        onClick={() => isExpandable && setExpanded(!expanded)}
        disabled={!isExpandable}
        aria-expanded={isExpandable ? expanded : undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors',
          state === 'queued' && 'border-[var(--border-default)] opacity-50',
          state === 'active' && 'border-[var(--border-default)] bg-white/[0.02]',
          state === 'done' && isComplete && 'border-[var(--border-default)]',
          state === 'done' && hasIssues && 'border-[rgba(239,159,39,0.3)]',
          isExpandable && 'cursor-pointer hover:bg-white/[0.03]',
          !isExpandable && 'cursor-default'
        )}
      >
        {/* Status icon */}
        <span className="flex size-5 shrink-0 items-center justify-center">
          {state === 'queued' && (
            <span className="size-2 rounded-full bg-white/20" />
          )}
          {state === 'active' && (
            <Loader2 className="size-4 animate-spin text-[#14b8a6]" aria-label="Importing" />
          )}
          {state === 'done' && isComplete && (
            <Check className="size-4 text-green-400" aria-label="Complete" />
          )}
          {state === 'done' && hasIssues && (
            <AlertTriangle className="size-4 text-amber-400" aria-label="Needs review" />
          )}
        </span>

        {/* Deck name */}
        <span className={cn(
          'flex-1 truncate text-[length:var(--fs-md)]',
          state === 'queued' && 'text-muted-foreground'
        )}>
          {deck.name}
        </span>

        {/* Resolution count */}
        {state === 'done' && result && (
          <span
            className="text-[length:var(--fs-sm)] tabular-nums"
            style={result.unresolved > 0 ? { color: '#ef9f27' } : { color: 'var(--text-secondary)' }}
          >
            {result.matched}/{result.totalCards}
          </span>
        )}

        {/* Picklist link (only when done, has unresolved, and not expandable for errors) */}
        {state === 'done' && result && result.unresolved > 0 && result.errors.length === 0 && (
          <Link
            href={`/decks/${result.deckId}?tab=cards&mode=picklist`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-[length:var(--fs-xs)] text-amber-400 hover:underline"
          >
            review picklist
            <ExternalLink className="size-3" aria-hidden="true" />
          </Link>
        )}

        {/* Error message */}
        {state === 'done' && result && result.errors.length > 0 && (
          <span className="max-w-[200px] truncate text-[length:var(--fs-xs)] text-destructive">
            {result.errors[0]}
          </span>
        )}

        {/* Expand chevron */}
        {isExpandable && (
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-150',
              expanded && 'rotate-90'
            )}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Expanded content: per-deck unresolved cards with attribution */}
      {expanded && isExpandable && result && (
        <div className="ml-8 mt-1 rounded-md border border-[var(--border-default)] bg-white/[0.02] px-4 py-3">
          <div className="flex flex-col gap-1.5 text-[length:var(--fs-sm)]">
            {result.unresolvedCards.map((cardName) => {
              // Find attribution for this card from contentions
              const contention = deckContentions.find((c) => c.cardName === cardName)

              return (
                <div key={cardName} className="flex items-start gap-2">
                  <AlertTriangle
                    className="mt-0.5 size-3 shrink-0 text-amber-400"
                    aria-hidden="true"
                  />
                  <span className="text-foreground">
                    <strong>{cardName}</strong>
                    {contention ? (
                      <span className="text-muted-foreground">
                        {' — kept by '}
                        <span className="text-foreground">{contention.keptByDeckName}</span>
                      </span>
                    ) : isRunning ? (
                      <span className="text-muted-foreground/60 italic">
                        {' — resolving other decks…'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {' — no copy available'}
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
