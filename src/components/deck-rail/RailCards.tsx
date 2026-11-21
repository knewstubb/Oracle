'use client'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, Check, FlaskConical, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cardStatusesQueryOptions } from '@/lib/deck-card-statuses-query'
import { legalityQueryOptions } from '@/lib/deck-legality-query'
import { cardsSectionView, railBuildStatus, type CardsSectionView, type CardsStatus, type StatusCountsInput } from '@/lib/deck-rail-stats'
import { formatPrice } from '@/lib/collection-printing-utils'

interface StatusesResponse {
  counts: StatusCountsInput
}

export interface RailCardsProps {
  deckId: number
  /** Cards in the main deck (Maybeboard and Sideboard left out). */
  totalCards: number
  /** Format's deck size; null when the format has none. */
  deckSize: number | null
  totalValue?: number
}

const STATUS_WORDS: Record<CardsStatus, string> = { playable: 'Playable', assembling: 'Assembling', brewing: 'Brewing' }
const GREEN = 'var(--signal-success)'
const AMBER = 'var(--signal-warning)'

const CHIP = 'h-auto gap-[5px] border-[var(--border-default)] bg-[var(--bg-surface-hover)] py-[5px] pl-[7px] pr-[9px] text-[11px] font-semibold text-[var(--text-primary)] [&>svg]:size-[13px]!'

/** Half-filled circle = Assembling. */
function HalfCircle() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" data-icon="half-ring">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1.75 A6.25 6.25 0 0 0 8 14.25 Z" fill="currentColor" />
    </svg>
  )
}

function StatusIcon({ status }: { status: CardsStatus }) {
  if (status === 'playable') return <Check size={13} aria-hidden="true" className="shrink-0" style={{ color: GREEN }} />
  if (status === 'brewing') return <FlaskConical size={13} aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" />
  return <HalfCircle />
}

/** The Cards section drawn from props only. */
export function RailCardsView({ view, totalValue, details = true }: { view: CardsSectionView; totalValue?: number; details?: boolean }) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[28px] font-medium leading-none" style={view.amber ? { color: AMBER } : undefined} data-testid="rail-count">{view.count}</span>
          <span className="text-[12px] text-[var(--text-secondary)]">{view.countSuffix}</span>
        </span>
        <span className="flex-1" />
        {totalValue != null && totalValue > 0 && (
          <span className="flex flex-col items-end leading-tight">
            <span className="text-[13px] font-medium">{formatPrice(totalValue)}</span>
            <span className="text-[10px] text-[var(--text-secondary)]">Est. value</span>
          </span>
        )}
      </div>
      {details && (
        <>
      <div className="flex flex-wrap gap-1.5" data-testid="rail-chips">
        <Badge variant="outline" className={CHIP} data-testid="rail-status-chip" data-state={view.status}>
          <StatusIcon status={view.status} />
          {STATUS_WORDS[view.status]}
        </Badge>
        <Badge variant="outline" className={CHIP} data-testid="rail-legal-chip" data-state={view.legal ? 'legal' : 'not_legal'}>
          {view.legal ? (
            <Check size={13} aria-hidden="true" className="shrink-0" style={{ color: GREEN }} />
          ) : (
            <AlertTriangle size={13} aria-hidden="true" className="shrink-0" style={{ color: AMBER }} />
          )}
          {view.legal ? 'Legal for Commander' : 'Not legal'}
        </Badge>
      </div>
      {view.problems.length > 0 && (
        <ul className="space-y-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2" data-testid="rail-problems">
          {view.problems.map((p) => (
            <li key={p.key} className="flex items-center gap-2 text-[12px] font-medium">
              <AlertTriangle size={16} aria-hidden="true" className="shrink-0" style={{ color: AMBER }} />
              <span className="min-w-0 flex-1 truncate" title={p.text}>{p.text}</span>
              {p.right && <span className="shrink-0">{p.right}</span>}
            </li>
          ))}
        </ul>
      )}
        </>
      )}
    </>
  )
}

export function RailCards({ deckId, totalCards, deckSize, totalValue }: RailCardsProps) {
  const statuses = useQuery<StatusesResponse>(cardStatusesQueryOptions(deckId))
  const legality = useQuery(legalityQueryOptions(deckId))
  const counts = statuses.data?.counts
  const legalityOk = !!legality.data && typeof legality.data.isLegal === 'boolean'
  const loading = statuses.isLoading || legality.isLoading
  const failed = !loading && (statuses.isError || legality.isError || !counts || !legalityOk)
  const retry = () => {
    void statuses.refetch()
    void legality.refetch()
  }
  const base = cardsSectionView({ total: totalCards, deckSize, sleeved: 0, readiness: 'brewing', issues: [] })
  return (
    <section aria-labelledby="rail-cards-h" className="space-y-3 border-t border-[var(--border-subtle)] p-4" data-testid="rail-cards">
      <h2 id="rail-cards-h" className="sr-only">Cards</h2>
      {(loading || failed) && <RailCardsView view={base} totalValue={totalValue} details={false} />}
      {loading && (
        <p role="status" className="flex items-center gap-1 text-[length:var(--fs-sm)] text-[var(--text-muted)]">
          <Loader2 size={14} aria-hidden="true" className="animate-spin" />
          Checking…
        </p>
      )}
      {failed && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-critical)' }}>
          <AlertCircle size={14} aria-hidden="true" />
          <span>Couldn&apos;t check</span>
          <Button variant="outline" size="sm" className="min-h-11" onClick={retry}>Try again</Button>
        </div>
      )}
      {!loading && !failed && counts && (
        <RailCardsView
          totalValue={totalValue}
          view={cardsSectionView({
            total: totalCards,
            deckSize,
            sleeved: counts.sleeved ?? 0,
            readiness: railBuildStatus(counts, deckSize).state,
            issues: legality.data?.issues ?? [],
          })}
        />
      )}
    </section>
  )
}
