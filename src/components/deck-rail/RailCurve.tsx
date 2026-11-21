'use client'
// Mana curve: seven teal bars (mana value 1 to 7+, lands excluded). Click a bar to see its colour breakdown under the chart.
// Clicking the same bar again, or pressing Escape, closes the panel.
import { useState } from 'react'
import { MANA_FILL_VARS, CURVE_TEAL_SELECTED_VAR, CURVE_TEAL_VAR, MULTI_FILL_VAR } from '@/lib/ui-tokens'
import { avgManaValue, curvePanel, manaCurveBuckets, type RailCard } from '@/lib/deck-rail-stats'
import { FOCUS_RING } from '@/components/deck-strategy/focus'
import { cn } from '@/lib/utils'
import { RailSection } from './RailSection'

const MVS = [1, 2, 3, 4, 5, 6, 7]
const mvLabel = (mv: number) => (mv === 7 ? '7+' : String(mv))
const segFill = (key: string) => (key === 'M' ? `var(${MULTI_FILL_VAR})` : `var(${MANA_FILL_VARS[key as keyof typeof MANA_FILL_VARS]})`)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function RailCurve({ cards }: { cards: RailCard[] }) {
  const [selected, setSelected] = useState<number | null>(null)
  const { buckets } = manaCurveBuckets(cards)
  const avg = avgManaValue(cards)
  const max = Math.max(1, ...MVS.map((mv) => buckets[mv]))
  const panel = selected !== null ? curvePanel(cards, selected) : null
  return (
    <RailSection
      id="rail-curve-h"
      title="Mana curve"
      className="space-y-3"
      testId="rail-curve"
      action={avg !== null ? <span className="text-[length:var(--fs-xs)] tabular-nums text-[var(--text-muted)]" data-testid="avg-mv">Avg CMC {avg.toFixed(1)}</span> : undefined}
    >
      <div
        className="flex h-28 items-end"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && selected !== null) setSelected(null)
        }}
      >
        {MVS.map((mv) => {
          const count = buckets[mv]
          const on = selected === mv
          return (
            <button
              key={mv}
              type="button"
              aria-pressed={on}
              aria-label={`Mana value ${mvLabel(mv)}, ${plural(count, 'card', 'cards')}`}
              onClick={() => setSelected(on ? null : mv)}
              data-testid="curve-bar"
              className={cn('flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded', FOCUS_RING)}
            >
              <span className={cn('text-[length:var(--fs-xs)] tabular-nums', on && 'font-bold')} aria-hidden="true">{count}</span>
              <span
                aria-hidden="true"
                className="block w-5 rounded-t"
                style={{ height: `${(count / max) * 64}px`, minHeight: count > 0 ? 2 : 0, background: `var(${on ? CURVE_TEAL_SELECTED_VAR : CURVE_TEAL_VAR})` }}
              />
              <span className={cn('text-[length:var(--fs-xs)] text-[var(--text-muted)]', on && 'font-bold text-foreground')} aria-hidden="true">{mvLabel(mv)}</span>
            </button>
          )
        })}
      </div>
      {panel && selected !== null && (
        <div className="space-y-2 rounded-lg border border-white/[0.12] p-3" data-testid="curve-panel">
          <p className="flex items-baseline justify-between text-[length:var(--fs-sm)]">
            <span className="font-semibold">Mana value {mvLabel(selected)}</span>
            <span className="text-[var(--text-muted)]">{plural(panel.total, 'card', 'cards')}</span>
          </p>
          <div className="flex h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]" aria-hidden="true">
            {panel.segments.filter((s) => s.count > 0).map((s) => (
              <div key={s.key} style={{ flexGrow: s.count, background: segFill(s.key) }} data-segment={s.key} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--fs-xs)]">
            {panel.segments.filter((s) => s.count > 0).map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: segFill(s.key) }} aria-hidden="true" />
                {s.count} {s.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </RailSection>
  )
}
