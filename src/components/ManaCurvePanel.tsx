'use client'

import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import type { DeckCard } from '@/components/CardGrid'

interface ManaCurvePanelProps {
  deckId: number
  cards: DeckCard[]
}

interface ManaData {
  curve: number[] // index = CMC, value = count
  colorDistribution: Record<string, number>
  landCount: number
  recommendedLandCount: number
  avgCmc: number
}

const COLOUR_DISPLAY: Record<string, { label: string; bg: string }> = {
  W: { label: 'White', bg: 'bg-amber-100 dark:bg-amber-900/40' },
  U: { label: 'Blue', bg: 'bg-blue-200 dark:bg-blue-900/40' },
  B: { label: 'Black', bg: 'bg-zinc-400 dark:bg-zinc-700' },
  R: { label: 'Red', bg: 'bg-red-200 dark:bg-red-900/40' },
  G: { label: 'Green', bg: 'bg-green-200 dark:bg-green-900/40' },
  C: { label: 'Colorless', bg: 'bg-slate-200 dark:bg-slate-700' },
}

export function ManaCurvePanel({ deckId, cards }: ManaCurvePanelProps) {
  const { data, isLoading } = useQuery<ManaData | null>({
    queryKey: ['decks', deckId, 'mana'],
    queryFn: async () => {
      const r = await fetch(`/api/decks/${deckId}/mana`)
      if (r.status === 404) return null
      if (!r.ok) throw new Error('Failed to load mana data')
      return r.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1080px]">
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-[length:var(--fs-md)] text-muted-foreground">
            No mana analysis available yet. Ask Kiro to generate mana curve data for this deck.
          </p>
        </div>
      </div>
    )
  }

  const maxCurve = Math.max(...data.curve, 1)

  return (
    <div className="mx-auto max-w-[1080px] space-y-8">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-4">
          <p className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">Average CMC</p>
          <p className="text-[length:var(--fs-2xl)] font-medium tabular-nums">{data.avgCmc.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">Lands</p>
          <p className="text-[length:var(--fs-2xl)] font-medium tabular-nums">{data.landCount}</p>
          <p className="text-[length:var(--fs-xs)] text-muted-foreground">Recommended: {data.recommendedLandCount}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">Non-Land Spells</p>
          <p className="text-[length:var(--fs-2xl)] font-medium tabular-nums">
            {data.curve.reduce((s, v) => s + v, 0)}
          </p>
        </div>
      </div>

      {/* Mana Curve Bar Chart */}
      <section>
        <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium">Mana Curve</h2>
        <div className="flex items-end gap-1 rounded-lg border border-border p-4" style={{ height: 200 }}>
          {data.curve.map((count, cmc) => (
            <div key={cmc} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[length:var(--fs-xs)] font-medium tabular-nums">{count || ''}</span>
              <div
                className="w-full rounded-t bg-primary/70 transition-all"
                style={{ height: `${(count / maxCurve) * 140}px` }}
              />
              <span className="text-[length:var(--fs-xs)] text-muted-foreground">{cmc === 7 ? '7+' : cmc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Color Pip Distribution */}
      {data.colorDistribution && Object.keys(data.colorDistribution).length > 0 && (
        <section>
          <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium">Color Requirements (Pips)</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(data.colorDistribution)
              .sort((a, b) => b[1] - a[1])
              .map(([color, pips]) => {
                const display = COLOUR_DISPLAY[color] || { label: color, bg: 'bg-muted' }
                return (
                  <div key={color} className={`rounded-lg p-3 ${display.bg}`}>
                    <p className="text-[length:var(--fs-sm)] font-medium">{display.label}</p>
                    <p className="text-[length:var(--fs-xl)] font-medium tabular-nums">{pips} pips</p>
                  </div>
                )
              })}
          </div>
        </section>
      )}
    </div>
  )
}
