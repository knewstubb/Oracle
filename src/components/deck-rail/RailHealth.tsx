'use client'
import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeckHealthPanel } from '@/components/DeckHealthPanel'
import { HealthNotes } from '@/components/deck-health-parts'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import { RailSection } from './RailSection'
import { FOCUS_RING } from '@/components/deck-strategy/focus'
import type { DeckHealthResponse, HealthKind } from '@/lib/deck-health'
import { railHealthView, type RailHealthRow } from '@/lib/deck-rail-health-view'

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
    <RailSection id="rail-health-h" title="Deck health" className="space-y-1" testId="rail-health">
      {isLoading && (
        <p role="status" className="flex items-center gap-1 text-[length:var(--fs-sm)] text-[var(--text-muted)]">
          <Loader2 size={14} aria-hidden="true" className="animate-spin" />
          Checking…
        </p>
      )}
      {isError && !isLoading && (
        <div role="alert" className="flex min-h-11 flex-wrap items-center gap-2 text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-critical)' }}>
          <AlertCircle size={14} aria-hidden="true" />
          <span>Couldn&apos;t check</span>
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => void refetch()}>Try again</Button>
        </div>
      )}
      {data && !isError && <HealthBody data={data} rowClass={rowClass} open={open} />}
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
    </RailSection>
  )
}

function HealthBody({ data, rowClass, open }: { data: DeckHealthResponse; rowClass: string; open: (kind: HealthKind | null, from: HTMLElement) => void }) {
  const view = railHealthView(data)
  return (
    <>
      <button type="button" aria-haspopup="dialog" className={`${rowClass} flex min-h-11 items-center gap-2 font-semibold`} onClick={(e) => open(null, e.currentTarget)}>
        {view.verdict.short ? (
          <AlertTriangle size={14} aria-hidden="true" style={{ color: 'var(--warn-amber)' }} />
        ) : (
          <Check size={14} aria-hidden="true" style={{ color: 'var(--text-secondary)' }} />
        )}
        <span data-testid="health-verdict">{view.verdict.text}</span>
      </button>
      <ul data-testid="health-rows">
        {view.rows.map((r) => (
          <li key={r.kind} className={r.kind === 'game_plan' ? 'mt-1 border-t border-dashed pt-1' : ''} style={{ borderColor: 'var(--border-default)' }}>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={r.ariaLabel}
              data-kind={r.kind}
              className={`${rowClass} grid min-h-11 grid-cols-[84px_minmax(0,1fr)_auto_28px] items-center gap-2 py-1`}
              onClick={(e) => open(r.kind, e.currentTarget)}
            >
              <span>
                <span className="block leading-tight">{r.label}</span>
                {r.kind === 'lands' && r.doubleFaced > 0 && (
                  <span className="block text-[length:var(--fs-xs)] text-[var(--text-muted)]">+ {r.doubleFaced} double-faced</span>
                )}
              </span>
              {r.min !== null && r.max !== null ? <RangeBand row={r} min={r.min} max={r.max} /> : <span aria-hidden="true" />}
              <span className="text-right tabular-nums" data-testid="health-have">
                <b className="text-[length:var(--fs-base)]">{r.have}</b>
                {r.rangeText && <span className="ml-1 text-[length:var(--fs-xs)] text-[var(--text-muted)]">{r.rangeText}</span>}
              </span>
              <span className="text-right text-[length:var(--fs-sm)] font-semibold tabular-nums" style={{ color: 'var(--warn-amber)' }} data-testid="health-delta">
                {r.delta !== null ? `\u2212${-r.delta}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[length:var(--fs-xs)] text-[var(--text-muted)]" data-testid="health-reference">
        {view.reference.text}
        {view.reference.smallSample && (
          <span className="ml-1" style={{ color: 'var(--warn-amber)' }} data-testid="health-small-sample">
            small sample, treat as rough
          </span>
        )}
      </p>
      <HealthNotes health={data} />
    </>
  )
}

/** 6px track. A muted band from the minimum to the maximum with a 2px tick at each end; the fill is the count. */
function RangeBand({ row, min, max }: { row: RailHealthRow; min: number; max: number }) {
  const top = Math.max(Math.ceil(max * 1.3), row.have, max + 1)
  const pc = (v: number) => Math.min(100, (v / top) * 100)
  const under = row.delta !== null
  return (
    <div aria-hidden="true" className="relative h-1.5 rounded-full bg-[var(--bg-tertiary)]" data-testid="health-meter">
      <span className="absolute top-0 h-full bg-white/[0.14]" style={{ left: `${pc(min)}%`, width: `${pc(max) - pc(min)}%` }} />
      <span className="absolute top-0 h-full rounded-full" style={{ width: `${pc(row.have)}%`, background: under ? 'var(--warn-amber)' : 'var(--swatch-original)' }} data-testid="health-fill" />
      <span className="absolute -top-0.5 h-2.5 w-0.5 bg-[var(--text-secondary)]" style={{ left: `calc(${pc(min)}% - 1px)` }} />
      <span className="absolute -top-0.5 h-2.5 w-0.5 bg-[var(--text-secondary)]" style={{ left: `calc(${pc(max)}% - 1px)` }} />
    </div>
  )
}
