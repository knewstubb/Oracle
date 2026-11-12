import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { HealthStrip } from './HealthStrip'
import { DeckHealthPanel } from './DeckHealthPanel'
import { buildDeckHealth } from '@/lib/deck-health'

const oracle = vi.hoisted(() => ({ open: vi.fn(), sendMessage: vi.fn(async () => {}), present: true }))
vi.mock('@/contexts/OracleContext', () => ({
  useOracleOptional: () => (oracle.present ? { open: oracle.open, sendMessage: oracle.sendMessage } : null),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  oracle.open.mockClear()
  oracle.sendMessage.mockClear()
  oracle.present = true
})

const health = buildDeckHealth([
  { cardName: 'Forest', quantity: 36, typeLine: 'Basic Land — Forest', oracleText: null, inMainDeck: true },
  { cardName: 'Divination', quantity: 1, typeLine: 'Sorcery', oracleText: 'Draw two cards.', inMainDeck: true },
])

const gap = {
  role: 'draw', label: 'Draw', have: 1, typical: 10, inDeckCount: 1, inDeckCards: [{ name: 'Divination', quantity: 1 }],
  spare: [], inAnotherDeck: [], coloursKnown: true, spareTotal: 0, inAnotherDeckTotal: 0, buyIdeas: [], buyDefaultOpen: true,
  nothingOwnedFits: true, buyUnavailableReason: null, sourceLine: 'General guide',
}

function Harness() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={client}>
      <HealthStrip deckId={7} />
    </QueryClientProvider>
  )
}

const stubFetch = () =>
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(String(url).includes('/gap') ? gap : health), { status: 200 }))))

describe('Chat about this', () => {
  it('the verdict card button opens the Oracle chat and sends the deck question, and closes the panel', async () => {
    stubFetch()
    render(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: /^Deck health:/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Chat about this' }))
    expect(oracle.open).toHaveBeenCalledTimes(1)
    expect(oracle.sendMessage).toHaveBeenCalledWith('What is my deck missing? Check my deck health.')
    expect(screen.queryByRole('button', { name: 'Chat about this' })).not.toBeInTheDocument()
  })

  it('the role button sends a question about that role', async () => {
    stubFetch()
    render(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: /^Draw 1 of 10/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Chat about this' }))
    expect(oracle.open).toHaveBeenCalledTimes(1)
    expect(oracle.sendMessage).toHaveBeenCalledWith('How is my draw looking? What could fill the gap?')
  })

  it('no button when the chat is not available', async () => {
    oracle.present = false
    stubFetch()
    render(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: /^Draw 1 of 10/ }))
    await screen.findByRole('heading', { name: 'Draw' })
    expect(screen.queryByRole('button', { name: 'Chat about this' })).not.toBeInTheDocument()
  })

  it('panel: the button is small, in the verdict card, and calls onChat(null)', () => {
    const onChat = vi.fn()
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <DeckHealthPanel open onClose={() => {}} data={health} isLoading={false} isError={false} onRetry={() => {}} deckId={7} gapRole={null} onGapRole={() => {}} onChat={onChat} />
      </QueryClientProvider>,
    )
    const btn = screen.getByRole('button', { name: 'Chat about this' })
    expect(screen.getByRole('region', { name: 'Verdict' })).toContainElement(btn)
    fireEvent.click(btn)
    expect(onChat).toHaveBeenCalledWith(null)
  })
})
