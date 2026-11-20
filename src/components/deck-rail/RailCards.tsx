'use client'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cardStatusesQueryOptions } from '@/lib/deck-card-statuses-query'
import {
  cardCountView,
  cardLegend,
  LEGEND_GROUP_LABELS,
  outsideTheHundred,
  toBuyView,
  type LegendGroup,
  type StatusCountsInput,
} from '@/lib/deck-rail-stats'
import { formatPrice } from '@/lib/collection-printing-utils'
import { CopySwatch, swatchStyle } from '@/components/CopySwatch'
import { RailSection } from './RailSection'
import { RailLegality } from './RailLegality'
import { RailBuildStatus } from './RailBuildStatus'
import { RailOutside } from './RailOutside'

interface StatusesResponse {
  cards?: Array<{ cardName: string; allocationStatus?: string | null }>
  counts: StatusCountsInput & { unsleevedGenericNames?: string[] }
}

export interface RailAllCard {
  card_name: string
  quantity?: number
  categories?: string | null
  command_zone_role?: string | null
  has_copy?: boolean
  type_line?: string | null
  price_usd?: number | null
}

export interface RailCardsProps {
  deckId: number
  /** Cards in the main deck (Maybeboard and Sideboard left out). */
  totalCards: number
  /** Format's deck size; null when the format has none. */
  deckSize: number | null
  /** Every row of the deck, including Maybeboard and the companion, for "Outside the 100" and the buy line. */
  allCards?: RailAllCard[]
  totalValue?: number
}

const GROUPS: LegendGroup[] = ['sleeved', 'notSleeved', 'empty']

export function RailCards({ deckId, totalCards, deckSize, allCards = [], totalValue }: RailCardsProps) {
  const { label, over } = cardCountView(totalCards, deckSize)
  const { data, isLoading, isError, refetch } = useQuery<StatusesResponse>(cardStatusesQueryOptions(deckId))
  const counts = data?.counts
  const shortNames = counts?.unsleevedGenericNames ?? []
  const legend = counts ? cardLegend(counts, deckSize) : []
  const unownedNames = (data?.cards ?? []).filter((c) => c.allocationStatus === 'unowned').map((c) => c.cardName)
  const buy = counts && (counts.unowned ?? 0) > 0 ? toBuyView(unownedNames, allCards) : null
  const buyCount = counts?.unowned ?? 0
  const outside = outsideTheHundred(allCards)
  return (
    <RailSection id="rail-cards-h" title="Cards">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span>
          <span className="text-[length:var(--fs-xl)] font-semibold" data-testid="rail-count">{label}</span>{' '}
          <span className="text-[length:var(--fs-sm)] text-[var(--text-muted)]">Planned</span>
        </span>
        {totalValue != null && totalValue > 0 && (
          <span className="text-[length:var(--fs-sm)]">
            <span className="text-[var(--text-muted)]">Est. value </span>
            <span className="font-medium">{formatPrice(totalValue)}</span>
          </span>
        )}
      </div>
      {over > 0 && (
        <p className="flex items-center gap-1 text-[length:var(--fs-sm)] font-medium" style={{ color: 'var(--warn-amber)' }}>
          <AlertTriangle size={14} aria-hidden="true" />
          {over} over
        </p>
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
      {counts && !isError && legend.length > 0 && (
        <>
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" data-testid="rail-bar" aria-hidden="true">
            {legend.map((i) => (
              <span key={i.key} data-segment={i.key} className="h-full min-w-[3px]" style={{ ...swatchStyle(i.kind), flexGrow: i.count, flexBasis: 0, border: 'none', borderRadius: 0, opacity: i.key === 'basics_unsleeved' ? 0.5 : 1 }} />
            ))}
          </div>
          <div className="space-y-1" data-testid="rail-legend">
            {GROUPS.map((g) => {
              const items = legend.filter((i) => i.group === g)
              if (items.length === 0) return null
              return (
                <div key={g} data-legend-group={g} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[length:var(--fs-sm)]">
                  <span className="w-[72px] shrink-0 text-[length:var(--fs-xs)] text-[var(--text-muted)]">{LEGEND_GROUP_LABELS[g]}</span>
                  {items.map((i) => (
                    <span key={i.key} className="inline-flex items-center gap-1.5">
                      <CopySwatch kind={i.kind} className={i.key === 'basics_unsleeved' ? 'size-3 opacity-50' : 'size-3'} />
                      <span className="font-medium">{i.count}</span>
                      <span className="text-[var(--text-muted)]">{i.label}</span>
                    </span>
                  ))}
                </div>
              )
            })}
          </div>
        </>
      )}
      {counts && !isError && shortNames.length > 0 && (
        <p className="flex items-start gap-1 text-[length:var(--fs-sm)] font-medium" style={{ color: 'var(--warn-amber)' }}>
          <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>Basics short: {shortNames.join(', ')}</span>
        </p>
      )}
      {counts && !isError && buyCount > 0 && (
        <p className="text-[length:var(--fs-sm)]" data-testid="rail-to-buy">
          <span className="text-[var(--text-muted)]">To buy: </span>
          <span className="font-medium">{buyCount} unowned {buyCount === 1 ? 'card' : 'cards'}</span>
          {buy?.price != null && <span className="text-[var(--text-muted)]"> · {formatPrice(buy.price)}{buy.partial ? ' (some unpriced)' : ''}</span>}
        </p>
      )}
      <RailOutside outside={outside} />
      <div className="space-y-2 border-t border-white/[0.08] pt-3" data-testid="rail-ladder">
        <RailLegality deckId={deckId} totalCards={totalCards} deckSize={deckSize} />
        <RailBuildStatus deckId={deckId} totalCards={totalCards} deckSize={deckSize} />
      </div>
    </RailSection>
  )
}
