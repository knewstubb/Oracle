'use client'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { legalityQueryOptions } from '@/lib/deck-legality-query'
import { legalityView, type LegalityView } from '@/lib/deck-rail-stats'

/** The three legality states, drawn from props only. Neutral when fine, amber when not. */
export function RailLegalityView({ view }: { view: LegalityView }) {
  if (view.status === 'legal') {
    return (
      <div data-testid="rail-legality" data-state="legal" className="space-y-0.5">
        <p className="flex items-center gap-1.5 text-[length:var(--fs-md)] font-medium">
          <Check size={16} aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" />
          Legal for Commander
        </p>
        {view.subline && <p className="pl-[22px] text-[length:var(--fs-sm)] text-[var(--text-muted)]">{view.subline}</p>}
      </div>
    )
  }
  if (view.status === 'unverified') {
    return (
      <div data-testid="rail-legality" data-state="unverified" className="space-y-0.5">
        <p className="flex items-center gap-1.5 text-[length:var(--fs-md)] font-medium">
          <span aria-hidden="true" className="ml-[3px] mr-[3px] inline-block size-2.5 shrink-0 rounded-full" style={{ background: 'var(--warn-amber)' }} />
          Legal so far
        </p>
        {view.subline && <p className="pl-[22px] text-[length:var(--fs-sm)] text-[var(--text-muted)]">{view.subline}</p>}
      </div>
    )
  }
  return (
    <div
      data-testid="rail-legality"
      data-state="not_legal"
      className="space-y-1 rounded-md border p-3"
      style={{ borderColor: 'var(--warn-amber)' }}
    >
      <p className="flex items-center gap-1.5 text-[length:var(--fs-md)] font-medium" style={{ color: 'var(--warn-amber)' }}>
        <X size={16} aria-hidden="true" className="shrink-0" />
        Not legal yet
      </p>
      {view.bullets.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-9 text-[length:var(--fs-sm)]">
          {view.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function RailLegality({ deckId, totalCards, deckSize }: { deckId: number; totalCards: number; deckSize: number | null }) {
  const { data, isLoading, isError, refetch } = useQuery(legalityQueryOptions(deckId))
  if (isLoading) {
    return (
      <p role="status" className="flex items-center gap-1 text-[length:var(--fs-sm)] text-[var(--text-muted)]">
        <Loader2 size={14} aria-hidden="true" className="animate-spin" />
        Checking legality…
      </p>
    )
  }
  if (isError || !data || typeof data.isLegal !== 'boolean') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-critical)' }}>
        <AlertCircle size={14} aria-hidden="true" />
        <span>Couldn&apos;t check legality</span>
        <Button variant="outline" size="sm" className="min-h-11" onClick={() => void refetch()}>Try again</Button>
      </div>
    )
  }
  return <RailLegalityView view={legalityView(data, totalCards, deckSize)} />
}
