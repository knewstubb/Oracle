import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, within, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PicklistV2 } from './PicklistV2'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/MoveHereControl', () => ({
  MoveHereControl: ({ cardName }: { cardName: string }) => <button type="button">Move here (stub) {cardName}</button>,
}))
vi.mock('@/components/CardHoverPreview', () => ({
  CardHoverPreview: () => null,
  useCardHoverPreview: () => ({ triggerProps: {}, previewProps: {} }),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function cand(over: { tier?: number; location?: string | null; deck?: { id: number; name: string } | null }) {
  const { tier = 1, location = 'Box A', deck = null } = over
  return {
    entry: {
      physicalCopyId: 1, cardId: 1, printingId: null, finish: 'nonfoil', isProxy: false, condition: null,
      locationId: null, locationName: location,
      assignedTo: deck ? { deckCardsId: 99, deckId: deck.id, deckName: deck.name, deckStatus: 'in_rotation' } : null,
    },
    tier, tierLabel: '', withinTierScore: 0, autoSelectable: false,
  }
}

function row(id: number, name: string, candidates: unknown[]) {
  return {
    deckCardsId: id, cardName: name, lifecycle: 'planned', allocationStatus: null, copyId: null, isResolved: false,
    physicalCopyId: null, ownershipStatus: null, candidates,
  }
}

function setup(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: ok ? 200 : 500 }))))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><PicklistV2 deckId={7} /></QueryClientProvider>)
}

const full = {
  deckName: 'Deck',
  cards: [
    row(1, 'Sol Ring', [cand({})]),
    row(2, 'Cultivate', [cand({ tier: 4, deck: { id: 3, name: 'Prosper' } })]),
    row(3, 'Mox Diamond', []),
    { ...row(4, 'Island Hopper', []), isResolved: true, copyId: 5, lifecycle: 'sleeved' },
  ],
  progress: { resolved: 1, total: 4 },
  unownedPrices: { 'Mox Diamond': 12.5 },
}

