'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface CollectionValue {
  totalMarketValue: number
  totalPurchaseValue: number
  gainLoss: number
  cardCount: number
  topCards: Array<{
    cardName: string
    copies: number
    pricePerCopy: number
    totalValue: number
  }>
}

export function CollectionValueBanner() {
  const { data, isLoading } = useQuery<CollectionValue>({
    queryKey: ['collection-value'],
    queryFn: () => fetch('/api/collection/value').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading || !data || data.totalMarketValue === 0) return null

  const hasGain = data.gainLoss > 0
  const hasLoss = data.gainLoss < 0
  const hasPurchaseData = data.totalPurchaseValue > 0

  return (
    <div className="mx-5 mb-3 flex flex-wrap items-center gap-4 rounded-lg border px-4 py-2.5" style={{ borderColor: 'var(--border-default)', backgroundColor: 'rgba(26,26,30,0.5)' }}>
      {/* Total value */}
      <div>
        <span className="block text-[length:var(--fs-xs)] text-muted-foreground">Collection Value</span>
        <span className="text-[length:var(--fs-lg)] font-semibold text-foreground">
          ${data.totalMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {/* Gain/Loss */}
      {hasPurchaseData && (
        <div>
          <span className="block text-[length:var(--fs-xs)] text-muted-foreground">Gain/Loss</span>
          <span className={`inline-flex items-center gap-1 text-[length:var(--fs-md)] font-medium ${hasGain ? 'text-[var(--signal-success)]' : hasLoss ? 'text-destructive' : 'text-muted-foreground'}`}>
            {hasGain && <TrendingUp className="size-3.5" />}
            {hasLoss && <TrendingDown className="size-3.5" />}
            {hasGain ? '+' : ''}{data.gainLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {/* Card count */}
      <div>
        <span className="block text-[length:var(--fs-xs)] text-muted-foreground">Cards</span>
        <span className="text-[length:var(--fs-md)] font-medium text-foreground">
          {data.cardCount.toLocaleString()}
        </span>
      </div>

      {/* Top card */}
      {data.topCards.length > 0 && (
        <div className="hidden sm:block">
          <span className="block text-[length:var(--fs-xs)] text-muted-foreground">Most Valuable</span>
          <span className="text-[length:var(--fs-md)] font-medium text-foreground">
            {data.topCards[0].cardName} · ${data.topCards[0].totalValue.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  )
}
