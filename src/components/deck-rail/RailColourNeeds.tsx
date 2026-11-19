'use client'
import { colourNeeds, type RailCard } from '@/lib/deck-rail-stats'

const COLOUR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' }

export function RailColourNeeds({ cards, colourIdentity }: { cards: RailCard[]; colourIdentity: string | null | undefined }) {
  const needs = colourNeeds(cards, colourIdentity)
  return (
    <section aria-labelledby="rail-colour-h" className="space-y-2">
      <h2 id="rail-colour-h" className="text-[length:var(--fs-sm)] font-semibold text-muted-foreground">Colour needs against sources</h2>
      {needs.colourless ? (
        <p className="text-[length:var(--fs-sm)]">Colourless deck</p>
      ) : (
        <>
          <ul className="space-y-2">
            {needs.rows.map((r) => (
              <li key={r.colour} className="space-y-1">
                <p className="flex items-center gap-2 text-[length:var(--fs-sm)] font-medium">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[#8A8A93] text-[length:var(--fs-xs)]" aria-hidden="true">{r.colour}</span>
                  {COLOUR_NAMES[r.colour]}
                </p>
                <Bar label="Symbols" pct={r.symbolsPct} value={`${r.symbolsPct}%`} />
                <Bar label="Sources" pct={needs.landCount > 0 ? (r.sources / needs.landCount) * 100 : 0} value={`${r.sources} of ${needs.landCount}`} />
              </li>
            ))}
          </ul>
          <p className="text-[length:var(--fs-xs)] text-muted-foreground">Counts basic lands and well-known dual lands only.</p>
        </>
      )}
    </section>
  )
}

function Bar({ label, pct, value }: { label: string; pct: number; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[length:var(--fs-xs)]">
      <span className="w-14 text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]" aria-hidden="true">
        <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: 'var(--signal-success)' }} />
      </div>
      <span className="w-14 text-right tabular-nums">{value}</span>
    </div>
  )
}
