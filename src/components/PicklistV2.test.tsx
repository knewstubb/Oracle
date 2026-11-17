import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, within, fireEvent, act } from '@testing-library/react'
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

describe('PicklistV2 instant ticks (optimistic)', () => {
  const okTick = { itemId: 1, state: 'found', unchanged: false, sourceDeckNowShort: [], decksNowShort: [], filledDeckCardId: null }
  const handItem = {
    itemId: 11, state: 'found', copyId: 21, deckCardsId: 2, cardName: 'Cultivate', isProxy: false,
    from: { kind: 'deck', deckId: 3, name: 'Prosper' },
  }
  /** The tick request waits until the test answers it, like a slow server. */
  function setupSlow(body: () => unknown) {
    let answer: (r: Response | Error) => void = () => undefined
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (String(url).startsWith('/api/picklist/')) {
        return new Promise<Response>((resolve, reject) => { answer = (r) => (r instanceof Error ? reject(r) : resolve(r)) })
      }
      return Promise.resolve(new Response(JSON.stringify(body()), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><PicklistV2 deckId={7} /></QueryClientProvider>)
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status })
    return { fetchMock, client, answer: (r: Response | Error) => act(async () => { answer(r) }), json }
  }
  const tickCalls = (f: ReturnType<typeof vi.fn>, seg: string) => f.mock.calls.filter((c) => String(c[0]) === `/api/picklist/${seg}`).length

  it('Picked moves the card into In your hand at once, before the server answers', async () => {
    const { fetchMock } = setupSlow(() => full)
    await waitFor(() => expect(screen.getByTestId('group-available')).toBeTruthy())
    const t0 = performance.now()
    fireEvent.click(within(screen.getByTestId('group-available')).getByRole('button', { name: 'Picked: Sol Ring' }))
    const available = within(screen.getByTestId('group-available'))
    const elapsed = performance.now() - t0
    expect(available.getByText('In your hand')).toBeTruthy()
    expect(available.getByText(/Saving…/)).toBeTruthy()
    expect(available.queryByRole('button', { name: 'Picked: Sol Ring' })).toBeNull()
    expect(screen.getByTestId('picklist-summary').textContent).toContain('1 in your hand')
    expect(elapsed).toBeLessThan(100)
    expect(tickCalls(fetchMock, 'found')).toBe(1) // the save was sent, and has not been answered
  })

  it('Placed on an In your hand row removes the card from the list at once', async () => {
    const { answer, json } = setupSlow(() => ({ ...full, moveItems: [handItem] }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Placed: Cultivate' })).toBeTruthy())
    expect(screen.getByTestId('picklist-summary').textContent).toContain('1 of 4 ready')
    fireEvent.click(screen.getByRole('button', { name: 'Placed: Cultivate' }))
    expect(screen.queryByRole('button', { name: 'Placed: Cultivate' })).toBeNull()
    expect(screen.queryByText(/Move here \(stub\) Cultivate/)).toBeNull()
    expect(screen.getByTestId('picklist-summary').textContent).toContain('2 of 4 ready')
    await answer(json(200, { ...okTick, state: 'placed', filledDeckCardId: 2 }))
  })

  it('Can\'t find it shows the card as Missing at once', async () => {
    setupSlow(() => full)
    await waitFor(() => expect(screen.getByTestId('group-available')).toBeTruthy())
    fireEvent.click(within(screen.getByTestId('group-available')).getByRole('button', { name: "Can't find it: Sol Ring" }))
    expect(within(screen.getByTestId('group-available')).getByText('Missing')).toBeTruthy()
  })

  it('puts the card back with the plain message when the server refuses', async () => {
    const { answer, json } = setupSlow(() => full)
    await waitFor(() => expect(screen.getByTestId('group-available')).toBeTruthy())
    fireEvent.click(within(screen.getByTestId('group-available')).getByRole('button', { name: 'Picked: Sol Ring' }))
    expect(screen.getByTestId('picklist-summary').textContent).toContain('1 in your hand')
    await answer(json(409, { error: 'copy_missing', message: "Sol Ring is marked Missing, so it can't be picked up or placed." }))
    expect(toast.error).toHaveBeenCalledWith("Sol Ring is marked Missing, so it can't be picked up or placed.")
    expect(within(screen.getByTestId('group-available')).getByRole('button', { name: 'Picked: Sol Ring' })).toBeTruthy()
    expect(screen.getByTestId('picklist-summary').textContent).not.toContain('in your hand')
  })

  it('puts the card back with the plain message when the network fails', async () => {
    const { answer } = setupSlow(() => full)
    await waitFor(() => expect(screen.getByTestId('group-available')).toBeTruthy())
    fireEvent.click(within(screen.getByTestId('group-available')).getByRole('button', { name: 'Picked: Sol Ring' }))
    await answer(new TypeError('Failed to fetch'))
    expect(toast.error).toHaveBeenCalledWith("Couldn't save that. Sol Ring is still where Oracle had it.")
    expect(within(screen.getByTestId('group-available')).getByRole('button', { name: 'Picked: Sol Ring' })).toBeTruthy()
  })

  it('a rolled-back Placed brings the card back into In your hand', async () => {
    const { answer, json } = setupSlow(() => ({ ...full, moveItems: [handItem] }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Placed: Cultivate' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Placed: Cultivate' }))
    await answer(json(409, { error: 'wrong_state', message: 'Cultivate has already moved on. Refresh to see where it is now.' }))
    expect(toast.error).toHaveBeenCalledWith('Cultivate has already moved on. Refresh to see where it is now.')
    expect(screen.getByRole('button', { name: 'Placed: Cultivate' })).toBeTruthy()
    expect(screen.getByTestId('picklist-summary').textContent).toContain('1 of 4 ready')
  })

  it('a double click sends one save', async () => {
    const { fetchMock } = setupSlow(() => ({ ...full, moveItems: [handItem] }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Placed: Cultivate' })).toBeTruthy())
    const button = screen.getByRole('button', { name: 'Placed: Cultivate' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(tickCalls(fetchMock, 'placed')).toBe(1)
  })

  it('a re-read of the Picklist while the save is running does not undo the move', async () => {
    const { client, answer, json, fetchMock } = setupSlow(() => full) // the server still shows the old state
    await waitFor(() => expect(screen.getByTestId('group-available')).toBeTruthy())
    fireEvent.click(within(screen.getByTestId('group-available')).getByRole('button', { name: 'Picked: Sol Ring' }))
    const reads = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/picklist') && !String(c[0]).startsWith('/api/picklist/')).length
    await act(async () => { await client.invalidateQueries({ queryKey: ['picklist', 7] }) })
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/picklist') && !String(c[0]).startsWith('/api/picklist/')).length).toBeGreaterThan(reads)
    expect(within(screen.getByTestId('group-available')).getByText('In your hand')).toBeTruthy()
    expect(within(screen.getByTestId('group-available')).queryByRole('button', { name: 'Picked: Sol Ring' })).toBeNull()
    await answer(json(200, okTick))
  })

  it('once saved and re-read, the server answer takes over without a duplicate row', async () => {
    let saved = false
    const { answer, json } = setupSlow(() => (saved ? { ...full, moveItems: [{ itemId: 5, state: 'found', copyId: 1, deckCardsId: 1, cardName: 'Sol Ring', isProxy: false, from: { kind: 'box', name: 'Box A' } }] } : full))
    await waitFor(() => expect(screen.getByTestId('group-available')).toBeTruthy())
    fireEvent.click(within(screen.getByTestId('group-available')).getByRole('button', { name: 'Picked: Sol Ring' }))
    saved = true
    await answer(json(200, okTick))
    await waitFor(() => expect(screen.queryByText(/Saving…/)).toBeNull())
    expect(screen.getAllByText('In your hand')).toHaveLength(1)
    expect(screen.getByTestId('picklist-summary').textContent).toContain('1 in your hand')
  })
})
