import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { HealthStrip } from './HealthStrip'
import { buildDeckHealth } from '@/lib/deck-health'
import type { DeckHealthGap } from '@/lib/deck-health-gap'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const health = buildDeckHealth([
  { cardName: 'Forest', quantity: 36, typeLine: 'Basic Land — Forest', oracleText: null, inMainDeck: true },
  { cardName: 'Divination', quantity: 1, typeLine: 'Sorcery', oracleText: 'Draw two cards.', inMainDeck: true },
])

const gap: DeckHealthGap = {
  role: 'draw',
  label: 'Draw',
  have: 1,
  typical: 10,
  inDeckCount: 1,
  inDeckCards: [{ name: 'Divination', quantity: 1 }],
  spare: [{ name: 'Spare Draw', typeLine: 'Sorcery', status: 'SPARE', otherDeckName: null, spareCopies: 1, printingId: null, detailLine: null }],
  inAnotherDeck: [],
  coloursKnown: true,
  spareTotal: 1,
  inAnotherDeckTotal: 0,
  buyIdeas: [],
  buyDefaultOpen: false,
  nothingOwnedFits: false,
  buyUnavailableReason: null,
  sourceLine: 'General guide',
}

function Harness() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={client}>
      <HealthStrip deckId={7} />
    </QueryClientProvider>
  )
}

describe('HealthStrip → panel → gap detail (whole path, fake network)', () => {
  it('clicking a Light pill shows the heading and the cards, not an empty panel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(new Response(JSON.stringify(String(url).includes('/gap') ? gap : health), { status: 200 })),
      ),
    )
    render(<Harness />)
    const pill = await screen.findByRole('button', { name: /^Draw 1 of 10/ })
    fireEvent.click(pill)
    expect(await screen.findByRole('heading', { name: 'Draw' })).toBeInTheDocument()
    expect(await screen.findByText('Spare Draw')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /See the 1 draw cards already in this deck/ })).toBeInTheDocument()
  })
})
