'use client'
import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeckHealthPanel } from '@/components/DeckHealthPanel'
import { HealthNotes, HeaderIcon, VerdictMark, rowAriaLabel } from '@/components/deck-health-parts'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import { FOCUS_RING } from '@/components/deck-strategy/focus'
import type { DeckHealthResponse, HealthKind } from '@/lib/deck-health'

export function RailHealth({ deckId }: { deckId: number }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [selected, setSelected] = useState<HealthKind | null>(null)
  const openedFrom = useRef<HTMLElement | null>(null)
  const { data, isLoading, isError, refetch } = useQuery<DeckHealthResponse>({
    queryKey: deckKeys.health(deckId),
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/health`)
      if (!res.ok) throw new Error('Failed to fetch health data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const open = (kind: HealthKind | null, from: HTMLElement) => {
    openedFrom.current = from
    setSelected(kind)
    setPanelOpen(true)
  }
  const close = () => {
    setPanelOpen(false)
    // Escape and Close return focus to the row that opened the panel.
    const el = openedFrom.current
    if (el && el.isConnected) requestAnimationFrame(() => el.focus())
  }
  const rowClass = `w-full rounded-md px-1 text-left text-[length:var(--fs-sm)] hover:bg-[var(--bg-surface-hover)] ${FOCUS_RING}`
  return (
    <section aria-labelledby="rail-health-h" className="space-y-1" data-testid="rail-health">
      <h2 id="rail-health-h" className="text-[length:var(--fs-sm)] font-semibold text-muted-foreground">Deck health</h2>
      {isLoading && <p role="status" className="text-[length:var(--fs-sm)] text-muted-foreground">Checking…</p>}
      {isError && !isLoading && (
        <div role="alert" className="flex min-h-11 flex-wrap items-center gap-2 text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-critical)' }}>
          <AlertCircle size={14} aria-hidden="true" />
          <span>Couldn&apos;t check</span>
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => void refetch()}>Try again</Button>
        </div>
      )}
      {data && !isError && (
        <>
          <button
            type="button"
            aria-haspopup="dialog"
            className={`${rowClass} flex min-h-11 items-center gap-2 font-semibold`}
            onClick={(e) => open(null, e.currentTarget)}
          >
            <HeaderIcon health={data} />
            <span>{data.verdict.headline}</span>
          </button>
          <ul data-testid="health-rows">
            {data.rows.map((r) => (
              <li
                key={r.kind}
                className={r.kind === 'game_plan' ? 'mt-1 border-t border-dashed pt-1' : 'border-b last:border-b-0'}
                style={{ borderColor: 'var(--border-default)' }}
              >
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={rowAriaLabel(r)}
                  data-kind={r.kind}
                  className={`${rowClass} grid min-h-11 grid-cols-[minmax(0,1fr)_auto_72px] items-center gap-2 py-1`}
                  onClick={(e) => open(r.kind, e.currentTarget)}
                >
                  <span>
                    <span className="block">{r.label}</span>
                    <span className="block text-[length:var(--fs-xs)] text-muted-foreground">{r.summary}</span>
                    {r.kind === 'lands' && (r.doubleFaced ?? 0) > 0 && (
                      <span className="block text-[length:var(--fs-xs)] text-muted-foreground">+ {r.doubleFaced} double-faced</span>
                    )}
                  </span>
                  <b className="min-w-6 text-right text-[length:var(--fs-base)] tabular-nums">{r.have}</b>
                  <VerdictMark verdict={r.verdict} className="w-[72px]" />
                </button>
              </li>
            ))}
          </ul>
          <HealthNotes health={data} />
        </>
      )}
      <DeckHealthPanel
        open={panelOpen}
        onClose={close}
        data={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        deckId={deckId}
        selected={selected}
        onSelect={setSelected}
      />
    </section>
  )
}
