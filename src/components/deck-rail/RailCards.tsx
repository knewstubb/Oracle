'use client'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cardStatusesQueryOptions } from '@/lib/deck-card-statuses-query'
import { cardCountView } from '@/lib/deck-rail-stats'
import { formatPrice } from '@/lib/collection-printing-utils'
import { FOCUS_RING } from '@/components/deck-strategy/focus'
import { hatchBackground } from '@/components/CopySwatch'
import { RailSection } from './RailSection'
interface StatusCounts {
  generic_unsleeved?: number
  unsleevedGenericNames?: string[]
}
export interface RailCardsProps {
  deckId: number
  /** Cards in the main deck (Maybeboard and Sideboard left out). */
  totalCards: number
  /** Format's deck size; null when the format has none. */
  deckSize: number | null
  hasCompanion?: boolean
  totalValue?: number
}
export function RailCards({ deckId, totalCards, deckSize, hasCompanion, totalValue }: RailCardsProps) {
  const { label, over } = cardCountView(totalCards, deckSize)
  const { data, isLoading, isError, refetch } = useQuery<{ counts: StatusCounts }>(cardStatusesQueryOptions(deckId))
  const counts = data?.counts
  const shortNames = counts?.unsleevedGenericNames ?? []
  const fill = deckSize ? Math.min(100, (Math.min(totalCards, deckSize) / Math.max(totalCards, deckSize)) * 100) : 100
  return (
    <RailSection id="rail-cards-h" title="Cards">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[length:var(--fs-xl)] font-semibold" data-testid="rail-count">{label}</span>
        {hasCompanion && <span className="text-[length:var(--fs-sm)] text-[var(--text-muted)]">+ Companion</span>}
        {over > 0 && (
          <span className="inline-flex items-center gap-1 text-[length:var(--fs-sm)] font-medium" style={{ color: 'var(--warn-amber)' }}>
            <AlertTriangle size={14} aria-hidden="true" />
            {over} over
          </span>
        )}
      </div>
      {deckSize != null && (
        <div className="flex h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]" aria-hidden="true">
          <div className="h-full" style={{ width: `${fill}%`, background: 'var(--swatch-original)' }} />
          {over > 0 && (
            <div
              className="h-full flex-1"
              style={{ background: hatchBackground('var(--warn-amber)') }}
            />
          )}
        </div>
      )}
      {isLoading && (
        <p role="status" className="flex items-center gap-1 text-[length:var(--fs-sm)] text-[var(--text-muted)]">
          <Loader2 size={14} aria-hidden="true" className="animate-spin" />
          Checking…
        </p>
      )}
      {isError && !isLoading && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-critical)' }}>
          <AlertCircle size={14} aria-hidden="true" />
          <span>Couldn&apos;t check</span>
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => void refetch()}>Try again</Button>
        </div>
      )}
      {counts && !isError && shortNames.length > 0 && (
        <p className="flex items-start gap-1 text-[length:var(--fs-sm)] font-medium" style={{ color: 'var(--warn-amber)' }}>
          <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>Basics short: {shortNames.join(', ')}</span>
        </p>
      )}
      {totalValue != null && totalValue > 0 && (
        <p className={`text-[length:var(--fs-sm)] ${FOCUS_RING}`}>
          <span className="text-[var(--text-muted)]">Estimated value </span>
          <span className="font-medium">{formatPrice(totalValue)}</span>
        </p>
      )}
    </RailSection>
  )
}
