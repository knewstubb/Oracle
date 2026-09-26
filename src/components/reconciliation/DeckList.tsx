'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConflictCard } from './ConflictCard'
import type {
  ReconciliationDeck,
  ConflictPrintingRow,
  ConflictInstance,
  InstanceState,
} from '@/types/import-reconciliation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeckListProps {
  decks: ReconciliationDeck[]
  rows: ConflictPrintingRow[]
  onInstanceStateChange: (instance: ConflictInstance, state: InstanceState) => void
  onAlternatePrintingChange?: (instance: ConflictInstance, printingId: string | null) => void
  onWishlistChange?: (instance: ConflictInstance, checked: boolean) => void
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Per-deck expandable card
// ---------------------------------------------------------------------------

function DeckCard({
  deck,
  rows,
  onInstanceStateChange,
  onAlternatePrintingChange,
  onWishlistChange,
  disabled,
}: {
  deck: ReconciliationDeck
  rows: ConflictPrintingRow[]
  onInstanceStateChange: (instance: ConflictInstance, state: InstanceState) => void
  onAlternatePrintingChange?: (instance: ConflictInstance, printingId: string | null) => void
  onWishlistChange?: (instance: ConflictInstance, checked: boolean) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(true)
  const hasConflict = deck.conflictPrintingCount > 0

  const deckRows = rows.filter((row) =>
    row.instances.some((i) => i.deckId === deck.deckId)
  )

  const summaryText = `${deckRows.length} conflict printing${deckRows.length === 1 ? '' : 's'}`

  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]',
        open && 'rounded-b-none'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-surface-hover)]"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            'size-[18px] shrink-0 text-[var(--text-secondary)] transition-transform',
            open && 'rotate-90'
          )}
          aria-hidden="true"
        />
        <span className="flex-1 truncate font-medium text-foreground">{deck.deckName}</span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide',
            deck.isActive
              ? 'bg-[rgba(29,158,117,0.15)] text-[var(--signal-success)]'
              : 'bg-[rgba(239,159,39,0.15)] text-[var(--signal-warning)]'
          )}
        >
          {deck.isActive ? 'Active' : 'Brew'}
        </span>
        {hasConflict && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide"
            style={{ background: 'rgba(226,75,74,0.15)', color: 'var(--signal-critical)' }}
          >
            Conflict
          </span>
        )}
        <span className="shrink-0 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
          {summaryText}
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--border-subtle)] px-4 py-3">
          <div className="flex flex-col gap-3">
            {deckRows.map((printing) => (
              <ConflictCard
                key={printing.printingId}
                printing={printing}
                hideDeckTags
                showClaimantDecks
                onInstanceStateChange={onInstanceStateChange}
                onAlternatePrintingChange={onAlternatePrintingChange}
                onWishlistChange={onWishlistChange}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deck list
// ---------------------------------------------------------------------------

export function DeckList({
  decks,
  rows,
  onInstanceStateChange,
  onAlternatePrintingChange,
  onWishlistChange,
  disabled,
}: DeckListProps) {
  if (decks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-default)] px-4 py-12 text-center">
        <p className="text-[length:var(--fs-md)] font-medium text-foreground">
          All imported cards are reconciled.
        </p>
        <p className="text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
          No decks have unresolved conflicts.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {decks.map((deck) => (
        <DeckCard
          key={deck.deckId}
          deck={deck}
          rows={rows}
          onInstanceStateChange={onInstanceStateChange}
          onAlternatePrintingChange={onAlternatePrintingChange}
          onWishlistChange={onWishlistChange}
          disabled={disabled}
        />
      ))}
    </div>
  )
}
