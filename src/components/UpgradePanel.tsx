'use client'

import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

interface UpgradePanelProps {
  deckId: number
}

interface CardSuggestion {
  name: string
  owned: boolean
  deckLocation: string | null
  price: number | null
  reasoning: string
}

interface StrategicDirection {
  name: string
  description: string
  cards: CardSuggestion[]
}

interface CutSuggestion {
  name: string
  reasoning: string
}

interface UpgradeData {
  strengths: string[]
  weaknesses: string[]
  directions: StrategicDirection[]
  cuts: CutSuggestion[]
}

export function UpgradePanel({ deckId }: UpgradePanelProps) {
  const { data, isLoading } = useQuery<UpgradeData | null>({
    queryKey: ['decks', deckId, 'upgrade'],
    queryFn: async () => {
      const r = await fetch(`/api/decks/${deckId}/upgrade`)
      if (r.status === 404) return null
      if (!r.ok) throw new Error('Failed to load upgrade data')
      return r.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1080px]">
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-[length:var(--fs-md)] text-muted-foreground">
            No upgrade strategy generated yet. Ask Kiro to analyze this deck for upgrade directions.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1080px] space-y-8">
      {/* Strategic Directions */}
      {data.directions?.length > 0 && (
        <section>
          <h2 className="mb-4 text-[length:var(--fs-lg)] font-medium">Upgrade Directions</h2>
          <div className="space-y-6">
            {data.directions.map((dir, i) => (
              <div key={i} className="rounded-lg border border-border p-5">
                <h3 className="mb-1 text-[length:var(--fs-lg)] font-medium">{dir.name}</h3>
                <p className="mb-4 text-[length:var(--fs-sm)] text-muted-foreground">{dir.description}</p>

                <div className="space-y-2">
                  {dir.cards.map((card, j) => (
                    <div key={j} className="flex items-start gap-3 rounded border border-border/50 p-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[length:var(--fs-md)] font-medium">{card.name}</span>
                          {card.owned ? (
                            card.deckLocation ? (
                              <Badge variant="secondary" className="text-[length:var(--fs-xs)]">
                                In {card.deckLocation}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[length:var(--fs-xs)] border-green-500 text-green-600">
                                ✓ Free
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="text-[length:var(--fs-xs)]">
                              Not owned
                            </Badge>
                          )}
                          {card.price != null && (
                            <span className="text-[length:var(--fs-xs)] text-muted-foreground">
                              ${card.price.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[length:var(--fs-sm)] text-muted-foreground">{card.reasoning}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Suggested Cuts */}
      {data.cuts?.length > 0 && (
        <section>
          <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium">Suggested Cuts</h2>
          <div className="rounded-lg border border-border">
            <table className="w-full text-[length:var(--fs-base)]">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left text-[length:var(--fs-xs)] font-medium uppercase text-muted-foreground">Card</th>
                  <th className="px-4 py-2 text-left text-[length:var(--fs-xs)] font-medium uppercase text-muted-foreground">Why Cut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.cuts.map((cut, i) => (
                  <tr key={i} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{cut.name}</td>
                    <td className="px-4 py-2 text-[length:var(--fs-base)] text-muted-foreground">{cut.reasoning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
