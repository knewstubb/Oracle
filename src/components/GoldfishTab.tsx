'use client'

import { useState, useCallback, useMemo } from 'react'
import { RotateCcw, Plus, Shuffle, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DeckCard } from '@/components/CardGrid'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoldfishCard {
  id: string
  cardName: string
  scryfallId: string | null
  manaCost: string | null
  typeLine: string | null
}

type Zone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command'

interface GameState {
  library: GoldfishCard[]
  hand: GoldfishCard[]
  battlefield: GoldfishCard[]
  graveyard: GoldfishCard[]
  exile: GoldfishCard[]
  command: GoldfishCard[]
  turn: number
  mulliganCount: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDeck(cards: DeckCard[]): GoldfishCard[] {
  const deck: GoldfishCard[] = []
  for (const card of cards) {
    // Skip commanders (they go to command zone)
    if (card.is_commander) continue
    const qty = card.quantity ?? 1
    for (let i = 0; i < qty; i++) {
      deck.push({
        id: `${card.id}-${i}`,
        cardName: card.card_name,
        scryfallId: card.scryfall_id,
        manaCost: card.mana_cost ?? null,
        typeLine: card.type_line ?? null,
      })
    }
  }
  return deck
}

function getCommanders(cards: DeckCard[]): GoldfishCard[] {
  return cards
    .filter(c => c.is_commander)
    .map(c => ({
      id: `cmd-${c.id}`,
      cardName: c.card_name,
      scryfallId: c.scryfall_id,
      manaCost: c.mana_cost ?? null,
      typeLine: c.type_line ?? null,
    }))
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function getCardImage(scryfallId: string | null): string | null {
  if (!scryfallId) return null
  return `https://cards.scryfall.io/normal/front/${scryfallId.charAt(0)}/${scryfallId.charAt(1)}/${scryfallId}.jpg`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GoldfishTabProps {
  cards: DeckCard[]
}

export function GoldfishTab({ cards }: GoldfishTabProps) {
  const commanders = useMemo(() => getCommanders(cards), [cards])

  const initialState = useCallback((): GameState => {
    const library = shuffle(buildDeck(cards))
    const hand = library.splice(0, 7)
    return {
      library,
      hand,
      battlefield: [],
      graveyard: [],
      exile: [],
      command: commanders,
      turn: 0,
      mulliganCount: 0,
    }
  }, [cards, commanders])

  const [state, setState] = useState<GameState>(initialState)
  const [history, setHistory] = useState<GameState[]>([])
  const [selectedCard, setSelectedCard] = useState<GoldfishCard | null>(null)

  const pushState = useCallback((newState: GameState) => {
    setHistory(prev => [...prev, state])
    setState(newState)
  }, [state])

  // --- Actions ---

  const newGame = useCallback(() => {
    setState(initialState())
    setHistory([])
    setSelectedCard(null)
  }, [initialState])

  const drawCard = useCallback(() => {
    if (state.library.length === 0) return
    const newLibrary = [...state.library]
    const drawn = newLibrary.shift()!
    pushState({
      ...state,
      library: newLibrary,
      hand: [...state.hand, drawn],
      turn: state.turn + 1,
    })
  }, [state, pushState])

  const mulligan = useCallback(() => {
    const newMulliganCount = state.mulliganCount + 1
    const allCards = shuffle([...state.hand, ...state.library])
    const hand = allCards.splice(0, 7)
    // London mulligan: you'll need to bottom cards later
    pushState({
      ...state,
      library: allCards,
      hand,
      mulliganCount: newMulliganCount,
      turn: 0,
    })
  }, [state, pushState])

  const playCard = useCallback((card: GoldfishCard) => {
    const newHand = state.hand.filter(c => c.id !== card.id)
    pushState({
      ...state,
      hand: newHand,
      battlefield: [...state.battlefield, card],
    })
  }, [state, pushState])

  const sendToGraveyard = useCallback((card: GoldfishCard, from: Zone) => {
    const newState = { ...state }
    if (from === 'battlefield') {
      newState.battlefield = state.battlefield.filter(c => c.id !== card.id)
    } else if (from === 'hand') {
      newState.hand = state.hand.filter(c => c.id !== card.id)
    }
    newState.graveyard = [...state.graveyard, card]
    pushState(newState)
  }, [state, pushState])

  const undo = useCallback(() => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory(history.slice(0, -1))
    setState(prev)
  }, [history])

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={newGame}>
          <Shuffle className="size-3.5" /> New Game
        </Button>
        <Button variant="outline" size="sm" onClick={drawCard} disabled={state.library.length === 0}>
          <Plus className="size-3.5" /> Draw (Turn {state.turn + 1})
        </Button>
        <Button variant="outline" size="sm" onClick={mulligan} disabled={state.turn > 0}>
          <RotateCcw className="size-3.5" /> Mulligan{state.mulliganCount > 0 ? ` (${state.mulliganCount})` : ''}
        </Button>
        <Button variant="outline" size="sm" onClick={undo} disabled={history.length === 0}>
          <Undo2 className="size-3.5" /> Undo
        </Button>
        <span className="ml-auto text-[length:var(--fs-xs)] text-muted-foreground">
          Library: {state.library.length} · Turn: {state.turn}
        </span>
      </div>

      {/* Command Zone */}
      {state.command.length > 0 && (
        <ZoneDisplay
          title="Command Zone"
          cards={state.command}
          onCardClick={setSelectedCard}
          variant="row"
        />
      )}

      {/* Hand */}
      <ZoneDisplay
        title={`Hand (${state.hand.length})`}
        cards={state.hand}
        onCardClick={setSelectedCard}
        onCardDoubleClick={(card) => playCard(card)}
        variant="fan"
        hint="Double-click to play"
      />

      {/* Battlefield */}
      <ZoneDisplay
        title={`Battlefield (${state.battlefield.length})`}
        cards={state.battlefield}
        onCardClick={setSelectedCard}
        onCardDoubleClick={(card) => sendToGraveyard(card, 'battlefield')}
        variant="grid"
        hint="Double-click to send to graveyard"
      />

      {/* Graveyard */}
      {state.graveyard.length > 0 && (
        <ZoneDisplay
          title={`Graveyard (${state.graveyard.length})`}
          cards={state.graveyard}
          onCardClick={setSelectedCard}
          variant="row"
        />
      )}

      {/* Card Preview */}
      {selectedCard && (
        <div className="fixed bottom-20 right-4 z-50 w-48 rounded-lg shadow-2xl md:bottom-4">
          {getCardImage(selectedCard.scryfallId) ? (
            <img
              src={getCardImage(selectedCard.scryfallId)!}
              alt={selectedCard.cardName}
              className="w-full rounded-lg"
              style={{ aspectRatio: '5/7' }}
            />
          ) : (
            <div className="flex aspect-[5/7] items-center justify-center rounded-lg bg-muted p-2">
              <span className="text-center text-[length:var(--fs-sm)] text-muted-foreground">
                {selectedCard.cardName}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Zone Display Component
// ---------------------------------------------------------------------------

interface ZoneDisplayProps {
  title: string
  cards: GoldfishCard[]
  onCardClick: (card: GoldfishCard) => void
  onCardDoubleClick?: (card: GoldfishCard) => void
  variant: 'fan' | 'grid' | 'row'
  hint?: string
}

function ZoneDisplay({ title, cards, onCardClick, onCardDoubleClick, variant, hint }: ZoneDisplayProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="text-[length:var(--fs-sm)] font-medium text-foreground">{title}</h3>
        {hint && <span className="text-[length:var(--fs-2xs)] text-muted-foreground">{hint}</span>}
      </div>
      <div
        className={
          variant === 'grid'
            ? 'grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8'
            : variant === 'fan'
            ? 'flex flex-wrap gap-1.5'
            : 'flex flex-wrap gap-1'
        }
      >
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onCardClick(card)}
            onDoubleClick={() => onCardDoubleClick?.(card)}
            className="group relative flex h-10 items-center rounded border border-border bg-card px-2 text-left transition-colors hover:border-[var(--accent-primary)] hover:bg-accent/50"
            title={card.cardName}
          >
            <span className="truncate text-[length:var(--fs-xs)] text-foreground">
              {card.cardName}
            </span>
            {card.manaCost && (
              <span className="ml-1 shrink-0 text-[length:var(--fs-2xs)] text-muted-foreground">
                {card.manaCost.replace(/[{}]/g, '')}
              </span>
            )}
          </button>
        ))}
        {cards.length === 0 && (
          <span className="text-[length:var(--fs-xs)] text-muted-foreground italic">Empty</span>
        )}
      </div>
    </div>
  )
}
