'use client'
import { AlertTriangle, Check } from 'lucide-react'
import { ManaSymbol } from '@/components/ManaSymbol'
import { MANA_FILL_VARS, MANA_NAMES, type ManaLetter } from '@/lib/ui-tokens'
import { avgManaValue, colourBalance, curveByColour, UNDER_SUPPLY_POINTS, type ColourBalance, type RailCard } from '@/lib/deck-rail-stats'
import { RailSection } from './RailSection'

const fill = (c: ManaLetter) => `var(${MANA_FILL_VARS[c]})`

const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

function verdictText(b: ColourBalance): string {
  if (b.kind === 'colourless') return 'Colourless deck'
  if (b.kind === 'mono') return 'Mono-colour: nothing to balance'
  if (b.underColours.length > 0) {
    const names = b.underColours.map((c) => MANA_NAMES[c])
    return `${list(names)} ${names.length === 1 ? 'is' : 'are'} under-supplied`
  }
  return `Balanced across ${b.rows.length} colours`
}

/** Mana curve and colour balance in one section. */
export function RailMana({ cards, colourIdentity }: { cards: RailCard[]; colourIdentity: string | null | undefined }) {
  const { columns, unknown } = curveByColour(cards)
  const avg = avgManaValue(cards)
  const balance = colourBalance(cards, colourIdentity)
  const max = Math.max(1, ...columns.map((c) => c.total))
  const text = columns.map((c) => `cost ${c.label}: ${c.total}`).join(', ')
  const warn = balance.underColours.length > 0
  return (
    <RailSection id="rail-mana-h" title="Mana" className="space-y-3" testId="rail-mana">
      <p className="flex items-center gap-2 text-[length:var(--fs-sm)] font-semibold" data-testid="mana-verdict">
        {warn ? <AlertTriangle size={14} aria-hidden="true" style={{ color: 'var(--warn-amber)' }} /> : <Check size={14} aria-hidden="true" style={{ color: 'var(--text-secondary)' }} />}
        {verdictText(balance)}
      </p>
      <div className="space-y-1" data-testid="mana-curve">
        <div className="flex items-baseline justify-between text-[length:var(--fs-xs)]">
          <span className="text-[var(--text-muted)]">Mana curve</span>
          {avg !== null && <span className="tabular-nums" data-testid="avg-mv">Avg MV ≈ {avg.toFixed(1)}</span>}
        </div>
        <div role="img" aria-label={`Mana curve. ${text}.`} className="flex h-24 items-end gap-1">
          {columns.map((c) => (
            <div key={c.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5" aria-hidden="true" data-testid="curve-column">
              <span className="text-[length:var(--fs-xs)] tabular-nums">{c.total}</span>
              <div className="flex w-full flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(c.total / max) * 64}px`, minHeight: c.total > 0 ? 2 : 0 }}>
                {c.segments.map((s) => (
                  <div key={s.colour} style={{ flexGrow: s.count, background: fill(s.colour) }} data-colour={s.colour} />
                ))}
              </div>
              <span className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">{c.label}</span>
            </div>
          ))}
        </div>
        <p className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">Stacked by card colour · lands excluded</p>
        {unknown > 0 && (
          <p className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">
            {unknown} {unknown === 1 ? 'card has' : 'cards have'} no cost on file
          </p>
        )}
      </div>
      {balance.kind !== 'colourless' && (
        <div className="space-y-2" data-testid="mana-balance">
          {balance.kind === 'mono' ? (
            <p className="flex items-center gap-2 text-[length:var(--fs-sm)]">
              <ManaSymbol colour={balance.rows[0].colour} label={false} />
              Every pip is {MANA_NAMES[balance.rows[0].colour].toLowerCase()}, so there&apos;s no split to check.
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {balance.rows.map((r) => (
                  <li key={r.colour} className="space-y-1" data-colour={r.colour}>
                    <p className="flex items-center gap-2 text-[length:var(--fs-sm)] font-medium">
                      <ManaSymbol colour={r.colour} label={false} />
                      {MANA_NAMES[r.colour]}
                      {r.under && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-semibold"
                          style={{ color: 'var(--warn-amber)', border: '1px solid var(--warn-amber)' }}
                          data-testid="under-chip"
                        >
                          {`\u2212${r.gap} pts`}
                        </span>
                      )}
                    </p>
                    <Bar label="Pips" pct={r.demandPct} colour={r.colour} solid />
                    <Bar label="Sources" pct={r.supplyPct} colour={r.colour} solid={false} />
                  </li>
                ))}
              </ul>
              <p className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">Under-supplied means sources trail pips by {UNDER_SUPPLY_POINTS} points or more.</p>
            </>
          )}
          <p className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">Lands counted: basics and well-known duals only. Rocks and utility lands aren&apos;t included.</p>
        </div>
      )}
    </RailSection>
  )
}

function Bar({ label, pct, colour, solid }: { label: string; pct: number; colour: ManaLetter; solid: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[length:var(--fs-xs)]">
      <span className="w-14 text-[var(--text-muted)]">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]" aria-hidden="true">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, pct)}%`, background: solid ? fill(colour) : 'transparent', boxShadow: solid ? undefined : `inset 0 0 0 1.5px ${fill(colour)}` }}
          data-bar={solid ? 'pips' : 'sources'}
        />
      </div>
      <span className="w-10 text-right tabular-nums">{pct}%</span>
    </div>
  )
}
