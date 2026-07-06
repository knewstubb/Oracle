'use client'

import { AlertTriangle } from 'lucide-react'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import {
  getTooltipContent,
  isOverallocated,
  type DeckReference,
} from '@/lib/collection-printing-utils'

/* ─── Types ─────────────────────────────────────────────────────────── */

interface UsedByCellProps {
  usedByCount: number
  quantity: number
  decks: DeckReference[]
}

/* ─── UsedByCell ────────────────────────────────────────────────────── */

export function UsedByCell({ usedByCount, quantity, decks }: UsedByCellProps) {
  const overallocated = isOverallocated(quantity, usedByCount)

  // Format: used/owned (e.g. "1/3", "2/1" for overallocated)
  const displayText = `${usedByCount}/${quantity}`

  // If usedByCount is 0, display "0/qty" with no tooltip
  if (usedByCount === 0) {
    return (
      <span
        className="text-xs tabular-nums"
        style={{ color: 'rgba(255,255,255,0.35)' }}
      >
        {displayText}
      </span>
    )
  }

  const { visibleDecks, remainingCount } = getTooltipContent(decks)

  return (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger
          render={<span className="inline-flex items-center gap-1 text-xs tabular-nums cursor-default" />}
          style={{
            color: overallocated ? '#EF9F27' : 'rgba(255,255,255,0.5)',
          }}
        >
          {overallocated && (
            <AlertTriangle
              className="size-3 shrink-0"
              aria-label="Overallocated"
            />
          )}
          {displayText}
        </TooltipTrigger>
        <TooltipContent side="top" align="center">
          <div className="flex flex-col gap-0.5 py-0.5">
            {visibleDecks.map((deckName) => (
              <span key={deckName} className="text-xs">
                {deckName}
              </span>
            ))}
            {remainingCount > 0 && (
              <span
                className="text-xs italic"
                style={{ opacity: 0.7 }}
              >
                +{remainingCount} more
              </span>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
