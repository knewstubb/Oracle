'use client'

import type { DeckCard } from '@/lib/brew-v2-types'
import { CurveCardRow, ROW_HEIGHT } from './CurveCardRow'

export const CURVE_COLUMN_WIDTH = 130

interface CurveColumnProps {
  bucketLabel: string
  cards: DeckCard[]
}

export function CurveColumn({ bucketLabel, cards }: CurveColumnProps) {
  return (
    <div
      className="flex flex-col shrink-0"
      style={{ width: CURVE_COLUMN_WIDTH }}
      data-testid={`curve-column-${bucketLabel}`}
    >
      {/* Column container */}
      <div
        className="flex flex-col rounded-lg overflow-visible"
        style={{
          background: 'rgba(25, 25, 35, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Header: bucket label + count */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-[rgba(255,255,255,0.06)]">
          <span className="text-[11px] font-bold text-[rgba(255,255,255,0.8)] tabular-nums">
            {bucketLabel}
          </span>
          <span className="text-[9px] text-[rgba(255,255,255,0.4)] tabular-nums">
            {cards.length}
          </span>
        </div>

        {/* Card rows — stacked bottom-up via flex-direction: column-reverse */}
        <div
          className="flex flex-col-reverse gap-px"
          style={{ minHeight: cards.length > 0 ? cards.length * ROW_HEIGHT : undefined }}
        >
          {cards.map((card) => (
            <CurveCardRow key={card.card_name} card={card} />
          ))}
        </div>
      </div>
    </div>
  )
}
