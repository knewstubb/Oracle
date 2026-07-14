'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DeckCard } from '@/components/CardGrid'

const STORAGE_KEY = 'deck-stats-collapsed'

interface DeckStatsProps {
  cards: DeckCard[]
}

/** Parse a categories field (JSON array or comma-separated) into its primary category. */
function parsePrimaryCategory(raw: string | null | undefined): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      return parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
    }
  } catch {
    // Not JSON — fall through
  }
  const first = raw.split(',')[0]?.trim() || 'Other'
  return first.replace(/\(top\)|\(bottom\)/gi, '').trim() || 'Other'
}

/** Filter out Maybeboard and Sideboard cards. */
function getActiveCards(cards: DeckCard[]): DeckCard[] {
  return cards.filter(c => {
    const cat = parsePrimaryCategory(c.categories)
    return cat !== 'Maybeboard' && cat !== 'Sideboard'
  })
}

function getTypeDistribution(cards: DeckCard[]): { type: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const card of cards) {
    const primary = parsePrimaryCategory(card.categories)
    counts[primary] = (counts[primary] || 0) + (card.quantity || 1)
  }
  return Object.entries(counts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
}

function getProxyCount(cards: DeckCard[]): number {
  return cards.filter((c) => c.allocation_role === 'proxy').reduce((sum, c) => sum + (c.quantity || 1), 0)
}

function getTotalCards(cards: DeckCard[]): number {
  return cards.reduce((sum, c) => sum + (c.quantity || 1), 0)
}

export function DeckStats({ cards }: DeckStatsProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'true') setCollapsed(true)
    } catch {
      // localStorage unavailable
    }
  }, [])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // localStorage unavailable
    }
  }

  const activeCards = getActiveCards(cards)
  const typeDistribution = getTypeDistribution(activeCards)
  const proxyCount = getProxyCount(activeCards)
  const totalCards = getTotalCards(activeCards)
  const maxTypeCount = Math.max(...typeDistribution.map((t) => t.count), 1)

  return (
    <div
      className={cn(
        'relative flex shrink-0 flex-col border-l border-border bg-card transition-all duration-200',
        'motion-reduce:transition-none',
        collapsed ? 'w-10' : 'w-80'
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand stats sidebar' : 'Collapse stats sidebar'}
        className="absolute -left-3.5 top-4 z-10 size-7 rounded-full border border-border bg-card shadow-sm"
      >
        {collapsed ? (
          <ChevronLeft className="size-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4" aria-hidden="true" />
        )}
      </Button>

      {!collapsed && (
        <div className="overflow-y-auto p-4 pt-6" role="complementary" aria-label="Deck statistics">
          {/* Total card count */}
          <div className="mb-6">
            <p className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">Total Cards</p>
            <p className="text-[length:var(--fs-3xl)] font-medium tabular-nums">{totalCards}</p>
          </div>

          {/* Proxy count */}
          <div className="mb-6">
            <p className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">Proxies</p>
            <p className="text-[length:var(--fs-3xl)] font-medium tabular-nums text-proxy">{proxyCount}</p>
          </div>

          {/* Card count by type */}
          <div className="mb-6">
            <h4 className="mb-3 text-[length:var(--fs-sm)] font-medium text-muted-foreground">Cards by Type</h4>
            <div
              className="space-y-2"
              role="list"
              aria-label="Card count by type"
            >
              {typeDistribution.map(({ type, count }) => (
                <div key={type} role="listitem" className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate text-[length:var(--fs-sm)] text-muted-foreground">
                    {type}
                  </span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-muted">
                    <div
                      className="h-full rounded-sm bg-primary/60 transition-all duration-200"
                      style={{ width: `${(count / maxTypeCount) * 100}%` }}
                      aria-label={`${type}: ${count} cards`}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-[length:var(--fs-sm)] font-medium tabular-nums">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mana curve placeholder */}
          <div>
            <h4 className="mb-2 text-[length:var(--fs-sm)] font-medium text-muted-foreground">Mana Curve</h4>
            <p className="text-[length:var(--fs-sm)] text-muted-foreground/60">
              Mana curve data not available yet.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
