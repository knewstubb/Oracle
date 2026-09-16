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

  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 rounded-md border border-[var(--border-default)] px-4 py-3 text-left',
        state === 'queued' && 'opacity-50',
        state === 'active' && 'bg-white/[0.02]'
      )}
    >
      {/* Status icon (queued/active only — completion is shown by the count check) */}
      <span className="flex size-5 shrink-0 items-center justify-center">
        {state === 'queued' && (
          <span className="size-2 rounded-full bg-white/20" />
        )}
        {state === 'active' && (
          <Loader2 className="size-4 animate-spin text-[#14b8a6]" aria-label="Importing" />
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
          style={{ color: 'var(--text-secondary)' }}
        >
          {result.matched}/{result.totalCards}
        </span>
      )}

      {/* Completion check — sits next to the count */}
      {state === 'done' && isComplete && (
        <Check className="size-4 shrink-0 text-green-400" aria-label="Complete" />
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
