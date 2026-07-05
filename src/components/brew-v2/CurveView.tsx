'use client'

import type { DeckCard } from '@/lib/brew-v2-types'
import { useCurveBuckets, BUCKET_ORDER } from './useCurveBuckets'
import { CurveColumn } from './CurveColumn'

interface CurveViewProps {
  cards: DeckCard[]
  zoomLevel: number
}

/**
 * CurveView — orchestrator that renders all CMC columns as a horizontal row.
 *
 * Note: zoomLevel is accepted as a prop for interface consistency, but scaling
 * is NOT applied here. CanvasViewport (the parent) already applies
 * `transform: scale(zoomLevel / 100)` to all its children — applying it again
 * here would double-scale the content.
 */
export function CurveView({ cards }: CurveViewProps) {
  const buckets = useCurveBuckets(cards)

  return (
    <div
      className="flex gap-3 p-6 items-end"
      data-testid="curve-view"
    >
      {BUCKET_ORDER.map((label) => (
        <CurveColumn key={label} bucketLabel={label} cards={buckets[label]} />
      ))}
    </div>
  )
}
