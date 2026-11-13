import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GapDetail } from './GapDetail'
import type { DeckHealthGap } from '@/lib/deck-health-gap'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const gap = (over: Partial<DeckHealthGap> = {}): DeckHealthGap => ({
  role: 'draw',
  label: 'Draw',
  have: 3,
  typical: 10,
  inDeckCount: 3,
  inDeckCards: [],
  spare: [{ name: 'Spare Draw', typeLine: 'Sorcery', status: 'SPARE', otherDeckName: null, spareCopies: 52, printingId: null, detailLine: null }],
  inAnotherDeck: [{ name: 'Held Draw', typeLine: 'Sorcery', status: 'IN_ANOTHER_DECK', otherDeckName: 'Korvold', spareCopies: 0, printingId: null, detailLine: null }],
  coloursKnown: true,
  spareTotal: 52,
  inAnotherDeckTotal: 1,
  buyIdeas: [{ name: 'Buy Draw', typeLine: 'Sorcery', inclusionPct: 40, price: { usd: 1.5, state: 'known' }, printingId: null, detailLine: null }],
  buyDefaultOpen: true,
  nothingOwnedFits: false,
  buyUnavailableReason: null,
  sourceLine: 'General guide',
  ...over,
})

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

function setup(postImpl: () => Promise<Response>, body: DeckHealthGap = gap(), moveHere?: unknown) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return postImpl()
    if (moveHere && url.includes('/move-here')) return json(moveHere)
    return json(body)
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <GapDetail deckId={7} role="draw" onBack={() => {}} />
    </QueryClientProvider>,
  )
  return { fetchMock, invalidate }
}

describe('GapDetail: spare counts are hidden', () => {
  it('shows "Spare" with no number and no "x N spare" on rows', async () => {
    setup(() => json({}))
    await screen.findByText('Spare Draw')
    expect(screen.getByRole('heading', { name: 'Spare' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\(52\)/)
    expect(document.body.textContent).not.toMatch(/[×x]\s?52/)
    expect(document.body.textContent).not.toMatch(/\d+\s*spare/i)
  })
})

describe('GapDetail: Add to deck', () => {
  it('every recommended card (spare, other deck, buy idea) has an Add to deck button', async () => {
    setup(() => json({}))
    await screen.findByText('Spare Draw')
    expect(screen.getByRole('button', { name: 'Add Spare Draw to deck' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Held Draw to deck' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Buy Draw to deck' })).toBeInTheDocument()
  })

  it('posts the card name to the deck page add route and then shows Added and refreshes the deck data', async () => {
    const { fetchMock, invalidate } = setup(() => json({ id: 1 }, 201))
    await screen.findByText('Spare Draw')
    fireEvent.click(screen.getByRole('button', { name: 'Add Spare Draw to deck' }))
    expect(await screen.findByTestId('gap-added')).toHaveTextContent('Added to deck')
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(post[0]).toBe('/api/decks/7/cards')
    expect(JSON.parse(post[1]!.body as string)).toEqual({ cardName: 'Spare Draw' })
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey))
    expect(keys.some((k) => k.includes('card-statuses'))).toBe(true)
    expect(keys.some((k) => k.includes('health'))).toBe(true)
  })

  it('a card in another deck is not moved: it is added as a slot and the row says the copy stays put', async () => {
    setup(() => json({ id: 2 }, 201))
    await screen.findByText('Held Draw')
    fireEvent.click(screen.getByRole('button', { name: 'Add Held Draw to deck' }))
    expect(await screen.findByTestId('gap-added')).toHaveTextContent('the copy stays in Korvold')
  })

  it('right after adding a card whose only copy is in another deck, Move here is offered (and stays after the list refreshes)', async () => {
    const reply = { hasOpenSlot: true, copies: [{ copyId: 5, isProxy: false, deckId: 3, deckName: 'Korvold', deckState: 'assembling' }] }
    setup(() => json({ id: 2 }, 201), gap(), reply)
    await screen.findByText('Held Draw')
    expect(screen.queryByRole('button', { name: /Move Held Draw here/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add Held Draw to deck' }))
    expect(await screen.findByRole('button', { name: 'Move Held Draw here from Korvold' })).toBeInTheDocument()
  })

  it('shows a clear error with Try again when the add fails, and a retry can succeed', async () => {
    let calls = 0
    setup(() => (++calls === 1 ? json({ error: 'Deck is full' }, 400) : json({ id: 3 }, 201)))
    await screen.findByText('Spare Draw')
    fireEvent.click(screen.getByRole('button', { name: 'Add Spare Draw to deck' }))
    expect(await screen.findByTestId('gap-add-error')).toHaveTextContent('Deck is full')
    expect(screen.getByRole('button', { name: 'Add Spare Draw to deck' })).toHaveTextContent('Try again')
    fireEvent.click(screen.getByRole('button', { name: 'Add Spare Draw to deck' }))
    await waitFor(() => expect(screen.getByTestId('gap-added')).toBeInTheDocument())
    expect(screen.queryByTestId('gap-add-error')).toBeNull()
  })

  it('shows Adding… while the request is out', async () => {
    setup(() => new Promise(() => {}))
    await screen.findByText('Spare Draw')
    fireEvent.click(screen.getByRole('button', { name: 'Add Spare Draw to deck' }))
    expect(await screen.findByRole('button', { name: /Add Spare Draw to deck/ })).toHaveTextContent('Adding')
  })
})
