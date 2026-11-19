'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeckHealthPanel } from '@/components/DeckHealthPanel'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import { FOCUS_RING } from '@/components/deck-strategy/focus'
import type { DeckHealthResponse, HealthRoleKey } from '@/lib/deck-health'

export function RailHealth({ deckId }: { deckId: number }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [gapRole, setGapRole] = useState<HealthRoleKey | null>(null)
  const { data, isLoading, isError, refetch } = useQuery<DeckHealthResponse>({
    queryKey: deckKeys.health(deckId),
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/health`)
      if (!res.ok) throw new Error('Failed to fetch health data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
  const open = (role: HealthRoleKey | null) => {
    setGapRole(role)
    setPanelOpen(true)
  }
  const anyLight = !!data && data.roles.some((r) => r.state === 'light')
  const rowClass = `flex min-h-11 w-full items-center gap-2 rounded-md px-1 text-left text-[length:var(--fs-sm)] hover:bg-[var(--bg-surface-hover)] ${FOCUS_RING}`

  return (
    <section aria-labelledby="rail-health-h" className="space-y-1" data-testid="rail-health">
      <h2 id="rail-health-h" className="text-[length:var(--fs-sm)] font-semibold text-muted-foreground">Deck health</h2>
      {isLoading && <p role="status" className="text-[length:var(--fs-sm)] text-muted-foreground">Checking…</p>}
      {isError && !isLoading && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-critical)' }}>
          <AlertCircle size={14} aria-hidden="true" />
          <span>Couldn&apos;t check</span>
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => void refetch()}>Try again</Button>
        </div>
      )}
      {data && !isError && (
        <>
          <button type="button" aria-haspopup="dialog" className={`${rowClass} font-medium`} onClick={() => open(null)}>
            {anyLight ? <AlertTriangle size={14} aria-hidden="true" style={{ color: 'var(--signal-warning)' }} /> : <Check size={14} aria-hidden="true" />}
            <span>{data.verdict.headline}</span>
          </button>
          <ul className="space-y-0">
            {data.roles.map((r) => {
              const light = r.state === 'light'
              return (
                <li key={r.role}>
                  <button type="button" aria-haspopup="dialog" className={rowClass} onClick={() => open(light ? r.role : null)}>
                    <span className="flex-1">{r.label}</span>
                    <span className="tabular-nums">{r.have} / {r.typical}</span>
                    <span className="inline-flex w-16 items-center justify-end gap-1" style={{ color: light ? 'var(--signal-warning)' : 'var(--signal-success)' }}>
                      {light ? <AlertTriangle size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                      {light ? 'Short' : 'Met'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="text-[length:var(--fs-xs)] text-muted-foreground">{data.sourceLine}</p>
        </>
      )}
      <DeckHealthPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        data={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        deckId={deckId}
        gapRole={gapRole}
        onGapRole={setGapRole}
      />
    </section>
  )
}
