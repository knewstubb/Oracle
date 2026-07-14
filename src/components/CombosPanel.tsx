'use client'

import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

interface ComboPanelProps {
  deckId: number
}

interface ComboLine {
  cards: string[]
  result: string
  bracket?: string
}

interface CombosData {
  combos: ComboLine[]
}

export function CombosPanel({ deckId }: ComboPanelProps) {
  const { data, isLoading } = useQuery<CombosData | null>({
    queryKey: ['decks', deckId, 'combos'],
    queryFn: async () => {
      const r = await fetch(`/api/decks/${deckId}/combos`)
      if (r.status === 404) return null
      if (!r.ok) throw new Error('Failed to load combos')
      return r.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (!data || !data.combos || data.combos.length === 0) {
    return (
      <div className="mx-auto max-w-[1080px]">
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-[length:var(--fs-md)] text-muted-foreground">
            No combos documented yet. Ask Kiro to analyze this deck for combo lines.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[length:var(--fs-lg)] font-medium">Combo Lines ({data.combos.length})</h2>
      </div>

      <div className="space-y-4">
        {data.combos.map((combo, i) => (
          <div key={i} className="rounded-lg border border-border p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[length:var(--fs-md)] font-medium">
                {combo.cards.join(' + ')}
              </span>
              {combo.bracket && (
                <Badge variant="outline" className="text-[length:var(--fs-xs)]">
                  {combo.bracket}
                </Badge>
              )}
            </div>
            <p className="text-[length:var(--fs-sm)] text-muted-foreground">{combo.result}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
