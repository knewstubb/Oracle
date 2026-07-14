'use client'

import { GripVertical } from 'lucide-react'
import type { DeckCard } from '@/lib/brew-v2-types'
import { GenericLandBadge } from '@/components/generic-land-badge'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CardRowProps {
  card: DeckCard
  onClick: (cardName: string) => void
  isDragging?: boolean
  dragHandleProps?: {
    draggable: true
    onDragStart: (e: React.DragEvent) => void
    onDragEnd: () => void
  }
}

// ---------------------------------------------------------------------------
// OwnershipDot — 6px circle indicating ownership status
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
// CardRow — single card entry in the deck list
// ---------------------------------------------------------------------------

export function CardRow({ card, onClick, isDragging, dragHandleProps }: CardRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(card.card_name)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(card.card_name)
        }
      }}
      className={`flex w-full items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.04)] ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {/* 1. Grip icon (drag handle) */}
      <span {...(dragHandleProps ?? {})} className="shrink-0 cursor-grab">
        <GripVertical className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      </span>

      {/* 2. Ownership dot */}
      <OwnershipDot status={card.ownership_status} />

      {/* 3. Card name — ellipsis truncation */}
      <span className="flex-1 truncate text-[length:var(--fs-base)] text-[#d4d4d0]">
        {card.card_name}
      </span>

      {/* 3b. Generic land badge — overlay when is_generic_land */}
      {card.is_generic_land && (
        <GenericLandBadge
          landType={card.card_name}
          className="shrink-0"
        />
      )}

      {/* 4. "also:" pills — additional categories */}
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

      {/* 5. CMC — right-aligned */}
      <span className="w-5 text-right text-[length:var(--fs-base)] text-muted-foreground shrink-0">
        {card.cmc}
      </span>
    </div>
  )
}
