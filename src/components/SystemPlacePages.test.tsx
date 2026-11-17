import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InHandPage, MissingPage } from './SystemPlacePages'
import { toast } from 'sonner'
import { lastSeenFrom, missingItem } from '@/lib/system-locations'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/contexts/PageHeaderContext', () => ({ usePageHeader: () => undefined }))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const empty = { inHand: { count: 0, cards: [] }, missing: { count: 0, cards: [] }, unsorted: { count: 0, locationId: 1 } }
const withData = {
  inHand: { count: 1, cards: [{ copyId: 5, cardName: 'Cultivate', isProxy: false, openItemId: 9, destination: { kind: 'deck', deckId: 3, deckCardId: 8, name: 'Prosper' } }] },
  missing: { count: 1, cards: [{ copyId: 6, cardName: 'Sol Ring', isProxy: false, since: '2026-11-01T00:00:00Z', lastSeen: { kind: 'deck', deckId: 3 }, lastSeenName: 'Prosper', lookNext: [{ label: 'Korvold', deckId: 4, locationId: null }, { label: 'Unsorted', deckId: null, locationId: 1 }], stepId: 12 }] },
  unsorted: { count: 0, locationId: 1 },
}

function mount(ui: React.ReactElement, data: unknown, opts: { ok?: boolean; tick?: { status: number; json: unknown } } = {}) {
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    const u = String(url)
    if (u.startsWith('/api/picklist/') || u.startsWith('/api/moves/')) return Promise.resolve(new Response(JSON.stringify(opts.tick?.json ?? {}), { status: opts.tick?.status ?? 200 }))
    if (u === '/api/import/destinations') return Promise.resolve(new Response(JSON.stringify({ storage: [{ locationId: 2, name: 'Box A' }], decks: [] }), { status: 200 }))
    return Promise.resolve(new Response(JSON.stringify(data), { status: opts.ok === false ? 500 : 200 }))
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)
  return fetchMock
}

