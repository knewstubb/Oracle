'use client'
// Mana curve: seven brand-purple bars (mana value 1 to 7+, lands excluded). Click a bar to see its colour breakdown under the chart.
// Clicking the same bar again, or pressing Escape, closes the panel.
import { useState } from 'react'
import { MANA_FILL_VARS, CURVE_BRAND_SELECTED_VAR, CURVE_BRAND_VAR, MULTI_FILL_VAR } from '@/lib/ui-tokens'
import { avgManaValue, curvePanel, manaCurveBuckets, type RailCard } from '@/lib/deck-rail-stats'
import { FOCUS_RING } from '@/components/deck-strategy/focus'
import { cn } from '@/lib/utils'
import { RailSection } from './RailSection'

const MVS = [1, 2, 3, 4, 5, 6, 7]
const mvLabel = (mv: number) => (mv === 7 ? '7+' : String(mv))
const segFill = (key: string) => (key === 'M' ? `var(${MULTI_FILL_VAR})` : `var(${MANA_FILL_VARS[key as keyof typeof MANA_FILL_VARS]})`)
export const CURVE_MAX_BAR_PX = 50
export const CURVE_MIN_BAR_PX = 2
/** Tallest bucket is always 50px; others scale to it; zero shows no bar; non-zero is at least 2px. */
export const curveBarHeight = (count: number, tallest: number) => (count <= 0 || tallest <= 0 ? 0 : Math.max(CURVE_MIN_BAR_PX, (count / tallest) * CURVE_MAX_BAR_PX))
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
      testId="rail-curve"
      action={avg !== null ? <span className="text-[11px] font-medium tabular-nums text-[var(--text-primary)]" data-testid="avg-mv">Avg CMC {avg.toFixed(1)}</span> : undefined}
    >
      <div
        className="flex items-end"
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
              className={cn('flex min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-[2px]', FOCUS_RING)}
            >
              <span className={cn('text-[10px] tabular-nums text-[var(--text-secondary)]', on && 'font-semibold text-[var(--text-primary)]')} aria-hidden="true">{count}</span>
              <span
                aria-hidden="true"
                data-testid="curve-fill"
                className="block w-6 rounded-[2px]"
                style={{ height: `${curveBarHeight(count, max)}px`, background: `var(${on ? CURVE_BRAND_SELECTED_VAR : CURVE_BRAND_VAR})` }}
              />
              <span className={cn('text-[10px] text-[var(--text-secondary)]', on && 'font-semibold text-[var(--text-primary)]')} aria-hidden="true">{mvLabel(mv)}</span>
            </button>
          )
        })}
      </div>
      {panel && selected !== null && (
        <div className="space-y-2 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5" data-testid="curve-panel">
          <p className="flex items-baseline justify-between text-[11px]">
            <span className="font-medium text-[var(--text-primary)]">Mana value {mvLabel(selected)}</span>
            <span className="text-[var(--text-secondary)]">{plural(panel.total, 'card', 'cards')}</span>
          </p>
          <div className="flex h-2 gap-px overflow-hidden rounded-[2px] bg-[var(--bg-tertiary)]" aria-hidden="true">
            {panel.segments.filter((s) => s.count > 0).map((s) => (
              <div key={s.key} style={{ flexGrow: s.count, background: segFill(s.key) }} data-segment={s.key} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
            {panel.segments.filter((s) => s.count > 0).map((s) => (
              <li key={s.key} className="flex items-center gap-1">
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
