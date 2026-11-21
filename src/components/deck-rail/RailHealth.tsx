'use client'
// Deck health in the rail: amber warning rows ("Light on ramp  11 / 35–38") in the same box as the Cards problems;
// See all adds the healthy, total and no-target rows. Rows open the cards-in-category panel; Edit opens Deck settings on the Deck health tab.
// The info notes (mana sources, template, uncategorised, overlap) are not in the rail; the cards-in-category panel shows them.
// Confirm and Decline for Claude's proposals are not here, only in the Deck settings window.
import { useRef, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeckHealthPanel } from '@/components/DeckHealthPanel'
import { RailEditLink } from './RailEditLink'
import { useOpenDeckSettings } from '@/components/deck-strategy/DeckSettingsHost'
import { useDeckHealth } from '@/hooks/useDeckHealth'
import { useHealthSettings } from '@/hooks/useHealthSettings'
import { RailSection } from './RailSection'
import { ProblemList, ProblemRowContent, PROBLEM_ROW_CLASS } from './RailProblemList'
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
  const [showAll, setShowAll] = useState(false)
  const isWarning = (t: HealthTile) => t.status === 'under' || t.status === 'over'
  const warnings = view.tiles.filter(isWarning)
  const rows = showAll ? [...warnings, ...view.tiles.filter((t) => !isWarning(t))] : warnings
  return (
    <>
      {rows.length > 0 && (
        <ProblemList testId="health-rows">
          {rows.map((t) => (
            <li key={t.key} className="min-w-0">
              <HealthRow tile={t} open={open} />
            </li>
          ))}
        </ProblemList>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-mt-1 h-auto self-start px-1 py-0.5 text-[12px] text-[var(--text-secondary)]"
        aria-expanded={showAll}
        data-testid="health-see-all"
        onClick={() => setShowAll((v) => !v)}
      >
        {showAll ? 'Hide' : 'See all'}
      </Button>
    </>
  )
}
function HealthRow({ tile: t, open }: { tile: HealthTile; open: (kind: HealthKind | null, from: HTMLElement) => void }) {
  const warning = t.status === 'under' || t.status === 'over'
  const text = warning ? `${t.status === 'over' ? 'Heavy' : 'Light'} on ${t.label.toLowerCase()}` : t.label
  const right = t.status === 'total' ? `${t.have} Total` : t.status === 'none' ? `${t.have} No target` : `${t.have} / ${t.rangeText}`
  const body = <ProblemRowContent text={text} right={<span data-testid="health-target">{right}</span>} icon={warning ? 'warning' : t.status === 'on' ? 'ok' : 'none'} />
  // Default rows open the cards-in-category panel. A custom category has no panel yet, so its row is not a button.
  if (t.kind) {
    return (
      <button type="button" aria-haspopup="dialog" aria-label={t.ariaLabel} data-kind={t.kind} data-status={t.status} className={cn(PROBLEM_ROW_CLASS, 'w-full text-left hover:bg-[var(--bg-surface-hover)]', FOCUS_RING)} onClick={(e) => open(t.kind, e.currentTarget)}>
        {body}
      </button>
    )
  }
  return (
    <div role="group" aria-label={t.ariaLabel} data-status={t.status} className={PROBLEM_ROW_CLASS}>
      {body}
    </div>
  )
}
