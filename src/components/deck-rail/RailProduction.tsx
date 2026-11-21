'use client'
// Mana production: two thin bars (Pips, Sources) with exact values on hover or focus, then land odds from the hypergeometric
// distribution (lands only, on the play). Pips = coloured pips in the mana costs of nonland cards. Sources = what each land can make.
import { MANA_FILL_VARS, MANA_NAMES, type ManaLetter } from '@/lib/ui-tokens'
import { colourBalance, type RailCard } from '@/lib/deck-rail-stats'
import { handOdds } from '@/lib/opening-hand'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FOCUS_RING } from '@/components/deck-strategy/focus'
import { RailSection } from './RailSection'

const fill = (c: ManaLetter) => `var(${MANA_FILL_VARS[c]})`
const pct = (p: number) => Math.round(p * 100)
const AMBER = 'var(--signal-warning)'

function SegmentBar({ label, segments }: { label: string; segments: Array<{ colour: ManaLetter; weight: number; tip: string }> }) {
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="w-[52px] shrink-0 text-[var(--text-secondary)]">{label}</span>
      <div className="flex h-1.5 flex-1 gap-px overflow-hidden rounded-[2px] bg-[var(--bg-tertiary)]" role="group" aria-label={label} data-testid={`bar-${label.toLowerCase()}`}>
        {segments.filter((s) => s.weight > 0).map((s) => (
          <Tooltip key={s.colour}>
            <TooltipTrigger
              render={<div tabIndex={0} role="img" aria-label={s.tip} data-colour={s.colour} className={FOCUS_RING} style={{ flexGrow: s.weight, background: fill(s.colour) }} />}
            />
            <TooltipContent side="top">{s.tip}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

export function RailProduction({ cards, colourIdentity, library }: { cards: RailCard[]; colourIdentity: string | null | undefined; library: number }) {
  const balance = colourBalance(cards, colourIdentity)
  const odds = handOdds(library, balance.landCount)
  const hand = [
    { label: '0\u20131 lands', p: pct(odds.opening.low), warn: pct(odds.opening.low) >= 20 },
    { label: '2\u20134 lands', p: pct(odds.opening.mid), warn: false },
    { label: '5+ lands', p: pct(odds.opening.high), warn: false },
  ]
  const drops = [
    { label: '3rd land drop on turn 3', p: pct(odds.thirdLandByTurn3), amberRule: true },
    { label: '4th land drop on turn 4', p: pct(odds.fourthLandByTurn4), amberRule: true },
    { label: 'Flooded by turn 6 (7+ lands in 12 cards)', p: pct(odds.floodedByTurn6), amberRule: false },
  ]
  return (
    <RailSection
      id="rail-production-h"
      title="Mana production"
      testId="rail-production"
      action={<span className="text-[11px] font-medium tabular-nums text-[var(--text-primary)]" data-testid="land-count">{balance.landCount} {balance.landCount === 1 ? 'Land' : 'Lands'}</span>}
    >
      {balance.kind === 'colourless' ? (
        <p className="text-[length:var(--fs-sm)]">Colourless deck</p>
      ) : (
        <div className="space-y-2.5" data-testid="mana-balance">
          <SegmentBar label="Pips" segments={balance.rows.map((r) => ({ colour: r.colour, weight: r.pips, tip: `${MANA_NAMES[r.colour]}: ${r.demandPct}% of pips` }))} />
          <SegmentBar label="Sources" segments={balance.rows.map((r) => ({ colour: r.colour, weight: r.sources, tip: `${MANA_NAMES[r.colour]}: ${r.sources} ${r.sources === 1 ? 'source' : 'sources'}` }))} />
        </div>
      )}
      <div className="space-y-3 border-t border-[var(--border-subtle)] pt-3" data-testid="hand-odds">
        <p className="text-[11px] text-[var(--text-secondary)]">Opening hand (7 cards)</p>
        <ul className="grid grid-cols-3 gap-2">
          {hand.map((h) => (
            <li key={h.label} className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-2 text-center" data-testid="hand-figure">
              <span className="block text-[16px] font-semibold tabular-nums" style={h.warn ? { color: AMBER } : undefined} data-warn={h.warn}>{h.p}%</span>
              <span className="block text-[10px] text-[var(--text-secondary)]">{h.label}</span>
            </li>
          ))}
        </ul>
        <ul className="space-y-3">
          {drops.map((d) => {
            const warn = d.amberRule && d.p < 60
            return (
              <li key={d.label} className="flex items-baseline justify-between gap-2 text-[11px] text-[var(--text-secondary)]" data-testid="land-drop">
                <span>{d.label}</span>
                <span className="font-medium tabular-nums text-[var(--text-primary)]" style={warn ? { color: AMBER } : undefined} data-warn={warn}>{d.p}%</span>
              </li>
            )
          })}
        </ul>
      </div>
    </RailSection>
  )
}
