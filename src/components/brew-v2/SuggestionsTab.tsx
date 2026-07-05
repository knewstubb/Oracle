'use client'

import { Plus } from 'lucide-react'
import type { DeckCard } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SuggestionsTabProps {
  suggestions: DeckCard[]
  onAddSuggestion: (cardName: string) => void
  onCardHover?: (card: DeckCard | null) => void
}

// ---------------------------------------------------------------------------
// OwnershipDot — 6px circle indicating ownership status (mirrors CardRow)
// ---------------------------------------------------------------------------

function OwnershipDot({ status }: { status: DeckCard['ownership_status'] }) {
  const base = 'h-1.5 w-1.5 rounded-full shrink-0'

  switch (status) {
    case 'original':
      return <span className={`${base} bg-teal-400`} aria-label="Owned" />
    case 'proxy':
      return <span className={`${base} bg-amber-400`} aria-label="Proxy" />
    case 'generic':
      return <span className={`${base} bg-indigo-400`} aria-label="Generic land" />
    case 'not_owned':
      return (
        <span
          className={`${base} bg-transparent border border-[rgba(255,255,255,0.15)]`}
          aria-label="Not owned"
        />
      )
  }
}

// ---------------------------------------------------------------------------
// SuggestionRow — single suggestion entry
// ---------------------------------------------------------------------------

function SuggestionRow({
  card,
  onAdd,
  onHover,
}: {
  card: DeckCard
  onAdd: (cardName: string) => void
  onHover?: (card: DeckCard | null) => void
}) {
  return (
    <div
      className="group flex flex-col gap-0.5 px-2 py-1.5 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.04)]"
      onMouseEnter={() => onHover?.(card)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* Top row: dot, name, pills, + button */}
      <div className="flex items-center gap-2">
        {/* Ownership dot */}
        <OwnershipDot status={card.ownership_status} />

        {/* Card name */}
        <span className="flex-1 truncate text-[11px] text-[#d4d4d0]">
          {card.card_name}
        </span>

        {/* "also:" pills */}
        {card.additional_categories.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[9px] text-muted-foreground">also:</span>
            {card.additional_categories.map((cat) => (
              <span
                key={cat}
                className="rounded-full bg-blue-500/20 text-blue-400 px-1.5 py-px text-[9px] leading-tight"
              >
                {cat}
              </span>
            ))}
          </div>
        )}

        {/* "+" add button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAdd(card.card_name)
          }}
          className="shrink-0 flex items-center justify-center h-5 w-5 rounded-full border border-[rgba(255,255,255,0.15)] text-muted-foreground transition-colors hover:border-blue-400 hover:text-blue-400 hover:bg-blue-500/10"
          aria-label={`Add ${card.card_name} to deck`}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Reason line (oracle_text as placeholder) */}
      <p className="pl-[14px] text-[9px] italic text-muted-foreground leading-tight truncate">
        {card.oracle_text || 'Suggested for this deck'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SuggestionsTab — groups suggestions by primary_category
// ---------------------------------------------------------------------------

export function SuggestionsTab({
  suggestions,
  onAddSuggestion,
  onCardHover,
}: SuggestionsTabProps) {
  // Group by primary_category
  const grouped = suggestions.reduce<Record<string, DeckCard[]>>((acc, card) => {
    const key = card.primary_category
    if (!acc[key]) acc[key] = []
    acc[key].push(card)
    return acc
  }, {})

  const categoryNames = Object.keys(grouped).sort()

  if (suggestions.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-[11px] text-muted-foreground italic">
          No suggestions yet
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      {categoryNames.map((category) => (
        <div key={category}>
          {/* Category group header */}
          <h4 className="px-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {category}
          </h4>

          {/* Suggestion rows */}
          <div className="flex flex-col">
            {grouped[category].map((card) => (
              <SuggestionRow
                key={card.card_name}
                card={card}
                onAdd={onAddSuggestion}
                onHover={onCardHover}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
