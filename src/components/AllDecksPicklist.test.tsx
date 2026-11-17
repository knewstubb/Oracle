import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AllDecksPicklist } from './AllDecksPicklist'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/contexts/PageHeaderContext', () => ({ usePageHeader: () => undefined }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const row = (o: { itemId?: number | null; [k: string]: unknown }) => {
  const itemId = o.itemId === undefined ? 1 : o.itemId
  return { itemId, key: itemId === null ? `s${o.toDeckCardId ?? 9}` : `i${itemId}`, state: 'to_find', copyId: 5, cardName: 'Sol Ring', isProxy: false, fromName: 'Box A', toName: 'Korvold', toDeckId: 1, toDeckCardId: 9, toLocationId: null, blockedBy: null, ...o }
}
const full = {
  takeFromBoxes: [{ key: 'l1', placeName: 'Box A', isUnsorted: false, rows: [row({})] }],
  takeFromDecks: [],
  placeIn: [{ key: 'd1', placeName: 'Korvold', isUnsorted: false, rows: [row({ itemId: 2, state: 'found', cardName: 'Cultivate', copyId: 6, toDeckCardId: 10 })] }],
  unowned: [],
  counts: { total: 3, found: 1, placed: 1, missing: 0, open: 1, unowned: 0 },
  decks: [{ deckId: 1, deckName: 'Korvold', placed: 1, total: 3 }],
}
/** Planned cards with no step yet: one in storage, one in another deck, one contested, one unowned. */
const derived = {
  takeFromBoxes: [{ key: 'l1', placeName: 'Unsorted', isUnsorted: true, rows: [
    row({ itemId: null, copyId: 51, cardName: 'Sol Ring', fromName: 'Unsorted', toName: 'TEST A', toDeckId: 3, toDeckCardId: 101 }),
    row({ itemId: null, copyId: 51, cardName: 'Sol Ring', fromName: 'Unsorted', toName: 'TEST B', toDeckId: 4, toDeckCardId: 201, blockedBy: 'TEST A' }),
  ] }],
  takeFromDecks: [{ key: 'd1', placeName: 'Korvold', isUnsorted: false, rows: [
    row({ itemId: null, copyId: 52, cardName: 'Cultivate', fromName: 'Korvold', toName: 'TEST A', toDeckId: 3, toDeckCardId: 102 }),
  ] }],
  placeIn: [],
  unowned: [{ key: 'd4', placeName: 'TEST B', isUnsorted: false, rows: [
    row({ itemId: null, copyId: null, cardName: 'Black Lotus', fromName: null, toName: 'TEST B', toDeckId: 4, toDeckCardId: 202 }),
  ] }],
  counts: { total: 4, found: 0, placed: 0, missing: 0, open: 3, unowned: 1 },
  decks: [{ deckId: 3, deckName: 'TEST A', placed: 0, total: 2 }, { deckId: 4, deckName: 'TEST B', placed: 0, total: 2 }],
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
  it('shows the title, N of M cards placed and the help line', async () => {
    mount(full)
    await waitFor(() => expect(screen.getByText('Picklist · all decks')).toBeTruthy())
    expect(screen.getByTestId('all-decks-summary').textContent).toContain('1 of 3 cards placed')
    expect(screen.getByTestId('deck-progress').textContent).toContain('Korvold: 1 of 3 cards placed')
    expect(screen.getByText(/Ticks save straight away/)).toBeTruthy()
  })
  it('shows the empty message', async () => {
    mount({ takeFromBoxes: [], takeFromDecks: [], placeIn: [], unowned: [], decks: [], counts: { total: 0, found: 0, placed: 0, missing: 0, open: 0, unowned: 0 } })
    await waitFor(() => expect(screen.getByText(/Nothing to pick/)).toBeTruthy())
    expect(screen.queryByText(/Add cards to the Picklist/)).toBeNull()
  })
  it('shows the all-done state', async () => {
    mount({ takeFromBoxes: [], takeFromDecks: [], placeIn: [{ key: 'd1', placeName: 'Korvold', isUnsorted: false, rows: [row({ state: 'placed' })] }], counts: { total: 1, found: 0, placed: 1, missing: 0, open: 0 } })
    await waitFor(() => expect(screen.getByText(/All done/)).toBeTruthy())
  })
  it('shows an error with Try again, never the empty message (D-030)', async () => {
    mount({}, { ok: false })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy())
    expect(screen.queryByText(/Nothing to pick/)).toBeNull()
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
  it('lists every planned card under Storage, Another deck and Unowned, with per-deck counts', async () => {
    mount(derived)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Storage' })).toBeTruthy())
    expect(screen.getByRole('region', { name: 'Another deck' }).textContent).toContain('Cultivate')
    const unowned = screen.getByRole('region', { name: 'Unowned' })
    expect(unowned.textContent).toContain('Black Lotus')
    expect(unowned.textContent).toContain('not in your collection')
    expect(screen.queryByRole('button', { name: 'Picked: Black Lotus' })).toBeNull()
    expect(screen.getByTestId('all-decks-summary').textContent).toContain('0 of 4 cards placed')
    expect(screen.getByTestId('deck-progress').textContent).toContain('TEST A: 0 of 2 cards placed')
    expect(screen.getByTestId('deck-progress').textContent).toContain('TEST B: 0 of 2 cards placed')
  })
  it('a planned row has Picked and Can\'t find it, but no Cancel step or Undo (there is no step yet)', async () => {
    mount(derived)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Picked: Cultivate' })).toBeTruthy())
    expect(screen.getByRole('button', { name: "Can't find it: Cultivate" })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancel step: Cultivate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Undo: Cultivate' })).toBeNull()
  })
  it('Picked on a planned row posts that copy and slot, and shows it in your hand at once', async () => {
    const f = mount(derived)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Picked: Cultivate' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Picked: Cultivate' }))
    expect(screen.getByText('In your hand · going to TEST A')).toBeTruthy()
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/picklist/found')).toBe(true))
    const c = f.mock.calls.find((x) => x[0] === '/api/picklist/found')!
    expect(JSON.parse(c[1]!.body as string)).toMatchObject({ copyId: 52, to: { kind: 'deck', deckId: 3, deckCardId: 102 } })
  })
  it('a row whose only copy is going to another deck has no ticks and says where the copy is going', async () => {
    mount(derived)
    await waitFor(() => expect(screen.getByTestId('blocked-s201')).toBeTruthy())
    expect(screen.getByTestId('blocked-s201').textContent).toContain('already going to TEST A')
    expect(screen.getAllByRole('button', { name: 'Picked: Sol Ring' })).toHaveLength(1)
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

describe('AllDecksPicklist instant ticks (optimistic)', () => {
  function mountSlow() {
    let answer: (r: Response | Error) => void = () => undefined
    const f = vi.fn((url: string, _i?: RequestInit) => {
      if (String(url).startsWith('/api/picklist/') || String(url).startsWith('/api/moves/')) {
        return new Promise<Response>((resolve, reject) => { answer = (r) => (r instanceof Error ? reject(r) : resolve(r)) })
      }
      return Promise.resolve(new Response(JSON.stringify(full), { status: 200 }))
    })
    vi.stubGlobal('fetch', f)
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AllDecksPicklist /></QueryClientProvider>)
    return { f, answer: (r: Response | Error) => act(async () => { answer(r) }) }
  }
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status })

  it('Picked moves the row under the place it is going to at once', async () => {
    mountSlow()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Picked: Sol Ring' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Picked: Sol Ring' }))
    expect(screen.queryByRole('button', { name: 'Picked: Sol Ring' })).toBeNull()
    expect(screen.getAllByText('In your hand · going to Korvold')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Placed: Sol Ring' })).toBeTruthy()
  })

  it('rolls the row back with the plain message when the server refuses', async () => {
    const { answer } = mountSlow()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Picked: Sol Ring' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Picked: Sol Ring' }))
    await answer(json(409, { error: 'copy_missing', message: 'Sol Ring is marked Missing.' }))
    expect(toast.error).toHaveBeenCalledWith('Sol Ring is marked Missing.')
    expect(screen.getByRole('button', { name: 'Picked: Sol Ring' })).toBeTruthy()
  })

  it('rolls the row back when the network fails', async () => {
    const { answer } = mountSlow()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Picked: Sol Ring' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Picked: Sol Ring' }))
    await answer(new TypeError('Failed to fetch'))
    expect(toast.error).toHaveBeenCalledWith("Couldn't save that. Sol Ring is still where Oracle had it.")
    expect(screen.getByRole('button', { name: 'Picked: Sol Ring' })).toBeTruthy()
  })

  it('Placed shows the card as placed at once, and a double click sends one save', async () => {
    const { f } = mountSlow()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Placed: Cultivate' })).toBeTruthy())
    const b = screen.getByRole('button', { name: 'Placed: Cultivate' })
    fireEvent.click(b)
    fireEvent.click(b)
    expect(screen.getByText('Placed in Korvold')).toBeTruthy()
    expect(screen.getByTestId('all-decks-summary').textContent).toContain('2 of 3 cards placed')
    expect(f.mock.calls.filter((c) => c[0] === '/api/picklist/placed')).toHaveLength(1)
  })

  it('Can\'t find it shows the card as Missing at once', async () => {
    mountSlow()
    await waitFor(() => expect(screen.getByRole('button', { name: "Can't find it: Sol Ring" })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: "Can't find it: Sol Ring" }))
    expect(screen.getByText('Missing')).toBeTruthy()
  })

  it('Undo puts a picked-up card back to waiting at once, and rolls back when refused', async () => {
    const { answer } = mountSlow()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo: Cultivate' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Undo: Cultivate' }))
    expect(screen.queryByRole('button', { name: 'Undo: Cultivate' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Picked: Cultivate' })).toBeTruthy()
    await answer(json(409, { error: 'moved_since', message: 'Cultivate has been moved since then.' }))
    expect(toast.error).toHaveBeenCalledWith('Cultivate has been moved since then.')
    expect(screen.getByRole('button', { name: 'Undo: Cultivate' })).toBeTruthy()
  })
})
