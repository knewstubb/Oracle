'use client'
import { AlertTriangle, ArrowDown, ArrowUp, Check, Info } from 'lucide-react'
import type { DeckHealthResponse, HealthRow, Verdict } from '@/lib/deck-health'

/** Shared by the rail rows and the details panel. Each verdict is an icon plus a word, never colour alone. */
const VERDICT_WORD: Record<Verdict, string> = { light: 'Light', ok: 'Ok', heavy: 'Heavy' }
const VERDICT_ICON = { light: ArrowDown, ok: Check, heavy: ArrowUp } as const

export function verdictColour(v: Verdict | null): string {
  return v === 'ok' ? 'var(--signal-success)' : v === null ? 'var(--text-secondary)' : 'var(--signal-warning)'
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** Icon plus word ("Light", "Ok", "Heavy"). A row with no verdict (Game Plan) says "Total" in grey. */
export function VerdictMark({ verdict, className = '' }: { verdict: Verdict | null; className?: string }) {
  if (verdict === null) {
    return (
      <span className={`inline-flex items-center justify-end gap-1 ${className}`} style={{ color: 'var(--text-secondary)' }}>
        Total
      </span>
    )
  }
  const Icon = VERDICT_ICON[verdict]
  return (
    <span className={`inline-flex items-center justify-end gap-1 font-semibold ${className}`} style={{ color: verdictColour(verdict) }}>
      <Icon size={14} aria-hidden="true" />
      {VERDICT_WORD[verdict]}
    </span>
  )
}

/** The spoken name of a row: count, verdict, range. Used for the button in the rail and the cards in the panel. */
export function rowAriaLabel(row: HealthRow): string {
  const cards = `${row.have} ${plural(row.have, 'card', 'cards')}`
  if (row.verdict === null || row.range === null) return `${row.label}: ${cards}. A total, no range and no verdict. Open details.`
  const how =
    row.verdict === 'ok'
      ? 'ok, within range'
      : row.verdict === 'light'
        ? `light, ${-row.offBy} below the minimum`
        : `heavy, ${row.offBy} above the maximum`
  return `${row.label}: ${cards}, ${how}. Range ${row.range.min} to ${row.range.max}. Open details.`
}

/** Header line over the rows: an amber triangle when any ranged row is off, a tick when all are in range. */
export function HeaderIcon({ health }: { health: DeckHealthResponse }) {
  const allIn = health.verdict.inRange === health.verdict.ranged
  return allIn ? (
    <Check size={14} aria-hidden="true" style={{ color: 'var(--signal-success)' }} />
  ) : (
    <AlertTriangle size={14} aria-hidden="true" style={{ color: 'var(--signal-warning)' }} />
  )
}

/** A track with the range as a tinted, outlined band and the count as a white marker. Decoration with a text alternative. */
export function RangeMeter({ row }: { row: HealthRow }) {
  if (!row.range) return null
  const { min, max } = row.range
  const top = Math.max(max * 1.5, row.have + 1, max + 2)
  const pc = (v: number) => Math.min(100, (v / top) * 100)
  return (
    <div>
      <div
        role="img"
        aria-label={`${row.have} ${plural(row.have, 'card', 'cards')}. Range ${min} to ${max}.`}
        className="relative mt-2.5 mb-1 h-2.5 rounded-full border"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'var(--border-default)' }}
      >
        <span
          className="absolute top-0 h-full border-x"
          style={{ left: `${pc(min)}%`, width: `${pc(max) - pc(min)}%`, backgroundColor: 'rgba(61,201,154,0.25)', borderColor: 'var(--signal-success)' }}
        />
        <span className="absolute top-[-3px] h-4 w-1 rounded-sm" style={{ left: `calc(${pc(row.have)}% - 2px)`, backgroundColor: '#fff' }} />
      </div>
      <div aria-hidden="true" className="flex justify-between text-[length:var(--fs-xs)]" style={{ color: 'var(--text-secondary)' }}>
        <span>0</span>
        <span>Range {min} to {max} · you have {row.have}</span>
        <span>{Math.round(top)}</span>
      </div>
    </div>
  )
}

/** Small grey notes with an info icon. Each note shows only when it applies. */
export function HealthNotes({ health, inPanel = false }: { health: DeckHealthResponse; inPanel?: boolean }) {
  const items: string[] = [health.notes.manaSources]
  if (!inPanel) items.push('Ranges are the Command Zone template. Select a row for details.')
  if (health.notes.uncategorised) items.push(health.notes.uncategorised)
  if (health.notes.overlap) items.push(health.notes.overlap)
  return (
    <ul className="grid gap-1 text-[length:var(--fs-xs)]" style={{ color: 'var(--text-secondary)' }} data-testid="health-notes">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-1.5">
          <Info size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}
