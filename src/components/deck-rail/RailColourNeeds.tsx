'use client'
import { ManaSymbol } from '@/components/ManaSymbol'
import { MANA_FILL_VARS, type ManaLetter } from '@/lib/ui-tokens'
import { RailSection } from './RailSection'
import { colourNeeds, type RailCard } from '@/lib/deck-rail-stats'

const COLOUR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' }

export function RailColourNeeds({ cards, colourIdentity }: { cards: RailCard[]; colourIdentity: string | null | undefined }) {
  const needs = colourNeeds(cards, colourIdentity)
  return (
    <RailSection id="rail-colour-h" title="Colour needs against sources">
      {needs.colourless ? (
        <p className="text-[length:var(--fs-sm)]">Colourless deck</p>
      ) : (
        <>
          <ul className="space-y-2">
            {needs.rows.map((r) => (
              <li key={r.colour} className="space-y-1">
                <p className="flex items-center gap-2 text-[length:var(--fs-sm)] font-medium">
                  <ManaSymbol colour={r.colour as ManaLetter} label={false} />
                  {COLOUR_NAMES[r.colour]}
                </p>
                <Bar label="Symbols" pct={r.symbolsPct} value={`${r.symbolsPct}%`} fill={fillFor(r.colour)} />
                <Bar label="Sources" pct={needs.landCount > 0 ? (r.sources / needs.landCount) * 100 : 0} value={`${r.sources} of ${needs.landCount}`} fill={fillFor(r.colour)} />
              </li>
            ))}
          </ul>
          <p className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">Counts basic lands and well-known dual lands only.</p>
        </>
      )}
    </RailSection>
  )
}

const fillFor = (colour: string) => `var(${MANA_FILL_VARS[colour as ManaLetter]})`
function Bar({ label, pct, value, fill }: { label: string; pct: number; value: string; fill: string }) {
  return (
    <div className="flex items-center gap-2 text-[length:var(--fs-xs)]">
      <span className="w-14 text-[var(--text-muted)]">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]" aria-hidden="true">
        <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: fill }} />
      </div>
      <span className="w-14 text-right tabular-nums">{value}</span>
    </div>
  )
}
