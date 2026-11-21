'use client'
// Mana by turn: average mana available on turns 1 to 7, from a seeded 5,000-game simulation run in the browser after first paint.
import { useEffect, useMemo, useState } from 'react'
import { manaByTurn, type ManaByTurnResult } from '@/lib/mana-by-turn'
import { isLandTypeLine } from '@/lib/card-roles'
import type { RailCard } from '@/lib/deck-rail-stats'
import { RailSection } from './RailSection'
import { DEFAULT_TURN, ManaByTurnChart, turnLabel } from './ManaByTurnChart'

const MIN_CARDS = 8
const signatureOf = (cards: RailCard[], commanders: string[]) =>
  JSON.stringify([cards.map((c) => [c.card_name, c.quantity, c.type_line, c.mana_cost, c.oracle_text ?? null]), commanders])

export function RailManaByTurn({ cards, commanders }: { cards: RailCard[]; commanders: string[] }) {
  const signature = useMemo(() => signatureOf(cards, commanders), [cards, commanders])
  const enough = useMemo(() => {
    const pool = cards.filter((c) => !commanders.includes(c.card_name))
    const total = pool.reduce((s, c) => s + (c.quantity ?? 1), 0)
    return total >= MIN_CARDS && pool.some((c) => isLandTypeLine(c.type_line))
  }, [cards, commanders])
  const [done, setDone] = useState<{ signature: string; result: ManaByTurnResult } | null>(null)
  const [turn, setTurn] = useState(DEFAULT_TURN)

  useEffect(() => {
    if (!enough || done?.signature === signature) return
    const id = setTimeout(() => setDone({ signature, result: manaByTurn(cards, commanders, { games: 5000, turns: 7 }) }), 0)
    return () => clearTimeout(id)
    // The signature stands in for cards and commanders, so a refetch with the same content does not rerun the simulation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enough])

  const result = enough && done?.signature === signature ? done.result : null
  return (
    <RailSection
      id="rail-mana-by-turn-h"
      title="Mana by turn"
      testId="rail-mana-by-turn"
      action={result ? <span className="text-[11px] font-medium tabular-nums text-[var(--text-primary)]" data-testid="mana-readout" aria-live="polite">{turnLabel(turn, result.actual.avg[turn - 1])}</span> : undefined}
    >
      {!enough ? (
        <p className="text-[11px] text-[var(--text-secondary)]" data-testid="mana-empty">Add cards to see mana by turn</p>
      ) : !result ? (
        <div className="h-[150px] animate-pulse rounded-[8px] bg-[var(--bg-tertiary)]" data-testid="mana-skeleton" aria-hidden="true" />
      ) : (
        <>
          <ManaByTurnChart result={result} turn={turn} onTurn={setTurn} />
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--text-secondary)]">
            <li className="flex items-center gap-1"><span className="h-0.5 w-3 rounded-full bg-[var(--brand-400)]" aria-hidden="true" />Average</li>
            <li className="flex items-center gap-1"><span className="w-3 border-t-2 border-dashed border-[var(--text-secondary)]" aria-hidden="true" />If all lands untapped</li>
            <li className="flex items-center gap-1"><span className="h-2 w-3 rounded-[2px] bg-[var(--brand-600)] opacity-25" aria-hidden="true" />Middle 80% of games</li>
          </ul>
          <p className="text-[10px] text-[var(--text-secondary)]">5,000 games · on the play · 2–5 land hands</p>
        </>
      )}
    </RailSection>
  )
}
