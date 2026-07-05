'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeftRight,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DeadWeightFlag = 'redundant' | 'off_strategy' | 'bracket_mismatch' | 'format_violation'
type BudgetMode = 'collection' | 'budget' | 'unrestricted'

interface UpgradeItem {
  cardName: string
  role: string
  synergyScore: number
  reason: string
  owned: boolean
  price: number | null
  suggestedCut: string | null
  cutFlag: DeadWeightFlag | null
}

interface UpgradeResponse {
  budgetMode: BudgetMode
  budgetCeiling?: number | null
  upgrades: UpgradeItem[]
}

interface RecommendationsPanelProps {
  deckId: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FLAG_STYLES: Record<DeadWeightFlag, { bg: string; label: string }> = {
  redundant: {
    bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    label: 'Redundant',
  },
  off_strategy: {
    bg: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    label: 'Off Strategy',
  },
  bracket_mismatch: {
    bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    label: 'Bracket',
  },
  format_violation: {
    bg: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    label: 'Format',
  },
}

const BUDGET_MODES: { value: BudgetMode; label: string }[] = [
  { value: 'collection', label: 'Collection' },
  { value: 'budget', label: 'Budget' },
  { value: 'unrestricted', label: 'Unrestricted' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScryfallSmallUrl(name: string): string {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=small`
}

/**
 * Client-side budget filter matching the server-side logic.
 */
function filterByBudgetMode(
  upgrades: UpgradeItem[],
  mode: BudgetMode,
  budgetCeiling: number | null
): UpgradeItem[] {
  switch (mode) {
    case 'collection':
      return upgrades.filter((u) => u.owned)
    case 'budget':
      return upgrades.filter(
        (u) => u.owned || (u.price !== null && budgetCeiling !== null && u.price <= budgetCeiling)
      )
    case 'unrestricted':
      return upgrades
    default:
      return upgrades
  }
}

/**
 * Sort: owned first, then synergy descending within each group.
 */
function sortUpgrades(upgrades: UpgradeItem[]): UpgradeItem[] {
  return [...upgrades].sort((a, b) => {
    if (a.owned && !b.owned) return -1
    if (!a.owned && b.owned) return 1
    return b.synergyScore - a.synergyScore
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecommendationsPanel({ deckId }: RecommendationsPanelProps) {
  const [budgetMode, setBudgetMode] = useState<BudgetMode>('unrestricted')

  const { data, isLoading, isError, error, refetch } = useQuery<UpgradeResponse | null>({
    queryKey: ['decks', deckId, 'upgrade'],
    queryFn: async () => {
      const r = await fetch(`/api/decks/${deckId}/upgrade`)
      if (r.status === 404) return null
      if (!r.ok) throw new Error('Failed to load upgrade suggestions')
      return r.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Set initial budget mode from server data when available
  const serverBudgetMode = data?.budgetMode
  const budgetCeiling = data?.budgetCeiling ?? null

  // Client-side filtering and sorting (no new API call on toggle change)
  const displayedUpgrades = useMemo(() => {
    if (!data?.upgrades) return []
    const filtered = filterByBudgetMode(data.upgrades, budgetMode, budgetCeiling)
    return sortUpgrades(filtered)
  }, [data?.upgrades, budgetMode, budgetCeiling])

  // ---- Loading state ----
  if (isLoading) {
    return (
      <div className="mx-auto max-w-[900px]">
        <div className="flex flex-col items-center gap-4 py-16" aria-live="polite">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Loading upgrade suggestions...</p>
        </div>
      </div>
    )
  }

  // ---- Error state ----
  if (isError) {
    return (
      <div className="mx-auto max-w-[900px]">
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            Failed to load suggestions: {error instanceof Error ? error.message : 'Unknown error'}
          </span>
          <Button variant="destructive" size="sm" onClick={() => refetch()}>
            <RefreshCw className="size-3.5" aria-hidden="true" data-icon="inline-start" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // ---- Empty state (no upgrade data generated) ----
  if (!data) {
    return (
      <div className="mx-auto max-w-[900px]">
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <Sparkles className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No upgrade suggestions generated yet. Run the upgrade engine to get personalised recommendations.
          </p>
        </div>
      </div>
    )
  }

  // ---- Success state ----
  return (
    <div className="mx-auto max-w-[900px] space-y-6 pb-12" role="region" aria-label="Upgrade recommendations">
      {/* Budget Mode Toggle (SegmentedControl) */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Paired Swap Suggestions</h2>
        <SegmentedControl
          value={budgetMode}
          onChange={setBudgetMode}
          options={BUDGET_MODES}
        />
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {displayedUpgrades.length} suggestion{displayedUpgrades.length !== 1 ? 's' : ''} shown
        {budgetMode !== 'unrestricted' && ` (${budgetMode} filter active)`}
      </p>

      {/* No results after filtering */}
      {displayedUpgrades.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Sparkles className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No suggestions match the current filter. Try switching to a less restrictive mode.
          </p>
        </div>
      )}

      {/* Paired Swap Cards */}
      <div className="space-y-3">
        {displayedUpgrades.map((upgrade) => (
          <PairedSwapRow key={upgrade.cardName} upgrade={upgrade} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SegmentedControl
// ---------------------------------------------------------------------------

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: BudgetMode
  onChange: (v: BudgetMode) => void
  options: { value: BudgetMode; label: string }[]
}) {
  return (
    <div
      className="inline-flex items-center rounded-lg bg-muted p-1"
      role="radiogroup"
      aria-label="Budget mode filter"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          role="radio"
          aria-checked={value === opt.value}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PairedSwapRow
// ---------------------------------------------------------------------------

function PairedSwapRow({ upgrade }: { upgrade: UpgradeItem }) {
  return (
    <div className="flex items-stretch gap-2 rounded-lg border border-border p-3">
      {/* Add Card (left side) */}
      <div className="flex flex-1 items-center gap-3">
        <img
          src={getScryfallSmallUrl(upgrade.cardName)}
          alt={`${upgrade.cardName} card art`}
          className="size-12 shrink-0 rounded object-cover"
          loading="lazy"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium">{upgrade.cardName}</span>
            {/* Ownership badge */}
            {upgrade.owned ? (
              <Badge className="border-green-500 bg-green-100 text-green-800 text-[10px] dark:bg-green-900/30 dark:text-green-300">
                Owned
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                Buy
              </Badge>
            )}
          </div>
          {/* Synergy score + price */}
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{Math.round(upgrade.synergyScore)}% synergy</span>
            {!upgrade.owned && upgrade.price !== null && (
              <span className="font-medium">${upgrade.price.toFixed(2)}</span>
            )}
          </div>
          {upgrade.reason && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{upgrade.reason}</p>
          )}
        </div>
      </div>

      {/* Arrow separator */}
      <div className="flex shrink-0 items-center px-2">
        <ArrowLeftRight className="size-4 text-muted-foreground" aria-label="swaps with" />
      </div>

      {/* Cut Card (right side) */}
      <div className="flex flex-1 items-center gap-3">
        {upgrade.suggestedCut ? (
          <>
            <img
              src={getScryfallSmallUrl(upgrade.suggestedCut)}
              alt={`${upgrade.suggestedCut} card art`}
              className="size-12 shrink-0 rounded object-cover"
              loading="lazy"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-medium">{upgrade.suggestedCut}</span>
                {/* Dead weight flag badge */}
                {upgrade.cutFlag && (
                  <Badge className={cn('text-[10px]', FLAG_STYLES[upgrade.cutFlag].bg)}>
                    {FLAG_STYLES[upgrade.cutFlag].label}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Suggested cut</p>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center">
            <span className="text-xs text-muted-foreground italic">No paired cut</span>
          </div>
        )}
      </div>
    </div>
  )
}
