'use client'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cardStatusesQueryOptions } from '@/lib/deck-card-statuses-query'
import { cardCountView } from '@/lib/deck-rail-stats'
import { formatPrice } from '@/lib/collection-printing-utils'
import { FOCUS_RING } from '@/components/deck-strategy/focus'
import { hatchBackground } from '@/components/CopySwatch'

interface StatusCounts {
  original: number
  proxy: number
  available: number
  claimed: number
  unowned: number
  generic_land?: number
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
  const genericUnsleeved = counts?.generic_unsleeved ?? 0
  const genericSleeved = (counts?.generic_land ?? 0) - genericUnsleeved
  const generic = genericSleeved + genericUnsleeved
  const inDeck = counts ? counts.original + counts.proxy + genericSleeved : 0
  const shortNames = counts?.unsleevedGenericNames ?? []
  const fill = deckSize ? Math.min(100, (Math.min(totalCards, deckSize) / Math.max(totalCards, deckSize)) * 100) : 100

  const rows: Array<[string, number]> = counts
    ? [
        ['Original', counts.original],
        ['Proxy', counts.proxy],
        ['In other decks', counts.claimed],
        ['Unowned', counts.unowned],
        ['Available', counts.available],
        ...(generic > 0 ? ([['Generic', generic]] as Array<[string, number]>) : []),
      ]
    : []

  return (
    <section aria-labelledby="rail-cards-h" className="space-y-2">
      <h2 id="rail-cards-h" className="text-[length:var(--fs-sm)] font-semibold text-muted-foreground">Cards</h2>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[length:var(--fs-xl)] font-semibold" data-testid="rail-count">{label}</span>
        {hasCompanion && <span className="text-[length:var(--fs-sm)] text-muted-foreground">+ Companion</span>}
        {over > 0 && (
          <span className="inline-flex items-center gap-1 text-[length:var(--fs-sm)] font-medium" style={{ color: 'var(--signal-warning)' }}>
            <AlertTriangle size={14} aria-hidden="true" />
            {over} over
          </span>
        )}
      </div>
      {deckSize != null && (
        <div className="flex h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]" aria-hidden="true">
          <div className="h-full" style={{ width: `${fill}%`, background: 'var(--signal-success)' }} />
          {over > 0 && (
            <div
              className="h-full flex-1"
              style={{ background: hatchBackground('var(--signal-warning)') }}
            />
          )}
        </div>
      )}
      {isLoading && <p role="status" className="text-[length:var(--fs-sm)] text-muted-foreground">Checking…</p>}
      {isError && !isLoading && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-critical)' }}>
          <span>Couldn&apos;t check</span>
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => void refetch()}>Try again</Button>
        </div>
      )}
      {counts && !isError && (
        <>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[length:var(--fs-sm)]">
            {rows.map(([name, n]) => (
              <div key={name} className="contents">
                <dt className="text-muted-foreground">{name}</dt>
                <dd className="text-right tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[length:var(--fs-sm)] text-muted-foreground">{inDeck} in deck</p>
          {shortNames.length > 0 && (
            <p className="text-[length:var(--fs-sm)] font-medium" style={{ color: 'var(--state-assembling)' }}>
              ◇ Short: {shortNames.join(', ')} generics planned
            </p>
          )}
        </>
      )}
      {totalValue != null && totalValue > 0 && (
        <p className={`text-[length:var(--fs-sm)] ${FOCUS_RING}`}>
          <span className="text-muted-foreground">Estimated value </span>
          <span className="font-medium">{formatPrice(totalValue)}</span>
        </p>
      )}
    </section>
  )
}
