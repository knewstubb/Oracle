'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ArrowLeftRight,
  ListFilter,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProxyBadge } from '@/components/ProxyBadge'
import { cn } from '@/lib/utils'
import type { DeckSkeleton, CategoryGroup, CardEntry, RefinementAction } from '@/types/brew'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BrewSkeletonPanelProps {
  skeleton: DeckSkeleton
  onRefine: (action: RefinementAction) => void
  onSave: () => void
  isRefining: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BrewSkeletonPanel({
  skeleton,
  onRefine,
  onSave,
  isRefining,
}: BrewSkeletonPanelProps) {
  // All categories expanded by default
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(skeleton.categories.map((cat) => [cat.name, true]))
  )

  function toggleCategory(name: string) {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2">
      {/* Summary bar */}
      <SkeletonSummary skeleton={skeleton} />

      {/* Category sections */}
      <div className="flex flex-col gap-1">
        {skeleton.categories.map((category) => (
          <CategorySection
            key={category.name}
            category={category}
            isExpanded={expanded[category.name] ?? true}
            onToggle={() => toggleCategory(category.name)}
            onRefine={onRefine}
            isRefining={isRefining}
          />
        ))}
      </div>

      {/* Save button */}
      <div className="sticky bottom-0 mt-auto pt-2">
        <Button
          onClick={onSave}
          disabled={isRefining}
          className="w-full bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
        >
          Save Deck
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary Bar
// ---------------------------------------------------------------------------

function SkeletonSummary({ skeleton }: { skeleton: DeckSkeleton }) {
  return (
    <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.06)] p-2">
      <p className="text-xs font-medium text-white">
        {skeleton.totalCards}/100 cards
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {skeleton.categories.map((cat) => (
          <span
            key={cat.name}
            className="inline-block rounded bg-[rgba(255,255,255,0.08)] px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            {cat.name} {cat.cards.length}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category Section
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  category: CategoryGroup
  isExpanded: boolean
  onToggle: () => void
  onRefine: (action: RefinementAction) => void
  isRefining: boolean
}

function CategorySection({
  category,
  isExpanded,
  onToggle,
  onRefine,
  isRefining,
}: CategorySectionProps) {
  const allAccepted = category.cards.every((c) => c.accepted)

  return (
    <div className="rounded-md border border-[rgba(255,255,255,0.06)]">
      {/* Category header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-left hover:bg-[rgba(255,255,255,0.04)]"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 text-xs font-medium text-white">
          {category.name}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {category.cards.length}
        </span>
      </button>

      {/* Category content */}
      {isExpanded && (
        <div className="border-t border-[rgba(255,255,255,0.04)] px-1 pb-1">
          {/* Card rows */}
          {category.cards.map((card) => (
            <CardRow
              key={card.cardName}
              card={card}
              category={category.name}
              onRefine={onRefine}
              isRefining={isRefining}
            />
          ))}

          {/* Accept category button */}
          {!allAccepted && (
            <button
              onClick={() =>
                onRefine({ type: 'accept', category: category.name })
              }
              disabled={isRefining}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded py-1 text-[10px] text-teal-400 hover:bg-[rgba(255,255,255,0.04)] disabled:opacity-50"
            >
              <Check className="h-3 w-3" />
              Accept
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card Row
// ---------------------------------------------------------------------------

interface CardRowProps {
  card: CardEntry
  category: string
  onRefine: (action: RefinementAction) => void
  isRefining: boolean
}

function CardRow({ card, category, onRefine, isRefining }: CardRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded px-1 py-0.5 text-xs',
        card.accepted && 'opacity-60'
      )}
    >
      {/* Card name */}
      <span className="min-w-0 flex-1 truncate text-white">{card.cardName}</span>

      {/* Badges and indicators */}
      <div className="flex shrink-0 items-center gap-0.5">
        {/* Ownership indicator */}
        {card.ownershipStatus === 'proxy_candidate' && (
          <ProxyBadge className="h-4 scale-75 text-[9px]" />
        )}
        {card.ownershipStatus === 'owned' && (
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" title="Owned" />
        )}

        {/* Price */}
        {card.price != null && (
          <span className="text-[10px] text-muted-foreground">
            ${card.price.toFixed(2)}
          </span>
        )}

        {/* Proxy conflict */}
        {card.proxyConflict && (
          <span
            className="text-[10px] text-amber-400"
            title={`Conflict: ${card.proxyConflict.deckName}`}
          >
            ⚠
          </span>
        )}

        {/* Over budget */}
        {card.overBudget && (
          <AlertTriangle className="h-3 w-3 text-red-400" />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={() =>
            onRefine({
              type: 'swap',
              category,
              oldCard: card.cardName,
              newCard: '',
            })
          }
          disabled={isRefining}
          className="rounded p-0.5 text-muted-foreground hover:bg-[rgba(255,255,255,0.08)] hover:text-white disabled:opacity-50"
          title="Swap card"
        >
          <ArrowLeftRight className="h-3 w-3" />
        </button>
        <button
          onClick={() =>
            onRefine({
              type: 'alternatives',
              category,
              targetCard: card.cardName,
            })
          }
          disabled={isRefining}
          className="rounded p-0.5 text-muted-foreground hover:bg-[rgba(255,255,255,0.08)] hover:text-white disabled:opacity-50"
          title="Request alternatives"
        >
          <ListFilter className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
