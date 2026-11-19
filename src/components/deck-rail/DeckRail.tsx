'use client'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { CardImage } from '@/components/CardImage'
import { cardCountView, type RailCard } from '@/lib/deck-rail-stats'
import { FOCUS_RING } from '@/components/deck-strategy/focus'
import { RailCommander } from './RailCommander'
import { RailCards } from './RailCards'
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
    salt_score?: number | null
  }
  /** Commander names (second one for partner or background). Empty when no commander is chosen. */
  commanderNames: string[]
  /** Main-deck cards (Maybeboard and Sideboard left out), for the curve and colour needs. */
  cards: RailCard[]
  totalCards: number
  deckSize: number | null
  hasCompanion?: boolean
  totalValue?: number
  /** The Strategy block, mounted by the page. */
  strategySlot: React.ReactNode
}

export function DeckRail({ deck, commanderNames, cards, totalCards, deckSize, hasCompanion, totalValue, strategySlot }: DeckRailProps) {
  const [expanded, setExpanded] = useState(false)
  const { label, over } = cardCountView(totalCards, deckSize)
  const hasCommander = commanderNames.length > 0 && !!deck.commander_scryfall_id
  const isPrecon = deck.is_precon_mod || deck.deck_type === 'Precon Mod'

  return (
    <aside aria-label="Deck summary" className="w-full shrink-0 border-b @[800px]:sticky @[800px]:top-0 @[800px]:h-full @[800px]:w-[304px] @[800px]:overflow-y-auto @[800px]:border-b-0 @[800px]:border-r">
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
      <div id="deck-rail-body" className={`${expanded ? 'block' : 'hidden'} space-y-5 px-4 py-4 @[800px]:block`}>
        {hasCommander ? (
          <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-lg">
            <CardImage scryfallId={deck.commander_scryfall_id!} alt={`${commanderNames[0]} card art`} width={220} height={307} noPreview className="h-auto w-full object-cover" />
          </div>
        ) : null}
        <div>
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
        <RailCommander names={commanderNames} colourIdentity={deck.colour_identity} saltScore={deck.salt_score} />
        {strategySlot}
        <RailCards deckId={deck.id} totalCards={totalCards} deckSize={deckSize} hasCompanion={hasCompanion} totalValue={totalValue} />
        <RailHealth deckId={deck.id} />
        <RailCurve cards={cards} />
        <RailColourNeeds cards={cards} colourIdentity={deck.colour_identity} />
      </div>
    </aside>
  )
}
