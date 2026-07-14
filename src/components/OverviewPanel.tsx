'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { RatingsSection } from './RatingsSection'
import { KeyCardsSection } from './KeyCardsSection'
import { PrimerSection } from './PrimerSection'
import { WeaknessSection } from './WeaknessSection'
import type { DeckRatingsContent } from '@/lib/rating-engine'
import type { DeckCard } from '@/components/CardGrid'

interface OverviewPanelProps {
  deckId: number
  commanderName: string
  cards: DeckCard[]
  bracket?: string | null
}

interface OverviewData {
  strategy: string
  winConditions: string[]
  strengths: string[]
  weaknesses: string[]
  bracket: string
}

function parsePrimaryCategory(raw: string | null | undefined): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string')
      return parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
  } catch { /* */ }
  return raw.split(',')[0]?.trim().replace(/\(top\)|\(bottom\)/gi, '') || 'Other'
}

function getActiveCards(cards: DeckCard[]): DeckCard[] {
  return cards.filter(c => {
    const cat = parsePrimaryCategory(c.categories)
    return cat !== 'Maybeboard' && cat !== 'Sideboard'
  })
}

/** Compute mana curve from card data (CMC approximation based on category) */
function computeManaCurve(cards: DeckCard[]): number[] {
  // We don't have CMC in the card data, so we'll estimate from MCP later
  // For now return empty — the API endpoint will provide this
  return []
}

export function OverviewPanel({ deckId, commanderName, cards, bracket }: OverviewPanelProps) {
  const { data, isLoading, error } = useQuery<OverviewData>({
    queryKey: ['decks', deckId, 'overview'],
    queryFn: async () => {
      const r = await fetch(`/api/decks/${deckId}/overview`)
      if (r.status === 404) return null
      if (!r.ok) throw new Error('Failed to load overview')
      return r.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: ratings, isLoading: ratingsLoading, error: ratingsError } = useQuery<DeckRatingsContent | null>({
    queryKey: ['decks', deckId, 'ratings'],
    queryFn: () => fetch(`/api/decks/${deckId}/ratings`).then(r => {
      if (r.status === 404) return null
      if (!r.ok) throw new Error('Failed to fetch ratings')
      return r.json()
    }),
    staleTime: 5 * 60 * 1000,
  })

  const active = getActiveCards(cards)
  const totalCards = active.reduce((sum, c) => sum + (c.quantity || 1), 0)
  const proxyCount = active.filter(c => c.allocation_role === 'proxy').reduce((sum, c) => sum + (c.quantity || 1), 0)

  // Category distribution
  const catCounts: Record<string, number> = {}
  for (const card of active) {
    const cat = parsePrimaryCategory(card.categories)
    if (cat === 'Land' || cat === 'Commander') continue
    catCounts[cat] = (catCounts[cat] || 0) + (card.quantity || 1)
  }
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1])
  const maxCat = Math.max(...sortedCats.map(([, v]) => v), 1)

  // Land count
  const landCount = active.filter(c => parsePrimaryCategory(c.categories) === 'Land')
    .reduce((sum, c) => sum + (c.quantity || 1), 0)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const hasData = data && data.strategy

  return (
    <div className="mx-auto max-w-[1080px] space-y-8">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Total Cards" value={totalCards.toString()} />
        <StatCard label="Lands" value={landCount.toString()} />
        <StatCard label="Non-Land" value={(totalCards - landCount).toString()} />
        <StatCard label="Proxies" value={proxyCount.toString()} accent={proxyCount > 0} />
        <StatCard label="Bracket" value={bracket || '?'} />
      </div>

      {/* Ratings Section — loading / error / empty / data */}
      {ratingsLoading && (
        <section className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </section>
      )}
      {!ratingsLoading && ratingsError && (
        <section className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <AlertCircle className="size-4 text-destructive" />
          <p className="text-[length:var(--fs-md)] text-destructive">Failed to load ratings data.</p>
        </section>
      )}
      {!ratingsLoading && !ratingsError && ratings === null && (
        <section className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-[length:var(--fs-md)] text-muted-foreground">No ratings computed yet</p>
        </section>
      )}
      {!ratingsLoading && !ratingsError && ratings && (
        <>
          <RatingsSection scores={ratings.scores} contributingCards={ratings.contributingCards} />
          <KeyCardsSection keyCards={ratings.keyCards} />
          <PrimerSection primer={ratings.primer} />
          <WeaknessSection weaknesses={ratings.weaknesses} />
        </>
      )}

      {/* Strategy */}
      {hasData ? (
        <section>
          <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium">Strategy & Playstyle</h2>
          <p className="text-[length:var(--fs-md)] text-muted-foreground leading-relaxed">{data.strategy}</p>
          {data.bracket && (
            <div className="mt-3">
              <Badge variant="outline" className="text-[length:var(--fs-sm)]">
                Bracket: {data.bracket}
              </Badge>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-[length:var(--fs-md)] text-muted-foreground">
            No overview generated yet. Ask Kiro to scan this deck for strategy analysis.
          </p>
        </section>
      )}

      {/* Win Conditions */}
      {hasData && data.winConditions?.length > 0 && (
        <section>
          <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium">Win Conditions</h2>
          <ul className="space-y-1.5">
            {data.winConditions.map((wc, i) => (
              <li key={i} className="flex items-start gap-2 text-[length:var(--fs-md)]">
                <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="text-muted-foreground">{wc}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Strengths & Weaknesses — replaced by severity-categorized version when ratings available */}
      {hasData && !ratings && (
        <div className="grid gap-6 md:grid-cols-2">
          {data.strengths?.length > 0 && (
            <section>
              <h3 className="mb-2 text-[length:var(--fs-md)] font-medium text-green-600 dark:text-green-400">Strengths</h3>
              <ul className="space-y-1.5">
                {data.strengths.map((s, i) => (
                  <li key={i} className="text-[length:var(--fs-sm)] text-muted-foreground">• {s}</li>
                ))}
              </ul>
            </section>
          )}
          {data.weaknesses?.length > 0 && (
            <section>
              <h3 className="mb-2 text-[length:var(--fs-md)] font-medium text-red-600 dark:text-red-400">Weaknesses</h3>
              <ul className="space-y-1.5">
                {data.weaknesses.map((w, i) => (
                  <li key={i} className="text-[length:var(--fs-sm)] text-muted-foreground">• {w}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {hasData && ratings && data.strengths?.length > 0 && (
        <section>
          <h3 className="mb-2 text-[length:var(--fs-md)] font-medium text-green-600 dark:text-green-400">Strengths</h3>
          <ul className="space-y-1.5">
            {data.strengths.map((s, i) => (
              <li key={i} className="text-[length:var(--fs-sm)] text-muted-foreground">• {s}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Category Distribution Chart */}
      <section>
        <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium">Card Distribution</h2>
        <div className="space-y-2">
          {sortedCats.map(([cat, count]) => (
            <div key={cat} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-[length:var(--fs-sm)] text-muted-foreground">{cat}</span>
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded bg-primary/60 transition-all"
                  style={{ width: `${(count / maxCat) * 100}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-[length:var(--fs-sm)] font-medium tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">{label}</p>
      <p className={`text-[length:var(--fs-2xl)] font-medium tabular-nums ${accent ? 'text-amber-500' : ''}`}>{value}</p>
    </div>
  )
}
