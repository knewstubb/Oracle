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
      <DeckHealthPanel open onClose={vi.fn()} data={data} isLoading={false} isError={false} onRetry={vi.fn()} deckId={1} gapRole={null} onGapRole={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('DeckHealthPanel sources', () => {
  it('EDHREC numbers: source line with the deck count, each role labelled, no Card types block', () => {
    show(buildDeckHealth(cards, edhrec))
    expect(screen.getByText('EDHREC average deck, 17,659 decks')).toBeInTheDocument()
    expect(screen.getAllByText('EDHREC average deck').length).toBe(5)
    expect(screen.getByText('Average is 34; you have 38.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Card types' })).toBeNull()
  })

  it('general guide for thin data: shows the Card types block with you-have and usually', () => {
    show(buildDeckHealth(cards, guideTargets('General guide', { typeCounts: [{ type: 'creature', average: 25 }], label: 'EDHREC averages, 61 decks' })))
    expect(screen.getAllByText('General guide').length).toBeGreaterThan(0)
    const block = screen.getByRole('region', { name: 'Card types' })
    expect(block).toHaveTextContent('Creatures: you have 2 · usually 25')
    expect(block).toHaveTextContent('EDHREC averages, 61 decks')
  })
})
