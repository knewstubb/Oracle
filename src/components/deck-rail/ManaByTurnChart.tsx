'use client'
// Mana by turn: SVG line chart over turns 1 to 7. Brand colours only (no mana colours).
// Seven focusable columns sit over the plot; hover or focus on one changes the readout, leaving resets it.
import type { ManaByTurnResult } from '@/lib/mana-by-turn'
import { FOCUS_RING } from '@/components/deck-strategy/focus'
import { cn } from '@/lib/utils'

export const DEFAULT_TURN = 4
const W = 260
const H = 150
const LEFT = 20
const RIGHT = 8
const TOP = 8
const BOTTOM = 124
const TURNS = [1, 2, 3, 4, 5, 6, 7]

/** Gridlines at 0/3/6/9; the top grows to the next multiple of 3 when the 90th percentile passes 9. */
export function yMax(result: ManaByTurnResult): number {
  const top = Math.max(...result.actual.p90, ...result.untapped.p90)
  return top > 9 ? Math.ceil(top / 3) * 3 : 9
}
export const turnLabel = (turn: number, avg: number) => `Turn ${turn}: ${avg.toFixed(1)} mana`

export function ManaByTurnChart({ result, turn, onTurn }: { result: ManaByTurnResult; turn: number; onTurn: (t: number) => void }) {
  const max = yMax(result)
  const x = (t: number) => LEFT + ((t - 1) / 6) * (W - LEFT - RIGHT)
  const y = (v: number) => BOTTOM - (Math.min(v, max) / max) * (BOTTOM - TOP)
  const line = (vals: number[]) => vals.map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const band = [...result.actual.p90.map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`), ...result.actual.p10.map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).reverse()].join(' ')
  const grid: number[] = []
  for (let g = 0; g <= max; g += 3) grid.push(g)
  const colW = (W - LEFT - RIGHT) / 6
  return (
    <div className="relative" style={{ aspectRatio: `${W} / ${H}` }} data-testid="mana-by-turn-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        {grid.map((g) => (
          <g key={g}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(g)} y2={y(g)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={LEFT - 6} y={y(g) + 3} textAnchor="end" fontSize={10} fill="var(--text-secondary)">{g}</text>
          </g>
        ))}
        <polygon points={band} fill="var(--brand-600)" fillOpacity={0.25} data-testid="mana-band" />
        <polyline points={line(result.untapped.avg)} fill="none" stroke="var(--text-secondary)" strokeWidth={1.5} strokeDasharray="4 3" data-testid="mana-untapped-line" />
        <polyline points={line(result.actual.avg)} fill="none" stroke="var(--brand-400)" strokeWidth={2} strokeLinejoin="round" data-testid="mana-avg-line" />
        {result.actual.avg.map((v, i) => {
          const on = i + 1 === turn
          return <circle key={i} cx={x(i + 1)} cy={y(v)} r={on ? 4 : 3} fill={on ? '#FFFFFF' : 'var(--brand-400)'} stroke={on ? 'var(--brand-400)' : 'none'} strokeWidth={2} data-testid="mana-point" data-on={on ? 'true' : 'false'} />
        })}
        {TURNS.map((t) => (
          <text key={t} x={x(t)} y={142} textAnchor="middle" fontSize={10} fill={t === turn ? 'var(--text-primary)' : 'var(--text-secondary)'} fontWeight={t === turn ? 600 : 400}>{t}</text>
        ))}
      </svg>
      <div className="absolute inset-0 flex" style={{ left: `${((x(1) - colW / 2) / W) * 100}%`, right: `${((W - x(7) - colW / 2) / W) * 100}%` }}>
        {TURNS.map((t) => (
          <button
            key={t}
            type="button"
            aria-label={turnLabel(t, result.actual.avg[t - 1])}
            data-testid="mana-turn"
            onMouseEnter={() => onTurn(t)}
            onFocus={() => onTurn(t)}
            onMouseLeave={() => onTurn(DEFAULT_TURN)}
            onBlur={() => onTurn(DEFAULT_TURN)}
            className={cn('h-full min-w-0 flex-1 rounded-[2px]', FOCUS_RING)}
          />
        ))}
      </div>
    </div>
  )
}
