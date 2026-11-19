import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeckHealthPanel } from './DeckHealthPanel'
import { buildDeckHealth, type DeckHealthResponse } from '@/lib/deck-health'
import { guideTargets, type CommanderTargets } from '@/lib/commander-targets'

afterEach(() => cleanup())

const cards = [
  { cardName: 'Forest', quantity: 38, typeLine: 'Basic Land — Forest', oracleText: null, inMainDeck: true },
  { cardName: 'Bear', quantity: 2, typeLine: 'Creature — Bear', oracleText: 'Trample', inMainDeck: true },
]

const edhrec: CommanderTargets = {
  ...guideTargets('x'),
  status: 'ok',
  source: 'edhrec_average',
  sourceLabel: 'EDHREC average deck, 17,659 decks',
  roles: (['ramp', 'draw', 'removal', 'wipes'] as const).map((role) => ({ role, typical: 3, cardsInRole: 3 })),
  landsTypical: 34,
  typeCounts: [{ type: 'creature', average: 27 }],
  typeCountsLabel: 'EDHREC averages, 17,659 decks',
}

function show(data: DeckHealthResponse) {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <DeckHealthPanel open onClose={vi.fn()} data={data} isLoading={false} isError={false} onRetry={vi.fn()} deckId={1} selected={null} onSelect={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('DeckHealthPanel reference line', () => {
  it('EDHREC numbers: a reference-only line with the deck count and every ranged row, no Card types block', () => {
    show(buildDeckHealth(cards, edhrec))
    const ref = screen.getByRole('region', { name: 'For reference only' })
    expect(ref).toHaveTextContent('For reference only: the average EDHREC deck for this commander')
    expect(ref).toHaveTextContent('Lands 34, Ramp 3, Card Advantage 3, Targeted Removal 3, Board Wipes 3')
    expect(ref).toHaveTextContent('Not used for any verdict')
    expect(ref).toHaveTextContent('EDHREC average deck, 17,659 decks')
    expect(screen.queryByRole('region', { name: 'Card types' })).toBeNull()
  })
  it('thin data: no average to show, and the Card types block with you-have and usually', () => {
    show(buildDeckHealth(cards, guideTargets('General guide', { typeCounts: [{ type: 'creature', average: 25 }], label: 'EDHREC averages, 61 decks' })))
    expect(screen.getByRole('region', { name: 'For reference only' })).toHaveTextContent('No EDHREC average for this commander. Not used for any verdict.')
    const block = screen.getByRole('region', { name: 'Card types' })
    expect(block).toHaveTextContent('Creatures: you have 2 · usually 25')
    expect(block).toHaveTextContent('EDHREC averages, 61 decks')
  })
  it('shows all six rows with their words: Light, Ok or Heavy, and a plain total for Game Plan', () => {
    show(buildDeckHealth(cards, edhrec))
    expect(screen.getByRole('button', { name: /^Lands: 38 cards, ok, within range\. Range 35 to 38/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Game Plan & Win Conditions: 2 cards\. A total, no range and no verdict/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Ramp: 0 cards, light, 10 below the minimum\. Range 10 to 12/ })).toBeInTheDocument()
  })
})
