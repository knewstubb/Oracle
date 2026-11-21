'use client'
// Deck health in the rail: a headline, then two-column tiles (name, big count, target). Problem tiles are amber with an arrow
// (up = over, down = under). Tiles open the cards-in-category panel; Edit opens Deck settings on the Deck health tab.
// The info notes (mana sources, template, uncategorised, overlap) are not in the rail; the cards-in-category panel shows them.
// Confirm and Decline for Claude's proposals are not here, only in the Deck settings window.
import { useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeckHealthPanel } from '@/components/DeckHealthPanel'
import { RailEditLink } from './RailEditLink'
import { useOpenDeckSettings } from '@/components/deck-strategy/DeckSettingsHost'
import { useDeckHealth } from '@/hooks/useDeckHealth'
import { useHealthSettings } from '@/hooks/useHealthSettings'
import { RailSection } from './RailSection'
import { FOCUS_RING } from '@/components/deck-strategy/focus'
import type { HealthKind } from '@/lib/deck-health'
import { applySettings, healthTilesView, type HealthTile, type HealthTilesView } from '@/lib/deck-health-settings'
import { cn } from '@/lib/utils'

export function RailHealth({ deckId, cards = [] }: { deckId: number; cards?: Array<{ categories?: string | null; quantity?: number | null }> }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [selected, setSelected] = useState<HealthKind | null>(null)
  const openedFrom = useRef<HTMLElement | null>(null)
  const editRef = useRef<HTMLButtonElement | null>(null)
  const openSettings = useOpenDeckSettings()
  const { data, isLoading, isError, refetch } = useDeckHealth(deckId)
  const { settings } = useHealthSettings(deckId)
  const open = (kind: HealthKind | null, from: HTMLElement) => {
    openedFrom.current = from
    setSelected(kind)
    setPanelOpen(true)
  }
  const close = () => {
    setPanelOpen(false)
    // Escape and Close return focus to the tile that opened the panel.
    const el = openedFrom.current
    if (el && el.isConnected) requestAnimationFrame(() => el.focus())
  }
  return (
    <RailSection
      id="rail-health-h"
      title="Deck health"
      testId="rail-health"
      action={<RailEditLink ref={editRef} label="Edit deck health" onClick={() => openSettings('health', editRef.current)} />}
    >
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
      {data && !isError && <HealthBody view={healthTilesView(applySettings(data, settings, cards), settings.available ? settings.mode : 'default')} open={open} />}
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

function HealthBody({ view, open }: { view: HealthTilesView; open: (kind: HealthKind | null, from: HTMLElement) => void }) {
  const { headline } = view
  return (
    <>
      <p className="flex items-start gap-2 text-[12px] font-medium" data-testid="health-verdict">
        {headline.problem ? (
          <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--signal-warning)' }} />
        ) : (
          <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
        )}
        <span>{headline.text}</span>
      </p>
      <ul data-testid="health-rows" className="grid grid-cols-2 gap-2">
        {view.tiles.map((t) => (
          <li key={t.key} className="min-w-0">
            <Tile tile={t} open={open} />
          </li>
        ))}
      </ul>
    </>
  )
}

function Tile({ tile: t, open }: { tile: HealthTile; open: (kind: HealthKind | null, from: HTMLElement) => void }) {
  const problem = t.status === 'under' || t.status === 'over'
  const base = cn(
    'flex w-full flex-col gap-0.5 rounded-lg border p-2 text-left',
    problem ? 'border-[var(--signal-warning)]/45 bg-[var(--signal-warning-bg)]' : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]',
  )
  const body = (
    <>
      <span className="block text-[11px] text-[var(--text-secondary)]">
        {t.label}
        {t.kind === 'lands' && t.doubleFaced > 0 && <span className="ml-1 text-[length:var(--fs-xs)] text-[var(--text-muted)]">+ {t.doubleFaced} double-faced</span>}
      </span>
      <span className="flex items-baseline gap-1">
        <span className="flex items-center gap-0.5 text-[20px] font-semibold leading-none tabular-nums" style={problem ? { color: 'var(--signal-warning)' } : undefined} data-testid="health-have">
          {t.have}
          {t.status === 'over' && <ArrowUp size={14} aria-hidden="true" data-testid="health-arrow-up" />}
          {t.status === 'under' && <ArrowDown size={14} aria-hidden="true" data-testid="health-arrow-down" />}
        </span>
        <span className="text-[11px] text-[var(--text-secondary)]" data-testid="health-target">
          {t.status === 'total' ? 'Total' : t.status === 'none' ? 'No target' : `/ ${t.rangeText}`}
        </span>
      </span>
    </>
  )
  // Default rows open the cards-in-category panel. A custom category has no panel yet, so its tile is not a button.
  if (t.kind) {
    return (
      <button type="button" aria-haspopup="dialog" aria-label={t.ariaLabel} data-kind={t.kind} data-status={t.status} className={cn(base, 'hover:bg-[var(--bg-surface-hover)]', FOCUS_RING)} onClick={(e) => open(t.kind, e.currentTarget)}>
        {body}
      </button>
    )
  }
  return (
    <div role="group" aria-label={t.ariaLabel} data-status={t.status} className={base}>
      {body}
    </div>
  )
}
