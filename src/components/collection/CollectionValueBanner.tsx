'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

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
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { data, isLoading } = useQuery<CollectionValue>({
    queryKey: ['collection-value'],
    queryFn: () => fetch('/api/collection/value').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  async function handleRefreshPrices() {
    setIsRefreshing(true)
    try {
      const res = await fetch('/api/collection/refresh-prices', { method: 'POST' })
      if (!res.ok) {
        toast.error('Failed to refresh prices')
        return
      }
      const result = await res.json()
      toast.success(`Updated prices for ${result.updated} cards`)
      queryClient.invalidateQueries({ queryKey: ['collection-value'] })
    } catch {
      toast.error('Failed to refresh prices')
    } finally {
      setIsRefreshing(false)
    }
  }

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

      {/* Refresh prices button */}
      <div className="ml-auto">
        <button
          onClick={handleRefreshPrices}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[length:var(--fs-xs)] font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refresh market prices from Scryfall"
        >
          <RefreshCw className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh Prices'}</span>
        </button>
      </div>
    </div>
  )
}
