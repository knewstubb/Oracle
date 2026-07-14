'use client'

import { useMemo } from 'react'
import { X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Image from 'next/image'

export interface DeckSuggestion {
  name: string
  manaCost: string
  typeLine: string
  role: string
  owned: boolean
}

interface DeckEditorProps {
  cards: DeckSuggestion[]
  onCardsChange: (cards: DeckSuggestion[]) => void
  onBack: () => void
  onCreateDeck: () => void
}

function getScryfallNormalUrl(name: string): string {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`
}

const TYPE_ORDER = [
  'Creature',
  'Instant',
  'Sorcery',
  'Enchantment',
  'Artifact',
  'Planeswalker',
  'Land',
]

function getPrimaryType(typeLine: string): string {
  for (const t of TYPE_ORDER) {
    if (typeLine.toLowerCase().includes(t.toLowerCase())) return t
  }
  return 'Other'
}

function pluralizeType(type: string): string {
  const map: Record<string, string> = {
    Creature: 'Creatures',
    Instant: 'Instants',
    Sorcery: 'Sorceries',
    Enchantment: 'Enchantments',
    Artifact: 'Artifacts',
    Planeswalker: 'Planeswalkers',
    Land: 'Lands',
  }
  return map[type] || type
}

function groupByType(cards: DeckSuggestion[]): Record<string, DeckSuggestion[]> {
  const groups: Record<string, DeckSuggestion[]> = {}
  for (const card of cards) {
    const type = getPrimaryType(card.typeLine)
    if (!groups[type]) groups[type] = []
    groups[type].push(card)
  }
  return groups
}

function sortedGroupEntries(groups: Record<string, DeckSuggestion[]>): [string, DeckSuggestion[]][] {
  return Object.entries(groups).sort(([a], [b]) => {
    const ai = TYPE_ORDER.indexOf(a)
    const bi = TYPE_ORDER.indexOf(b)
    const aIdx = ai === -1 ? TYPE_ORDER.length : ai
    const bIdx = bi === -1 ? TYPE_ORDER.length : bi
    return aIdx - bIdx
  })
}

export function DeckEditor({ cards, onCardsChange, onBack, onCreateDeck }: DeckEditorProps) {
  const groups = useMemo(() => groupByType(cards), [cards])
  const sorted = useMemo(() => sortedGroupEntries(groups), [groups])
  const cardCount = cards.length
  const isNot99 = cardCount !== 99

  function handleRemove(cardName: string) {
    onCardsChange(cards.filter((c) => c.name !== cardName))
  }

  function handleAddCards() {
    window.dispatchEvent(new CustomEvent('open-search'))
  }

  return (
    <div className="flex flex-col gap-4" data-testid="deck-editor">
      {/* Header with card count and add button */}
      <div className="flex items-center justify-between">
        <p className="text-[length:var(--fs-md)] font-medium">
          <span className={cn(isNot99 && 'text-warning')}>
            {cardCount}/99 cards
          </span>
        </p>
        <Button variant="outline" size="sm" onClick={handleAddCards}>
          <Plus className="size-4" data-icon="inline-start" />
          Add cards
        </Button>
      </div>

      {/* Card grid grouped by type */}
      <div className="space-y-6">
        {sorted.map(([type, typeCards]) => (
          <section key={type} aria-label={`${pluralizeType(type)} (${typeCards.length})`}>
            <h3 className="mb-3 text-[length:var(--fs-md)] font-medium text-muted-foreground">
              {pluralizeType(type)} ({typeCards.length})
            </h3>
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
              role="list"
              aria-label={pluralizeType(type)}
            >
              {typeCards.map((card) => (
                <div
                  key={card.name}
                  role="listitem"
                  className="group/card relative overflow-hidden rounded-lg transition-all duration-150 ease-in-out hover:scale-[1.02] hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:scale-100"
                >
                  <div className="overflow-hidden rounded-lg bg-muted">
                    <Image
                      src={getScryfallNormalUrl(card.name)}
                      alt={`${card.name} — ${card.typeLine}`}
                      width={244}
                      height={340}
                      className="aspect-[5/7] w-full object-cover"
                      unoptimized
                    />
                  </div>
                  {/* Remove button on hover */}
                  <button
                    type="button"
                    onClick={() => handleRemove(card.name)}
                    aria-label={`Remove ${card.name}`}
                    className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover/card:opacity-100 focus:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Footer buttons */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onCreateDeck}>
          Create Deck
        </Button>
      </div>
    </div>
  )
}
