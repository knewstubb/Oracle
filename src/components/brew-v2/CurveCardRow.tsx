'use client'

import type { DeckCard } from '@/lib/brew-v2-types'
import { categoryInitial, categorySecondaryColour } from '@/lib/categoryColour'

export const ROW_HEIGHT = 22

/** Ownership status → dot colour (consistent with PiledColumn/CanvasDeckCard) */
const OWNERSHIP_DOT_COLOURS: Record<DeckCard['ownership_status'], string> = {
  original: '#2dd4bf',
  proxy: '#f97316',
  not_owned: '#6b7280',
  generic: '#818cf8',
}

interface CurveCardRowProps {
  card: DeckCard
}

export function CurveCardRow({ card }: CurveCardRowProps) {
  const dotColour = OWNERSHIP_DOT_COLOURS[card.ownership_status]
  const secondaryCategories = card.additional_categories

  return (
    <div
      className="flex items-center gap-1.5 px-1.5"
      style={{ height: ROW_HEIGHT, background: 'rgba(255, 255, 255, 0.03)' }}
      data-testid={`curve-row-${card.card_name}`}
    >
      {/* Ownership dot */}
      <span
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: dotColour }}
        aria-label={`Ownership: ${card.ownership_status}`}
      />

      {/* Card name — truncated */}
      <span className="text-[9px] text-[rgba(255,255,255,0.85)] truncate flex-1 leading-tight">
        {card.card_name}
      </span>

      {/* Secondary category dots */}
      {secondaryCategories.length > 0 && (
        <span
          className="flex items-center gap-0.5 shrink-0"
          title={secondaryCategories.join(', ')}
        >
          {secondaryCategories.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center justify-center w-2 h-2 rounded-full text-[5px] font-bold text-white leading-none"
              style={{ backgroundColor: categorySecondaryColour(cat) }}
              aria-label={`Secondary: ${cat}`}
            >
              {categoryInitial(cat)}
            </span>
          ))}
        </span>
      )}

      {/* CMC — right-aligned */}
      <span className="text-[8px] text-[rgba(255,255,255,0.4)] shrink-0 tabular-nums w-3 text-right">
        {card.cmc}
      </span>
    </div>
  )
}
