'use client'
import { RailSection } from './RailSection'
import { manaCurveBuckets, type RailCard } from '@/lib/deck-rail-stats'

const LABELS = ['0', '1', '2', '3', '4', '5', '6', '7+']

export function RailCurve({ cards }: { cards: RailCard[] }) {
  const { buckets, unknown } = manaCurveBuckets(cards)
  const max = Math.max(1, ...buckets)
  const text = buckets.map((n, i) => `cost ${LABELS[i]}: ${n}`).join(', ')
  return (
    <RailSection id="rail-curve-h" title="Mana curve">
      <div role="img" aria-label={`Mana curve. ${text}.`} className="flex h-24 items-end gap-1">
        {buckets.map((n, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5" aria-hidden="true">
            <span className="text-[length:var(--fs-xs)] tabular-nums">{n}</span>
            <div className="w-full rounded-t bg-[var(--swatch-original)]" style={{ height: `${(n / max) * 64}px`, minHeight: n > 0 ? 2 : 0 }} />
            <span className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">{LABELS[i]}</span>
          </div>
        ))}
      </div>
      {unknown > 0 && (
        <p className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">
          {unknown} {unknown === 1 ? 'card has' : 'cards have'} no cost on file
        </p>
      )}
    </RailSection>
  )
}
