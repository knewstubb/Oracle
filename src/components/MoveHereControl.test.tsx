import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MoveHereControl } from './MoveHereControl'

const toastSuccess = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() } }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  toastSuccess.mockReset()
})

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))
const copy = { copyId: 11, isProxy: false, deckId: 3, deckName: 'Prosper', deckState: 'assembling' }
const moved = {
  copyId: 11, sourceDeckId: 3, sourceDeckName: 'Prosper', sourceDeckCardId: 500, targetDeckCardId: 900,
  sourceDeckNowShort: true, sourceDeckStatusAfter: 'assembling',
  undo: { deckCardsId: 900, physicalCopyId: 11, restoreTo: { deckCardsId: 500 } }, sourceWasPlayable: false,
}

function setup(reply: { hasOpenSlot: boolean; copies: unknown[] }, onPost?: (url: string, body: unknown) => Promise<Response>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return onPost ? onPost(url, JSON.parse(String(init.body))) : json(moved)
    return json(reply)
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MoveHereControl deckId={7} cardName="Cultivate" />
    </QueryClientProvider>
  )
  return fetchMock
}

describe('MoveHereControl', () => {
  it('shows nothing when this deck has no open slot for the card', async () => {
    const f = setup({ hasOpenSlot: false, copies: [copy] })
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Move Cultivate here/ })).toBeNull()
  })

  it('shows nothing when no copy sits in another deck', async () => {
    const f = setup({ hasOpenSlot: true, copies: [] })
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Move Cultivate here/ })).toBeNull()
  })

  it('moves on one click with no dialog, shows an 8 second Undo toast and an inline note', async () => {
    const f = setup({ hasOpenSlot: true, copies: [copy] })
    fireEvent.click(await screen.findByRole('button', { name: 'Move Cultivate here from Prosper' }))
    expect(await screen.findByTestId('moved-note')).toHaveTextContent('Moved from Prosper')
    const post = f.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')!
    expect(post[0]).toBe('/api/decks/7/move-here')
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({ copyId: 11, cardName: 'Cultivate', expectedSourceDeckId: 3 })
    expect(toastSuccess).toHaveBeenCalledWith('Moved from Prosper. Prosper is now short by one.', expect.objectContaining({ duration: 8000, action: expect.objectContaining({ label: 'Undo' }) }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Undo (inline) sends the exact restore body and brings the button back', async () => {
    const f = setup({ hasOpenSlot: true, copies: [copy] }, (url) => (url === '/api/allocation/undo' ? json({ success: true }) : json(moved)))
    fireEvent.click(await screen.findByRole('button', { name: 'Move Cultivate here from Prosper' }))
    fireEvent.click(await screen.findByRole('button', { name: /Undo/ }))
    await waitFor(() => expect(screen.queryByTestId('moved-note')).toBeNull())
    const undo = f.mock.calls.find((c) => c[0] === '/api/allocation/undo')!
    expect(JSON.parse(String((undo[1] as RequestInit).body))).toEqual(moved.undo)
  })

  it('names a Playable source before the click', async () => {
    setup({ hasOpenSlot: true, copies: [{ ...copy, deckName: 'Atraxa', deckState: 'playable' }] })
    expect(await screen.findByText(/Atraxa is Playable, so it will become Assembling\./)).toBeInTheDocument()
  })

  it('with several copies, names the picked one and offers a chooser', async () => {
    setup({ hasOpenSlot: true, copies: [copy, { ...copy, copyId: 12, deckId: 4, deckName: 'Atraxa', deckState: 'playable' }] })
    expect(await screen.findByText(/You have 2 copies in other decks\. Picked: Prosper · Assembling\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose which copy of Cultivate to move' })).toBeInTheDocument()
  })

  it('shows the plain error and leaves the button when the move is refused', async () => {
    setup({ hasOpenSlot: true, copies: [copy] }, () => json({ error: 'source_changed', message: 'Cultivate is no longer in Prosper.' }, 409))
    fireEvent.click(await screen.findByRole('button', { name: 'Move Cultivate here from Prosper' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cultivate is no longer in Prosper.')
  })
})
