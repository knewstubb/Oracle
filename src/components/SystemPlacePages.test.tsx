import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InHandPage, MissingPage } from './SystemPlacePages'
import { toast } from 'sonner'
import { lastSeenFrom } from '@/lib/system-locations'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/contexts/PageHeaderContext', () => ({ usePageHeader: () => undefined }))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const empty = { inHand: { count: 0, cards: [] }, missing: { count: 0, cards: [] }, unsorted: { count: 0, locationId: 1 } }
const withData = {
  inHand: { count: 1, cards: [{ copyId: 5, cardName: 'Cultivate', isProxy: false, openItemId: 9, destination: { kind: 'deck', deckId: 3, deckCardId: 8, name: 'Prosper' } }] },
  missing: { count: 1, cards: [{ copyId: 6, cardName: 'Sol Ring', isProxy: false, since: '2026-11-01T00:00:00Z', lastSeen: { kind: 'deck', deckId: 3 }, lastSeenName: 'Prosper', lookNext: [{ label: 'Korvold', deckId: 4 }, { label: 'Unsorted', deckId: null }] }] },
  unsorted: { count: 0, locationId: 1 },
}

function mount(ui: React.ReactElement, data: unknown, opts: { ok?: boolean; tick?: { status: number; json: unknown } } = {}) {
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    const u = String(url)
    if (u.startsWith('/api/picklist/')) return Promise.resolve(new Response(JSON.stringify(opts.tick?.json ?? {}), { status: opts.tick?.status ?? 200 }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Placed it: Cultivate' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Placed it: Cultivate' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cultivate has already moved on.'))
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
