'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CardImage } from '@/components/CardImage'
import { CardPopover } from '@/components/CardPopover'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { parseCategoriesCapped } from '@/lib/categoryUtils'

export interface DeckCard {
  id: number
  deck_id: number
  card_name: string
  scryfall_id: string
  set_code: string
  quantity: number
  categories: string
  tags: string
  is_commander: boolean | number
  allocation_role?: string
  dead_weight_flag?: string | null
  dead_weight_reason?: string | null
}

interface CardGridProps {
  cards: DeckCard[]
  deckId?: number | string
  isLoading?: boolean
}

type DeadWeightFlag = 'redundant' | 'off_strategy' | 'bracket_mismatch' | 'format_violation'

const FLAG_STYLES: Record<DeadWeightFlag, string> = {
  redundant: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  off_strategy: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  bracket_mismatch: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  format_violation: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
}

const FLAG_LABELS: Record<DeadWeightFlag, string> = {
  redundant: 'Redundant',
  off_strategy: 'Off Strategy',
  bracket_mismatch: 'Bracket',
  format_violation: 'Format',
}

function DeadWeightBadge({ card, deckId }: { card: DeckCard; deckId?: number | string }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/dead-weight/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_name: card.card_name }),
      })
      if (!res.ok) throw new Error('Failed to dismiss')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'dead-weight'] })
      setOpen(false)
    },
  })

  const flag = card.dead_weight_flag as DeadWeightFlag
  const styles = FLAG_STYLES[flag] || FLAG_STYLES.redundant
  const label = FLAG_LABELS[flag] || flag

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="absolute right-1 top-1 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <Badge
          variant="secondary"
          className={cn('cursor-pointer text-[length:var(--fs-xs)] font-medium shadow-sm', styles)}
        >
          {label}
        </Badge>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-64">
        <PopoverHeader>
          <PopoverTitle>{label}</PopoverTitle>
          <PopoverDescription>
            {card.dead_weight_reason || 'No reason provided.'}
          </PopoverDescription>
        </PopoverHeader>
        <Button
          size="sm"
          variant="outline"
          className="mt-1 w-full"
          onClick={(e) => {
            e.stopPropagation()
            dismissMutation.mutate()
          }}
          disabled={dismissMutation.isPending}
        >
          {dismissMutation.isPending ? 'Dismissing…' : 'Dismiss'}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function getScryfallNormalUrl(scryfallId: string): string {
  const a = scryfallId.charAt(0)
  const b = scryfallId.charAt(1)
  return `https://cards.scryfall.io/normal/front/${a}/${b}/${scryfallId}.jpg`
}

/** Group cards by their primary category (first in JSON array or comma-separated list). */
function groupByType(cards: DeckCard[]): Record<string, DeckCard[]> {
  const groups: Record<string, DeckCard[]> = {}
  for (const card of cards) {
    const primary = parseCategoriesCapped(card.categories).primary_category
    // Skip Maybeboard and Sideboard
    if (primary === 'Maybeboard' || primary === 'Sideboard') continue
    if (!groups[primary]) groups[primary] = []
    groups[primary].push(card)
  }
  return groups
}

const TYPE_ORDER = [
  'Creatures',
  'Instants',
  'Sorceries',
  'Enchantments',
  'Artifacts',
  'Planeswalkers',
  'Lands',
]

function sortedGroupEntries(groups: Record<string, DeckCard[]>): [string, DeckCard[]][] {
  const entries = Object.entries(groups)
  return entries.sort(([a], [b]) => {
    const ai = TYPE_ORDER.indexOf(a)
    const bi = TYPE_ORDER.indexOf(b)
    const aIdx = ai === -1 ? TYPE_ORDER.length : ai
    const bIdx = bi === -1 ? TYPE_ORDER.length : bi
    return aIdx - bIdx
  })
}

export function CardGrid({ cards, deckId, isLoading }: CardGridProps) {
  if (isLoading) {
    return (
      <div className="space-y-6" role="list" aria-label="Loading cards">
        {Array.from({ length: 3 }).map((_, gi) => (
          <div key={gi} role="listitem">
            <Skeleton className="mb-3 h-5 w-32" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, ci) => (
                <Skeleton key={ci} className="aspect-[5/7] w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const groups = groupByType(cards)
  const sorted = sortedGroupEntries(groups)

  return (
    <div className="space-y-6">
      {sorted.map(([type, typeCards]) => {
        const totalQty = typeCards.reduce((sum, c) => sum + (c.quantity || 1), 0)
        return (
          <section key={type} aria-label={`${type} (${totalQty})`}>
            <h3 className="mb-3 text-[length:var(--fs-md)] font-medium text-muted-foreground">
              {type} ({totalQty})
            </h3>
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
              role="list"
              aria-label={type}
            >
              {typeCards.map((card) => {
                const isProxy = card.allocation_role === 'proxy'
                const hasDeadWeight = !!card.dead_weight_flag
                return (
                <div
                  key={card.id}
                  role="listitem"
                  className={cn(
                    'group/card relative overflow-hidden rounded-lg',
                    'transition-all duration-150 ease-in-out',
                    'hover:scale-[1.02] hover:shadow-lg',
                    'motion-reduce:transition-none motion-reduce:hover:scale-100',
                    isProxy && 'ring-2 ring-pink-400 dark:ring-pink-500'
                  )}
                >
                  {hasDeadWeight && (
                    <DeadWeightBadge card={card} deckId={deckId} />
                  )}
                  <CardPopover
                    cardName={card.card_name}
                    scryfallId={card.scryfall_id}
                    setCode={card.set_code}
                    tags={card.tags}
                  >
                    {card.scryfall_id ? (
                      <CardImage
                        scryfallId={card.scryfall_id}
                        alt={`${card.card_name} — ${card.set_code?.toUpperCase() || 'Unknown'}`}
                        width={244}
                        height={340}
                        className="aspect-[5/7] w-full rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        className="flex aspect-[5/7] w-full items-center justify-center rounded-lg bg-muted text-[length:var(--fs-sm)] text-muted-foreground"
                        role="img"
                        aria-label={`${card.card_name} — ${card.set_code?.toUpperCase() || 'Unknown'}`}
                      >
                        {card.card_name}
                      </div>
                    )}
                  </CardPopover>
                </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