describe('PicklistV2 (Picklist tab)', () => {
  it('shows the three groups, the summary and Placed it', async () => {
    setup(full)
    await waitFor(() => expect(screen.getByTestId('group-available')).toBeTruthy())
    expect(screen.getByTestId('picklist-summary').textContent).toContain('1 of 4 ready')
    expect(screen.getByTestId('picklist-summary').textContent).toContain('1 available · 1 need moving · 1 unowned')
    const available = within(screen.getByTestId('group-available'))
    expect(available.getByRole('button', { name: /Placed: Sol Ring/ })).toBeTruthy()
    expect(available.getByText('BOX A (1)')).toBeTruthy()
    expect(screen.queryByText('Sleeve')).toBeNull()
  })

  it('offers Move here only in Needs moving', async () => {
    setup(full)
    await waitFor(() => expect(screen.getByTestId('group-needs-moving')).toBeTruthy())
    expect(within(screen.getByTestId('group-needs-moving')).getByText(/Move here \(stub\) Cultivate/)).toBeTruthy()
    expect(within(screen.getByTestId('group-available')).queryByText(/Move here/)).toBeNull()
    expect(within(screen.getByTestId('group-unowned')).queryByText(/Move here/)).toBeNull()
  })

  it('shows the price or "Price unknown" for unowned cards, and a buy ideas link', async () => {
    setup({ ...full, cards: [...full.cards, row(5, 'Black Lotus', [])], unownedPrices: { 'Mox Diamond': 12.5, 'Black Lotus': null } })
    await waitFor(() => expect(screen.getByTestId('group-unowned')).toBeTruthy())
    const unowned = within(screen.getByTestId('group-unowned'))
    expect(unowned.getByText(/\$12\.50/)).toBeTruthy()
    expect(unowned.getByText('Price unknown')).toBeTruthy()
    expect(unowned.getByRole('link', { name: /buy ideas/i })).toBeTruthy()
  })

  it('still works when the server sends none of the new fields', async () => {
    const old = { deckName: full.deckName, cards: full.cards, progress: full.progress }
    setup(old)
    await waitFor(() => expect(screen.getByTestId('group-unowned')).toBeTruthy())
    expect(within(screen.getByTestId('group-unowned')).getByText('Price unknown')).toBeTruthy()
  })

  it('shows a friendly empty message for empty groups', async () => {
    setup({ deckName: 'D', cards: [row(1, 'Sol Ring', [cand({})])], progress: { resolved: 0, total: 1 } })
    await waitFor(() => expect(screen.getByTestId('group-needs-moving')).toBeTruthy())
    expect(screen.getByText('Nothing needs to move from another deck.')).toBeTruthy()
    expect(screen.getByText('You own everything this deck needs.')).toBeTruthy()
  })

  it('shows the error state with Try again', async () => {
    setup({}, false)
    await waitFor(() => expect(screen.getByText(/Couldn't load this deck's Picklist/)).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

describe('PicklistV2 saved ticks (Found it / Placed it / Can\'t find it)', () => {
  function setupWithTicks(body: unknown, tickResponse: { status: number; json: unknown } = { status: 200, json: { itemId: 1, state: 'found', unchanged: false, sourceDeckNowShort: [], decksNowShort: [], filledDeckCardId: null } }) {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) =>
      String(url).startsWith('/api/picklist/')
        ? Promise.resolve(new Response(JSON.stringify(tickResponse.json), { status: tickResponse.status }))
        : Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><PicklistV2 deckId={7} /></QueryClientProvider>)
    return fetchMock
  }
  const handItem = {
    itemId: 11, state: 'found', copyId: 21, deckCardsId: 2, cardName: 'Cultivate', isProxy: false,
    from: { kind: 'deck', deckId: 3, name: 'Prosper' },
  }

  it('Found it saves one step for that exact copy and slot, and announces it', async () => {
    const fetchMock = setupWithTicks(full, { status: 200, json: { itemId: 1, state: 'found', unchanged: false, sourceDeckNowShort: [{ deckId: 3, deckName: 'Prosper', cardName: 'Sol Ring' }], decksNowShort: [], filledDeckCardId: null } })
    await waitFor(() => expect(screen.getByTestId('group-available')).toBeTruthy())
    fireEvent.click(within(screen.getByTestId('group-available')).getByRole('button', { name: 'Picked: Sol Ring' }))
    await waitFor(() => expect(screen.getByTestId('picklist-announce').textContent).toContain('Sol Ring is in your hand. Prosper is now short by one.'))
    const tickCall = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/picklist/found')!
    expect(JSON.parse((tickCall[1] as RequestInit).body as string)).toEqual({
      copyId: 1, cardName: 'Sol Ring', to: { kind: 'deck', deckId: 7, deckCardId: 1 },
    })
  })

  it('Can\'t find it uses its own step', async () => {
    const fetchMock = setupWithTicks(full, { status: 200, json: { itemId: 1, state: 'missing', unchanged: false, sourceDeckNowShort: [], decksNowShort: [], filledDeckCardId: null } })
    await waitFor(() => expect(screen.getByTestId('group-available')).toBeTruthy())
    fireEvent.click(within(screen.getByTestId('group-available')).getByRole('button', { name: "Can't find it: Sol Ring" }))
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]) === '/api/picklist/cant-find')).toBe(true))
  })

  it('a refused tick shows the plain message and leaves the row where it was', async () => {
    setupWithTicks(full, { status: 409, json: { error: 'copy_missing', message: 'Sol Ring is marked Missing, so it can\'t be picked up or placed.' } })
    await waitFor(() => expect(screen.getByTestId('group-available')).toBeTruthy())
    fireEvent.click(within(screen.getByTestId('group-available')).getByRole('button', { name: 'Picked: Sol Ring' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('marked Missing')))
    expect(within(screen.getByTestId('group-available')).getByRole('button', { name: 'Picked: Sol Ring' })).toBeTruthy()
  })

  it('shows a picked-up card as In your hand in the group it came from, with Placed it, and not as its old row', async () => {
    setupWithTicks({ ...full, moveItems: [handItem], progress: { resolved: 1, total: 4 } })
    await waitFor(() => expect(screen.getByTestId('group-needs-moving')).toBeTruthy())
    const needs = within(screen.getByTestId('group-needs-moving'))
    expect(needs.getByText('In your hand')).toBeTruthy()
    expect(needs.getByText(/From Prosper/)).toBeTruthy()
    expect(needs.getByRole('button', { name: 'Placed: Cultivate' })).toBeTruthy()
    expect(needs.queryByText(/Move here \(stub\) Cultivate/)).toBeNull() // the slot is no longer a plain row
    expect(screen.getByTestId('picklist-summary').textContent).toContain('1 in your hand')
  })

  it('Placed it on a hand row targets that deck and slot', async () => {
    const fetchMock = setupWithTicks({ ...full, moveItems: [handItem] }, { status: 200, json: { itemId: 11, state: 'placed', unchanged: false, sourceDeckNowShort: [], decksNowShort: [], filledDeckCardId: 2 } })
    await waitFor(() => expect(screen.getByTestId('group-needs-moving')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Placed: Cultivate' }))
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]) === '/api/picklist/placed')).toBe(true))
    const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/picklist/placed')!
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({ copyId: 21, to: { kind: 'deck', deckId: 7, deckCardId: 2 } })
  })

  it('shows a Missing card with its words and keeps the slot planned', async () => {
    setupWithTicks({ ...full, moveItems: [{ ...handItem, state: 'missing', from: { kind: 'box', name: 'Box A' } }] })
    await waitFor(() => expect(screen.getByTestId('group-available')).toBeTruthy())
    const available = within(screen.getByTestId('group-available'))
    expect(available.getByText('Missing')).toBeTruthy()
    expect(available.getByText(/Short by 1\. Your only copy is Missing\./)).toBeTruthy()
    expect(available.getByRole('link', { name: 'Where to look next' })).toBeTruthy()
  })

  it('Walk it instead reveals Found it and a disabled Placed it', async () => {
    setupWithTicks(full)
    await waitFor(() => expect(screen.getByTestId('group-needs-moving')).toBeTruthy())
    const needs = within(screen.getByTestId('group-needs-moving'))
    fireEvent.click(needs.getByRole('button', { name: 'Walk it instead' }))
    expect(needs.getByRole('button', { name: 'Picked: Cultivate' })).toBeTruthy()
    expect((needs.getByRole('button', { name: 'Placed: Cultivate' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
