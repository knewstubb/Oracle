'use client'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { CardImage } from '@/components/CardImage'
import { cardCountView, type RailCard } from '@/lib/deck-rail-stats'
import { FOCUS_RING } from '@/components/deck-strategy/focus'
import { CARD_SURFACE_CLASS, CARD_SURFACE_STYLE } from '@/lib/ui-tokens'
import { cn } from '@/lib/utils'
import { RailCommander, type RailCommanderRow } from './RailCommander'
import { RailCards, type RailAllCard } from './RailCards'
import { RailHealth } from './RailHealth'
import { RailCurve } from './RailCurve'
import { RailColourNeeds } from './RailColourNeeds'

export interface DeckRailProps {
  deck: {
    id: number
    name: string
    commander_scryfall_id: string | null
    colour_identity: string | null
    deck_type: string | null
    is_precon_mod?: boolean
  }
  /** Commanders in command-zone order (primary first; a companion is not one). Empty when no commander is chosen. */
  commanders: RailCommanderRow[]
  /** Main-deck cards (Maybeboard and Sideboard left out), for the curve and colour needs. */
  cards: RailCard[]
  totalCards: number
  deckSize: number | null
  /** Every deck row (Maybeboard and companion included) for "Outside the 100" and the buy line. */
  allCards?: RailAllCard[]
  /** Printing id of the second commander (partner or background), shown beside the first one's art. */
  secondCommanderScryfallId?: string | null
  totalValue?: number
  /** The Strategy block, mounted by the page. */
  strategySlot: React.ReactNode
}

export function DeckRail({ deck, commanders, cards, totalCards, deckSize, allCards, secondCommanderScryfallId, totalValue, strategySlot }: DeckRailProps) {
  const [expanded, setExpanded] = useState(false)
  const { label, over } = cardCountView(totalCards, deckSize)
  const commanderNames = commanders.map((c) => c.name)
  const hasCommander = commanders.length > 0 && !!deck.commander_scryfall_id
  const secondArt = secondCommanderScryfallId && secondCommanderScryfallId !== deck.commander_scryfall_id ? secondCommanderScryfallId : null
  const isPrecon = deck.is_precon_mod || deck.deck_type === 'Precon Mod'

  return (
    <aside aria-label="Deck summary" className="w-full shrink-0 border-b @[800px]:sticky @[800px]:top-0 @[800px]:h-full @[800px]:w-[352px] @[800px]:overflow-y-auto @[800px]:border-b-0 @[800px]:px-6 @[800px]:pb-6 @[800px]:pt-2">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="deck-rail-body"
        onClick={() => setExpanded((v) => !v)}
        className={`flex h-16 w-full items-center gap-3 px-4 text-left @[800px]:hidden ${FOCUS_RING}`}
      >
        {hasCommander && (
          <span className="h-10 w-10 shrink-0 overflow-hidden rounded">
            <CardImage scryfallId={deck.commander_scryfall_id!} alt="" width={40} height={40} artCrop noPreview className="h-10 w-10 object-cover" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[length:var(--fs-md)] font-medium">{deck.name}</span>
          <span className="block text-[length:var(--fs-sm)] text-muted-foreground">
            {label}{over > 0 ? ` · ${over} over` : ''}
          </span>
        </span>
        <ChevronDown size={18} aria-hidden="true" className={expanded ? 'rotate-180' : ''} />
        <span className="sr-only">{expanded ? 'Hide deck summary' : 'Show deck summary'}</span>
      </button>
      <div id="deck-rail-body" className={`${expanded ? 'block' : 'hidden'} px-4 pb-4 @[800px]:block @[800px]:p-0`}>
        <div className={cn(CARD_SURFACE_CLASS, 'overflow-hidden')} style={CARD_SURFACE_STYLE} data-testid="rail-card">
          {hasCommander ? (
            <div className="flex w-full" data-testid="rail-art">
              <div className="min-w-0 flex-1">
                <CardImage scryfallId={deck.commander_scryfall_id!} alt={`${commanderNames[0]} card art`} width={secondArt ? 152 : 304} height={secondArt ? 111 : 222} artCrop noPreview className="block h-auto w-full object-cover" />
              </div>
              {secondArt && (
                <div className="min-w-0 flex-1">
                  <CardImage scryfallId={secondArt} alt={`${commanderNames[1] ?? 'Partner'} card art`} width={152} height={111} artCrop noPreview className="block h-auto w-full object-cover" />
                </div>
              )}
            </div>
          ) : null}
          <div className="p-5">
            <h1 className="break-words text-[length:var(--fs-xl)] font-semibold leading-tight">{deck.name}</h1>
            {isPrecon && (
              <span
                className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--fs-sm)] font-medium"
                style={{ background: 'var(--signal-warning-bg)', color: 'var(--signal-warning)' }}
              >
                Precon mod
              </span>
            )}
          </div>
          <RailCommander commanders={commanders} combinedIdentity={deck.colour_identity ?? commanders.map((c) => c.colourIdentity ?? '').join('')} />
          <div className="border-t border-white/[0.08] p-5">{strategySlot}</div>
          <RailCards deckId={deck.id} totalCards={totalCards} deckSize={deckSize} allCards={allCards} totalValue={totalValue} />
          <RailHealth deckId={deck.id} />
          <RailCurve cards={cards} />
          <RailColourNeeds cards={cards} colourIdentity={deck.colour_identity} />
        </div>
      </div>
    </aside>
  )
}
