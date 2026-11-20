'use client'
import { useQuery } from '@tanstack/react-query'
import { CircleCheck } from 'lucide-react'
import { cardStatusesQueryOptions } from '@/lib/deck-card-statuses-query'
import { legalityQueryOptions } from '@/lib/deck-legality-query'
import { legalityView, railBuildStatus, showsPlayableNeedsLegal, type BuildStatusView, type StatusCountsInput } from '@/lib/deck-rail-stats'

const WORDS: Record<BuildStatusView['state'], string> = { brewing: 'Brewing', assembling: 'Assembling', playable: 'Playable' }

/** Empty ring = Brewing, half ring = Assembling, check circle = Playable. A discrete icon, not a proportional ring. */
function StatusIcon({ state }: { state: BuildStatusView['state'] }) {
  if (state === 'playable') return <CircleCheck size={16} aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" />
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" data-icon={state === 'brewing' ? 'ring' : 'half-ring'}>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {state === 'assembling' && <path d="M8 1.75 A6.25 6.25 0 0 0 8 14.25 Z" fill="currentColor" />}
    </svg>
  )
}

export function RailBuildStatus({ deckId, totalCards, deckSize }: { deckId: number; totalCards: number; deckSize: number | null }) {
  const statuses = useQuery<{ counts: StatusCountsInput }>(cardStatusesQueryOptions(deckId))
  const legality = useQuery(legalityQueryOptions(deckId))
  const counts = statuses.data?.counts
  if (!counts || statuses.isError) return null
  const status = railBuildStatus(counts, deckSize)
  const legalStatus = legality.data && typeof legality.data.isLegal === 'boolean' ? legalityView(legality.data, totalCards, deckSize).status : null
  return (
    <div className="space-y-0.5" data-testid="rail-build-status" data-state={status.state}>
      <p className="flex items-center gap-1.5 text-[length:var(--fs-md)] font-medium">
        <StatusIcon state={status.state} />
        <span>
          {WORDS[status.state]} · {status.sleeved} of {status.of} sleeved
        </span>
      </p>
      {showsPlayableNeedsLegal(legalStatus, status.state) && (
        <p className="pl-[22px] text-[length:var(--fs-sm)] text-[var(--text-muted)]">Playable needs a legal list first.</p>
      )}
    </div>
  )
}
