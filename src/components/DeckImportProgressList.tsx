'use client'

import { Loader2, Check } from 'lucide-react'
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
  /** Derived overlay: deck participates in an unresolved import conflict. */
  conflicted?: boolean
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
}: {
  deck: DeckRowData
  contentions?: ContentionEntry[]
  isRunning: boolean
}) {
  const { state, result } = deck
  const isComplete = state === 'done' && result && result.unresolved === 0 && result.errors.length === 0
  const hasUnresolved = state === 'done' && result && result.unresolved > 0

  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left',
        deck.conflicted ? 'border-[rgba(239,159,39,0.4)]' : 'border-[var(--border-default)]',
        state === 'queued' && 'opacity-50',
        state === 'active' && 'bg-white/[0.02]'
      )}
    >
      {/* Status icon — completion check sits before the deck name */}
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
      </span>

      {/* Deck name */}
      <span className={cn(
        'flex-1 truncate text-[length:var(--fs-md)]',
        state === 'queued' && 'text-muted-foreground'
      )}>
        {deck.name}
      </span>

      {/* Conflict overlay badge */}
      {deck.conflicted && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-medium"
          style={{ background: 'rgba(239,159,39,0.15)', color: '#ef9f27' }}
        >
          Conflict
        </span>
      )}

      {/* Resolution count — amber when the deck has unresolved (conflicted) cards */}
      {state === 'done' && result && (
        <span
          className="text-[length:var(--fs-sm)] tabular-nums"
          style={hasUnresolved ? { color: '#ef9f27' } : { color: 'var(--text-secondary)' }}
        >
          {result.matched}/{result.totalCards}
        </span>
      )}

      {/* Error message */}
      {state === 'done' && result && result.errors.length > 0 && (
        <span className="max-w-[200px] truncate text-[length:var(--fs-xs)] text-destructive">
          {result.errors[0]}
        </span>
      )}
    </div>
  )
}