describe('In your hand page', () => {
  it('shows the empty message', async () => {
    mount(<InHandPage />, empty)
    await waitFor(() => expect(screen.getByText(/You aren't carrying anything/)).toBeTruthy())
  })
  it('shows an error with Try again', async () => {
    mount(<InHandPage />, {}, { ok: false })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy())
  })
  it('lists a card with its destination and Placed it posts that exact slot', async () => {
    const f = mount(<InHandPage />, withData)
    await waitFor(() => expect(screen.getByText('Going to Prosper')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Placed: Cultivate' }))
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/picklist/placed')).toBe(true))
    const call = f.mock.calls.find((c) => c[0] === '/api/picklist/placed')!
    expect(JSON.parse(call[1]!.body as string)).toMatchObject({ copyId: 5, to: { kind: 'deck', deckId: 3, deckCardId: 8 } })
  })
  it('Put it somewhere else places it in the chosen box', async () => {
    const f = mount(<InHandPage />, withData)
    await waitFor(() => expect(screen.getByText('Going to Prosper')).toBeTruthy())
    await waitFor(() => expect(screen.getByRole('option', { name: 'Box: Box A' })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Put Cultivate somewhere else'), { target: { value: 'l2' } })
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/picklist/placed')).toBe(true))
    const call = f.mock.calls.find((c) => c[0] === '/api/picklist/placed')!
    expect(JSON.parse(call[1]!.body as string)).toMatchObject({ copyId: 5, to: { kind: 'location', locationId: 2 } })
  })
  it('a refusal shows the plain message', async () => {
    mount(<InHandPage />, withData, { tick: { status: 409, json: { error: 'wrong_state', message: 'Cultivate has already moved on.' } } })
    await waitFor(() => expect(screen.getByText('Going to Prosper')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Placed: Cultivate' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cultivate has already moved on.'))
  })
})

describe('In your hand page (instant Placed)', () => {
  function slow() {
    let answer: (r: Response | Error) => void = () => undefined
    const f = vi.fn((url: string) => String(url).startsWith('/api/picklist/')
      ? new Promise<Response>((resolve, reject) => { answer = (r) => (r instanceof Error ? reject(r) : resolve(r)) })
      : Promise.resolve(new Response(JSON.stringify(String(url) === '/api/import/destinations' ? { storage: [], decks: [] } : withData), { status: 200 })))
    vi.stubGlobal('fetch', f)
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><InHandPage /></QueryClientProvider>)
    return { f, answer: (r: Response | Error) => act(async () => { answer(r) }) }
  }
  it('Placed removes the card from the list at once; a double click sends one save', async () => {
    const { f } = slow()
    await waitFor(() => expect(screen.getByText('Going to Prosper')).toBeTruthy())
    const b = screen.getByRole('button', { name: 'Placed: Cultivate' })
    fireEvent.click(b)
    fireEvent.click(b)
    expect(screen.queryByText('Going to Prosper')).toBeNull()
    expect(f.mock.calls.filter((c) => c[0] === '/api/picklist/placed')).toHaveLength(1)
  })
  it('puts the card back with the plain message on a refusal and on a network failure', async () => {
    const { answer } = slow()
    await waitFor(() => expect(screen.getByText('Going to Prosper')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Placed: Cultivate' }))
    await answer(new Response(JSON.stringify({ message: 'Cultivate has already moved on.' }), { status: 409 }))
    expect(toast.error).toHaveBeenCalledWith('Cultivate has already moved on.')
    expect(screen.getByText('Going to Prosper')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Placed: Cultivate' }))
    await answer(new TypeError('Failed to fetch'))
    expect(toast.error).toHaveBeenCalledWith("Couldn't save that. Cultivate is still where Oracle had it.")
    expect(screen.getByText('Going to Prosper')).toBeTruthy()
  })
})
describe('Missing page', () => {
  it('shows the empty message', async () => {
    mount(<MissingPage />, empty)
    await waitFor(() => expect(screen.getByText('Nothing is missing.')).toBeTruthy())
  })
  it('shows last seen, flagged date and where to look next', async () => {
    mount(<MissingPage />, withData)
    await waitFor(() => expect(screen.getByText(/Last in Prosper/)).toBeTruthy())
    expect(screen.getByText('Missing', { exact: false })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Korvold' }).getAttribute('href')).toBe('/decks/4')
  })
})

describe('Missing page actions', () => {
  it('Found it asks where, and In your hand posts the turned-up request', async () => {
    const f = mount(<MissingPage />, withData, { tick: { status: 200, json: { success: true } } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Found it: Sol Ring' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Found it: Sol Ring' }))
    fireEvent.change(screen.getByLabelText('Where Sol Ring is now'), { target: { value: 'hand' } })
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/moves/missing/6/turned-up')).toBe(true))
    expect(JSON.parse(f.mock.calls.find((c) => c[0] === '/api/moves/missing/6/turned-up')![1]!.body as string)).toMatchObject({ to: { kind: 'in_hand' } })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sol Ring is in your hand.'))
  })
  it('Found it in a chosen box posts that box', async () => {
    const f = mount(<MissingPage />, withData, { tick: { status: 200, json: { success: true } } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Found it: Sol Ring' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Found it: Sol Ring' }))
    await waitFor(() => expect(screen.getByRole('option', { name: 'Box: Box A' })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Where Sol Ring is now'), { target: { value: 'l2' } })
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/moves/missing/6/turned-up')).toBe(true))
    expect(JSON.parse(f.mock.calls.find((c) => c[0] === '/api/moves/missing/6/turned-up')![1]!.body as string)).toMatchObject({ to: { kind: 'location', locationId: 2 } })
  })
  it('a refused Found it shows the plain message', async () => {
    mount(<MissingPage />, withData, { tick: { status: 409, json: { error: 'no_open_slot', message: 'That deck has no open slot for Sol Ring. Pick a box instead.' } } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Found it: Sol Ring' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Found it: Sol Ring' }))
    fireEvent.change(screen.getByLabelText('Where Sol Ring is now'), { target: { value: 'hand' } })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('That deck has no open slot for Sol Ring. Pick a box instead.'))
  })
  it('I checked here posts the saved step id with the deck, and for Unsorted its box', async () => {
    const f = mount(<MissingPage />, withData, { tick: { status: 200, json: { success: true } } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'I checked Korvold for Sol Ring' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'I checked Korvold for Sol Ring' }))
    await waitFor(() => expect(f.mock.calls.some((c) => c[0] === '/api/moves/items/12/looked-here')).toBe(true))
    expect(JSON.parse(f.mock.calls.find((c) => c[0] === '/api/moves/items/12/looked-here')![1]!.body as string)).toMatchObject({ place: { kind: 'deck', id: 4 } })
    fireEvent.click(screen.getByRole('button', { name: 'I checked Unsorted for Sol Ring' }))
    await waitFor(() => expect(f.mock.calls.filter((c) => c[0] === '/api/moves/items/12/looked-here').length).toBe(2))
    expect(JSON.parse(f.mock.calls.filter((c) => c[0] === '/api/moves/items/12/looked-here')[1][1]!.body as string)).toMatchObject({ place: { kind: 'location', id: 1 } })
  })
  it('no I checked here without a saved step', async () => {
    const d = JSON.parse(JSON.stringify(withData)); d.missing.cards[0].stepId = null
    mount(<MissingPage />, d)
    await waitFor(() => expect(screen.getByText(/Last in Prosper/)).toBeTruthy())
    expect(screen.queryByRole('button', { name: /I checked/ })).toBeNull()
  })
})

describe('lastSeenFrom', () => {
  it('uses the latest saved step that has a from-place, else null', () => {
    expect(lastSeenFrom([])).toBeNull()
    expect(lastSeenFrom([{ id: 1, state: 'x', copy_id: 1, from_deck_id: null, from_location_id: null }])).toBeNull()
    expect(lastSeenFrom([
      { id: 1, state: 'placed', copy_id: 1, from_deck_id: 3, from_location_id: null },
      { id: 2, state: 'missing', copy_id: 1, from_deck_id: null, from_location_id: 7 },
    ])).toEqual({ kind: 'location', locationId: 7 })
  })
})

describe('missingItem', () => {
  it('is the latest step still in the missing state, else undefined', () => {
    expect(missingItem([])).toBeUndefined()
    expect(missingItem([{ id: 1, state: 'placed', copy_id: 1, from_deck_id: null, from_location_id: null }])).toBeUndefined()
    expect(missingItem([
      { id: 1, state: 'missing', copy_id: 1, from_deck_id: null, from_location_id: null },
      { id: 4, state: 'missing', copy_id: 1, from_deck_id: null, from_location_id: null },
    ])?.id).toBe(4)
  })
})
