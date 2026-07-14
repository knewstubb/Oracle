'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { CardImage } from '@/components/CardImage'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ProxyAllocationPanel } from '@/components/ProxyAllocationPanel'
import { cn } from '@/lib/utils'

export interface SharedCardDeck {
  id: number
  name: string
  is_proxy: boolean
}

export interface SharedCardData {
  card_name: string
  set_code: string
  scryfall_id: string
  deck_count: number
  owned_this_printing: number
  owned_total: number
  needing_proxies: boolean
  decks: SharedCardDeck[]
  // Legacy compat
  owned_copies?: number
}

interface SharedCardRowProps {
  card: SharedCardData
  collectionSynced?: boolean
}

export function SharedCardRow({ card, collectionSynced = true }: SharedCardRowProps) {
  const [expanded, setExpanded] = useState(false)
  const ownedCount = card.owned_this_printing ?? card.owned_copies ?? 0
  const isZeroOwned = ownedCount === 0

  return (
    <div role="listitem">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`${card.card_name} (${(card.set_code || 'unknown').toUpperCase()}), in ${card.deck_count} decks`}
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm',
          'transition-all duration-150 hover:bg-muted/50 hover:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'motion-reduce:transition-none'
        )}
      >
        {/* Card art */}
        <div className="shrink-0">
          <CardImage
            scryfallId={card.scryfall_id}
            alt={`${card.card_name} (${(card.set_code || '').toUpperCase()}) card art`}
            width={48}
            height={48}
            className="rounded"
          />
        </div>

        {/* Name + set code */}
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[length:var(--fs-base)] font-medium text-foreground">
            {card.card_name}
          </span>
          {card.set_code && (
            <span className="text-[length:var(--fs-sm)] text-muted-foreground uppercase">
              {card.set_code}
            </span>
          )}
        </div>

        {/* Deck badges */}
        <div className="flex flex-wrap items-center gap-1">
          {card.decks.map((deck) => (
            <Badge key={deck.id} variant="secondary" className="text-[length:var(--fs-sm)]">
              {deck.name}
            </Badge>
          ))}
        </div>

        {/* Owned count — red if 0, hidden if no collection */}
        <div className="flex shrink-0 items-center gap-1.5 text-[length:var(--fs-sm)]">
          {collectionSynced ? (
            <span
              className={cn(
                'font-medium tabular-nums',
                isZeroOwned ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              Owned: {ownedCount}
            </span>
          ) : (
            <span className="text-muted-foreground/50">
              In {card.deck_count} {card.deck_count === 1 ? 'deck' : 'decks'}
            </span>
          )}
          {card.needing_proxies && (
            <Tooltip>
              <TooltipTrigger
                render={<span />}
                aria-label={`${card.card_name} needs proxies — in ${card.deck_count} decks, own ${card.owned_total ?? ownedCount} total`}
              >
                <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>
                Needs proxies — in {card.deck_count} decks, own {card.owned_total ?? ownedCount} total
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </button>

      {expanded && (
        <ProxyAllocationPanel
          card={{
            ...card,
            owned_copies: ownedCount,
          }}
          onSuccess={() => setExpanded(false)}
          onCancel={() => setExpanded(false)}
        />
      )}
    </div>
  )
}
