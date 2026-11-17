import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AllDecksPicklist } from './AllDecksPicklist'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/contexts/PageHeaderContext', () => ({ usePageHeader: () => undefined }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const row = (o: object) => ({ itemId: 1, state: 'to_find', copyId: 5, cardName: 'Sol Ring', isProxy: false, fromName: 'Box A', toName: 'Korvold', toDeckId: 1, toDeckCardId: 9, toLocationId: null, ...o })
const full = {
  takeFromBoxes: [{ key: 'l1', placeName: 'Box A', isUnsorted: false, rows: [row({})] }],
  takeFromDecks: [],
  placeIn: [{ key: 'd1', placeName: 'Korvold', isUnsorted: false, rows: [row({ itemId: 2, state: 'found', cardName: 'Cultivate', copyId: 6, toDeckCardId: 10 })] }],
  counts: { total: 3, found: 1, placed: 1, missing: 0, open: 1 },
}
function mount(data: unknown, o: { ok?: boolean; tick?: { status: number; json: unknown } } = {}) {
  const f = vi.fn((url: string, _i?: RequestInit) =>
    String(url).startsWith('/api/picklist/') || String(url).startsWith('/api/moves/')
      ? Promise.resolve(new Response(JSON.stringify(o.tick?.json ?? {}), { status: o.tick?.status ?? 200 }))
      : Promise.resolve(new Response(JSON.stringify(data), { status: o.ok === false ? 500 : 200 })))
  vi.stubGlobal('fetch', f)
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AllDecksPicklist /></QueryClientProvider>)
  return f
}

describe('AllDecksPicklist', () => {
  it('shows the title, n of N placed and the help line', async () => {
    mount(full)
    await waitFor(() => expect(screen.getByText('Picklist · all decks')).toBeTruthy())
    expect(screen.getByTestId('all-decks-summary').textContent).toContain('1 of 3 placed')
    expect(screen.getByText(/Ticks save straight away/)).toBeTruthy()
  })
  it('shows the empty message', async () => {
    mount({ takeFromBoxes: [], takeFromDecks: [], placeIn: [], counts: { total: 0, found: 0, placed: 0, missing: 0, open: 0 } })
    await waitFor(() => expect(screen.getByText(/Nothing to move/)).toBeTruthy())
  })
  it('shows the all-done state', async () => {
    mount({ takeFromBoxes: [], takeFromDecks: [], placeIn: [{ key: 'd1', placeName: 'Korvold', isUnsorted: false, rows: [row({ state: 'placed' })] }], counts: { total: 1, found: 0, placed: 1, missing: 0, open: 0 } })
    await waitFor(() => expect(screen.getByText(/All done/)).toBeTruthy())
  })
  it('shows an error with Try again', async () => {
    mount({}, { ok: false })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy())
  })
  it('Found it posts that exact copy and slot', async () => {
    const f = mount(full)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Picked: Sol Ring' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Picked: Sol Ring' }))
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/picklist/found')).toBe(true))
    const c = f.mock.calls.find((x) => x[0] === '/api/picklist/found')!
    expect(JSON.parse(c[1]!.body as string)).toMatchObject({ copyId: 5, to: { kind: 'deck', deckId: 1, deckCardId: 9 } })
  })
  it('Placed it on a picked-up card, and a refusal shows the plain message', async () => {
    mount(full, { tick: { status: 409, json: { error: 'wrong_state', message: 'Cultivate has already moved on.' } } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Placed: Cultivate' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Placed: Cultivate' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cultivate has already moved on.'))
  })
  it('shows the unowned footnote as a count per deck, never as a list', async () => {
    mount({ ...full, unownedByDeck: [{ deckId: 1, deckName: 'Korvold', count: 3 }] })
    await waitFor(() => expect(screen.getByTestId('unowned-footnote')).toBeTruthy())
    expect(screen.getByTestId('unowned-footnote').textContent).toBe("3 unowned cards in Korvold aren't listed here. Open the deck's Picklist.")
  })
  it('shows no footnote when nothing is unowned', async () => {
    mount({ ...full, unownedByDeck: [] })
    await waitFor(() => expect(screen.getByText('Picklist · all decks')).toBeTruthy())
    expect(screen.queryByTestId('unowned-footnote')).toBeNull()
  })
  it('Undo on a picked-up card names the state it showed and says where it went', async () => {
    const f = mount(full, { tick: { status: 200, json: { state: 'to_find' } } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo: Cultivate' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Undo: Cultivate' }))
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/moves/items/2/undo')).toBe(true))
    expect(JSON.parse(f.mock.calls.find((x) => x[0] === '/api/moves/items/2/undo')![1]!.body as string)).toMatchObject({ expectedState: 'found' })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cultivate is back where it was.'))
  })
  it('Undo that is refused shows the plain message', async () => {
    mount(full, { tick: { status: 409, json: { error: 'moved_since', message: 'Cultivate has been moved since then.' } } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo: Cultivate' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Undo: Cultivate' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cultivate has been moved since then.'))
  })
  it('Cancel step is offered only on a waiting step and posts that step', async () => {
    const f = mount(full)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel step: Sol Ring' })).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Cancel step: Cultivate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Undo: Sol Ring' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel step: Sol Ring' }))
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/moves/items/1/cancel')).toBe(true))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sol Ring is off the Picklist. Nothing moved.'))
  })
})
