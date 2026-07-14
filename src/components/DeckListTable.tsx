'use client'

import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OwnershipBadge } from '@/components/OwnershipBadge'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Search } from 'lucide-react'
import type { DeckCard } from '@/components/CardGrid'

interface DeckListTableProps {
  cards: DeckCard[]
}

type SortField = 'quantity' | 'card_name' | 'category' | 'set_code' | 'status' | 'health'
type SortDir = 'asc' | 'desc'

type DeadWeightFlag = 'redundant' | 'off_strategy' | 'bracket_mismatch' | 'format_violation'

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
    label: 'Bracket Mismatch',
  },
  format_violation: {
    bg: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    label: 'Format Violation',
  },
}

function getCategory(card: DeckCard): string {
  if (card.is_commander) return 'Commander'
  const raw = card.categories || ''
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
  } catch {
    // Fall through to comma split
  }
  const first = raw.split(',')[0]?.trim() || 'Uncategorized'
  return first.replace(/\(top\)|\(bottom\)/gi, '').trim() || 'Uncategorized'
}

function getOwnershipStatus(card: DeckCard): 'original' | 'proxy' | 'not_owned' {
  if (card.allocation_role === 'proxy') return 'proxy'
  if (card.allocation_role === 'not_owned') return 'not_owned'
  return 'original'
}

function DeadWeightBadge({
  card,
  deckId,
  onDismissed,
}: {
  card: DeckCard
  deckId: number
  onDismissed: (cardName: string) => void
}) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const flag = card.dead_weight_flag as DeadWeightFlag
  const style = FLAG_STYLES[flag]

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/dead-weight/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_name: card.card_name }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to dismiss')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId), 'dead-weight'] })
      setOpen(false)
      onDismissed(card.card_name)
    },
  })

  if (!style) return null

  return (
    <Popover open={open} onOpenChange={(value) => setOpen(value)}>
      <PopoverTrigger
        className="cursor-pointer"
        aria-label={`${style.label} flag for ${card.card_name}`}
      >
        <Badge
          variant="secondary"
          className={cn('text-[length:var(--fs-sm)] cursor-pointer', style.bg)}
        >
          {style.label}
        </Badge>
      </PopoverTrigger>
      <PopoverContent side="left" className="w-64">
        <PopoverHeader>
          <PopoverTitle>{style.label}</PopoverTitle>
          <PopoverDescription>
            {card.dead_weight_reason || 'No additional details.'}
          </PopoverDescription>
        </PopoverHeader>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          onClick={() => dismissMutation.mutate()}
          disabled={dismissMutation.isPending}
        >
          {dismissMutation.isPending ? 'Dismissing...' : 'Dismiss'}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

export function DeckListTable({ cards }: DeckListTableProps) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('category')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [dismissedCards, setDismissedCards] = useState<Set<string>>(new Set())

  // Derive deckId from first card
  const deckId = cards[0]?.deck_id ?? 0

  // Filter out Maybeboard/Sideboard
  const activeCards = useMemo(() => {
    return cards.filter(c => {
      const cat = getCategory(c)
      return cat !== 'Maybeboard' && cat !== 'Sideboard'
    })
  }, [cards])

  // Apply search filter
  const filtered = useMemo(() => {
    if (!search) return activeCards
    const q = search.toLowerCase()
    return activeCards.filter(c =>
      c.card_name.toLowerCase().includes(q) ||
      getCategory(c).toLowerCase().includes(q) ||
      (c.set_code || '').toLowerCase().includes(q)
    )
  }, [activeCards, search])

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'quantity':
          cmp = (a.quantity || 1) - (b.quantity || 1)
          break
        case 'card_name':
          cmp = a.card_name.localeCompare(b.card_name)
          break
        case 'category': {
          const catA = getCategory(a)
          const catB = getCategory(b)
          // Commander always first
          if (catA === 'Commander' && catB !== 'Commander') return -1
          if (catB === 'Commander' && catA !== 'Commander') return 1
          cmp = catA.localeCompare(catB)
          if (cmp === 0) cmp = a.card_name.localeCompare(b.card_name)
          break
        }
        case 'set_code':
          cmp = (a.set_code || '').localeCompare(b.set_code || '')
          break
        case 'status':
          cmp = getOwnershipStatus(a).localeCompare(getOwnershipStatus(b))
          break
        case 'health': {
          // Flagged cards first, then by flag type
          const flagA = a.dead_weight_flag && !dismissedCards.has(a.card_name) ? a.dead_weight_flag : ''
          const flagB = b.dead_weight_flag && !dismissedCards.has(b.card_name) ? b.dead_weight_flag : ''
          cmp = flagB.localeCompare(flagA) // flagged first (non-empty > empty)
          break
        }
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [filtered, sortField, sortDir, dismissedCards])

  // Totals
  const totalCards = activeCards.reduce((sum, c) => sum + (c.quantity || 1), 0)
  const proxyCount = activeCards.filter(c => getOwnershipStatus(c) === 'proxy').reduce((sum, c) => sum + (c.quantity || 1), 0)

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function handleDismissed(cardName: string) {
    setDismissedCards(prev => new Set([...Array.from(prev), cardName]))
  }

  function SortHeader({ field, children }: { field: SortField; children: React.ReactNode }) {
    const active = sortField === field
    return (
      <th
        className={cn(
          'cursor-pointer select-none px-3 py-2 text-left text-[length:var(--fs-sm)] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground',
          active && 'text-foreground'
        )}
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {active && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
        </span>
      </th>
    )
  }

  return (
    <div className="space-y-3">
      {/* Summary + Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-[length:var(--fs-md)] text-muted-foreground">
          <span className="font-medium text-foreground">{totalCards}</span> cards
          {proxyCount > 0 && (
            <> • <span className="font-medium text-amber-600 dark:text-amber-400">{proxyCount}</span> proxies</>
          )}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Filter cards..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border">
        <table className="w-full text-[length:var(--fs-base)]">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <SortHeader field="quantity">Qty</SortHeader>
              <SortHeader field="card_name">Card</SortHeader>
              <SortHeader field="category">Category</SortHeader>
              <SortHeader field="set_code">Set</SortHeader>
              <SortHeader field="status">Status</SortHeader>
              <SortHeader field="health">Health</SortHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map(card => {
              const category = getCategory(card)
              const hasFlag = card.dead_weight_flag && !dismissedCards.has(card.card_name)
              return (
                <tr
                  key={card.id}
                  className="transition-colors hover:bg-muted/30"
                >
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {card.quantity || 1}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {card.card_name}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {category}
                  </td>
                  <td className="px-3 py-2 font-mono text-[length:var(--fs-sm)] uppercase text-muted-foreground">
                    {card.set_code || ''}
                  </td>
                  <td className="px-3 py-2">
                    <OwnershipBadge status={getOwnershipStatus(card)} />
                  </td>
                  <td className="px-3 py-2">
                    {hasFlag && (
                      <DeadWeightBadge
                        card={card}
                        deckId={deckId}
                        onDismissed={handleDismissed}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="border-t border-border bg-muted/50">
            <tr>
              <td className="px-3 py-2 font-medium tabular-nums">{totalCards}</td>
              <td className="px-3 py-2 font-medium">Total</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2">
                {proxyCount > 0 && (
                  <span className="text-[length:var(--fs-sm)] text-amber-600 dark:text-amber-400">
                    {proxyCount} proxies
                  </span>
                )}
              </td>
              <td className="px-3 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
