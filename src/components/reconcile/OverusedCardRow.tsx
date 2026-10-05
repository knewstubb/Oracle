'use client'

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCardHoverPreview } from '@/components/CardHoverPreview'
import type { OverusedCard } from '@/lib/reconcile-overuse'

const SCRYFALL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function thumbnailUrl(scryfallId: string | null): string | null {
  if (!scryfallId || !SCRYFALL_ID_PATTERN.test(scryfallId)) return null
  return `https://cards.scryfall.io/small/front/${scryfallId.charAt(0)}/${scryfallId.charAt(1)}/${scryfallId}.jpg`
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

interface OverusedCardRowProps {
  card: OverusedCard
  /** When viewing one deck, its row is listed first and the others are marked as also wanting the card. */
  focusDeckId?: number
}

export function OverusedCardRow({ card, focusDeckId }: OverusedCardRowProps) {
  const { triggerProps } = useCardHoverPreview({ scryfallId: card.scryfallId, cardName: card.cardName })
  const thumbnail = thumbnailUrl(card.scryfallId)

  const decks = [...card.decks].sort(
    (a, b) =>
      Number(focusDeckId !== undefined && b.deckId === focusDeckId) -
        Number(focusDeckId !== undefined && a.deckId === focusDeckId) ||
      a.deckName.localeCompare(b.deckName)
  )

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] md:flex-row">
      <div className="flex shrink-0 items-start gap-3 p-3 md:w-[260px] md:border-r md:border-[var(--border-subtle)]">
        <div className="shrink-0" {...triggerProps}>
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              className="h-[88px] w-[63px] rounded-md object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="h-[88px] w-[63px] rounded-md bg-[var(--border-subtle)]" />
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[length:var(--fs-md)] font-medium leading-snug text-foreground">{card.cardName}</p>
          <p className="mt-0.5 text-[length:var(--fs-xs)] text-[var(--text-secondary)]">
            You own {plural(card.originalsOwned, 'original')}
          </p>
          <span
            className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-xs)] font-semibold"
            style={{ color: 'var(--signal-warning)', background: 'var(--signal-warning-bg)' }}
          >
            <AlertTriangle className="size-3" aria-hidden="true" />
            Wanted {card.slotsWanting}×
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)] md:border-t-0">
        {decks.map((deck) => {
          const isOther = focusDeckId !== undefined && deck.deckId !== focusDeckId
          const allSleeved = deck.sleeved >= deck.slots
          return (
            <div key={deck.deckId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {isOther && (
                  <span className="text-[length:var(--fs-xs)] text-[var(--text-secondary)]">Also wanted by</span>
                )}
                <span
                  className={cn(
                    'truncate rounded-md px-2 py-1 text-[length:var(--fs-xs)] font-medium',
                    isOther
                      ? 'border border-dashed border-[var(--border-default)] text-[var(--text-secondary)]'
                      : 'bg-white/[0.06] text-foreground'
                  )}
                >
                  {deck.deckName}
                </span>
                <span className="text-[length:var(--fs-xs)] text-[var(--text-secondary)]">
                  {deck.isActive ? 'Active' : 'Brew'}
                  {deck.slots > 1 && ` · ${deck.slots} copies`}
                </span>
              </div>
              <span
                className="rounded-full px-2.5 py-1 text-[length:var(--fs-xs)] font-medium"
                style={
                  allSleeved
                    ? { background: 'rgba(20,184,166,0.2)', color: '#14b8a6' }
                    : { background: 'rgba(239,159,39,0.2)', color: '#ef9f27' }
                }
              >
                {allSleeved
                  ? 'Sleeved'
                  : deck.sleeved > 0
                    ? `${deck.sleeved} of ${deck.slots} sleeved`
                    : 'Unsleeved'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
