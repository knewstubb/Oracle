'use client'

import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, Plus, Minus, ExternalLink } from 'lucide-react'

interface CardInfo {
  name: string
  set?: string
  rarity?: string
  price?: number
}

interface PreconDiffData {
  isPreconMod: boolean
  preconUrl?: string
  preconCardCount?: number
  currentCardCount?: number
  added?: CardInfo[]
  removed?: CardInfo[]
  swapCount?: number
  compliance?: {
    swapsUsed: number
    swapLimit: number
    swapsOk: boolean
    solRingRemoved: boolean
    solRingOk: boolean
    rarityBreakdown: { mythic: number; rare: number; uncommon: number; common: number }
    rarityOk: boolean
    totalValue: number
    valueLimit: number
    valueOk: boolean
  }
  error?: string
}

interface PreconDiffPanelProps {
  deckId: number
}

function rarityBadge(rarity?: string) {
  if (!rarity) return null
  const colors: Record<string, string> = {
    mythic: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    rare: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    uncommon: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    common: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }
  return (
    <Badge variant="outline" className={`text-[10px] uppercase ${colors[rarity.toLowerCase()] || ''}`}>
      {rarity.charAt(0).toUpperCase()}
    </Badge>
  )
}

export function PreconDiffPanel({ deckId }: PreconDiffPanelProps) {
  const { data, isLoading, error } = useQuery<PreconDiffData>({
    queryKey: ['precon-diff', deckId],
    queryFn: () =>
      fetch(`/api/decks/${deckId}/precon-diff`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <AlertCircle className="size-4" />
        Failed to load precon diff
      </div>
    )
  }

  if (!data.isPreconMod) {
    return (
      <div className="text-sm text-muted-foreground">
        This deck is not a precon modification.
      </div>
    )
  }

  if (!data.added || !data.removed) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Precon card list not loaded yet. The original precon needs to be imported.
        </p>
        {data.preconUrl && (
          <a
            href={data.preconUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            View source precon on Archidekt
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    )
  }

  const { added, removed, swapCount, preconUrl, compliance } = data
  const podLimit = 10
  const isOverLimit = (swapCount || 0) > podLimit

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-4">
        <Badge variant={isOverLimit ? 'secondary' : 'outline'} className={isOverLimit ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : ''}>
          {swapCount}/{podLimit} swaps
        </Badge>
        <span className="text-sm text-muted-foreground">
          {added.length} added • {removed.length} removed
        </span>
        {preconUrl && (
          <a
            href={preconUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Source precon
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      {/* Compliance Summary */}
      {compliance && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="mb-3 text-sm font-medium">Pod Compliance</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ComplianceItem
              label="Swaps"
              value={`${compliance.swapsUsed}/${compliance.swapLimit}`}
              ok={compliance.swapsOk}
            />
            <ComplianceItem
              label="Sol Ring"
              value={compliance.solRingRemoved ? 'Removed' : 'Still present'}
              ok={compliance.solRingOk}
            />
            <ComplianceItem
              label="Rarity"
              value={`${compliance.rarityBreakdown.mythic}M / ${compliance.rarityBreakdown.rare}R / ${compliance.rarityBreakdown.uncommon}U / ${compliance.rarityBreakdown.common}C`}
              ok={compliance.rarityOk}
            />
            <ComplianceItem
              label="Total Value"
              value={`$${compliance.totalValue.toFixed(2)} / $${compliance.valueLimit}`}
              ok={compliance.valueOk}
            />
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Cards Added */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Plus className="size-4 text-green-600 dark:text-green-400" />
            Cards Added ({added.length})
          </h3>
          <div className="rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Card</th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Set</th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Rarity</th>
                  <th className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {added.map(card => (
                  <tr key={card.name} className="hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-1.5 shrink-0 rounded-full bg-green-500" />
                        {card.name}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs uppercase text-muted-foreground">
                      {card.set || '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      {rarityBadge(card.rarity)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {card.price ? `$${card.price.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
                {added.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No cards added</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cards Removed */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Minus className="size-4 text-red-600 dark:text-red-400" />
            Cards Removed ({removed.length})
          </h3>
          <div className="rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Card</th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Rarity</th>
                  <th className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {removed.map(card => (
                  <tr key={card.name} className="hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-1.5 shrink-0 rounded-full bg-red-500" />
                        {card.name}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      {rarityBadge(card.rarity)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {card.price ? `$${card.price.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
                {removed.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No cards removed</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}


function ComplianceItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={cn(
      'rounded-md border px-3 py-2',
      ok ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
    )}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-medium', ok ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400')}>
        {ok ? '✅' : '⚠️'} {value}
      </div>
    </div>
  )
}
