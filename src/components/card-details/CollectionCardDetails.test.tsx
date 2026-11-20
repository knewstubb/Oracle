import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CollectionCardDetails } from './CollectionCardDetails'
import { resetCardDetailsTabMemory } from './CardDetailsShell'
import type { CollectionCardDetails as Details } from '@/lib/card-details/load-collection'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const rest = { ...props }
    delete rest.blurDataURL
    delete rest.unoptimized
    delete rest.priority
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />
  },
}))

const SF = 'abcd0000-0000-0000-0000-000000000001'
function baseDetails(): Details {
  return {
    oracleId: 'oid-1',
    cardName: 'Sol Ring',
    facts: { name: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', typeLine: 'Artifact', manaCost: '{1}', manaValue: 1, colourIdentity: '', power: null, toughness: null, loyalty: null },
    tags: [{ key: 'ramp', displayName: 'Ramp', kind: 'broad' }],
    printings: [
      { scryfallId: SF, setCode: 'c21', setName: 'Commander 2021', collectorNumber: '263', rarity: 'uncommon', finish: 'nonfoil', priceUsd: 2.1, releasedAt: '2021-04-23', imageSmall: null, imageNormal: null, owned: 1, isSlotPrinting: false },
      { scryfallId: 'b2', setCode: 'cmr', setName: 'Commander Legends', collectorNumber: '472', rarity: 'uncommon', finish: 'foil', priceUsd: 4.8, releasedAt: '2020-11-20', imageSmall: null, imageNormal: null, owned: 0, isSlotPrinting: false },
    ],
    copies: [
      { copyId: 11, isProxy: false, finish: 'foil', condition: 'near_mint', printingId: 'b2', printing: { setCode: 'cmr', setName: 'Commander Legends', collectorNumber: '472' }, priceUsd: 4.8, storage: { id: 3, name: 'Binder 2' }, assigned: { deckId: 9, deckName: 'Auntie Ool', deckState: 'playable', deckCardsId: 90 }, state: 'in_deck' },
      { copyId: 12, isProxy: true, finish: 'nonfoil', condition: null, printingId: SF, printing: { setCode: 'c21', setName: 'Commander 2021', collectorNumber: '263' }, priceUsd: null, storage: { id: null, name: null }, assigned: { deckId: 8, deckName: 'The Fairmaker', deckState: 'brewing', deckCardsId: 91 }, state: 'in_deck' },
      { copyId: 10, isProxy: false, finish: 'nonfoil', condition: 'lightly_played', printingId: SF, printing: { setCode: 'c21', setName: 'Commander 2021', collectorNumber: '263' }, priceUsd: 2.1, storage: { id: 3, name: 'Binder 2' }, assigned: null, state: 'open' },
    ],
    waitingDecks: [{ deckCardsId: 50, deckId: 4, deckName: 'Rocco', deckState: 'brewing' }],
    rulings: [{ publishedAt: '2007-10-01', comment: 'A ruling.' }],
    commanderLegality: 'legal',
    ownedCount: 3,
    collectionValue: 6.9,
    cheapest: 2.1,
    imageScryfallId: SF,
  }
}

let details: Details
let log: Array<{ url: string; method: string; body: unknown }>
let failUrl: string | null
beforeEach(() => {
  resetCardDetailsTabMemory()
  details = baseDetails()
  log = []
  failUrl = null
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    const method = init?.method ?? 'GET'
    log.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json })
    if (failUrl && u.includes(failUrl)) return { ok: false, status: 500, json: async () => ({ error: 'boom' }) }
    if (u.endsWith('/details')) return ok(details)
    if (u.includes('/api/settings/storage-locations')) return ok([{ id: 3, name: 'Binder 2', color: null }, { id: 4, name: 'Box', color: null }])
    if (u.includes('/api/allocation/valid-decks')) return ok([{ deckId: 4, deckName: 'Rocco', deckStatus: 'brewing' }])
    return ok({ ok: true })
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function open(over: { selected?: Set<number>; onToggle?: (id: number) => void; onClose?: () => void } = {}) {
  const selected = over.selected ?? new Set<number>()
  const onToggle = over.onToggle ?? vi.fn()
  const onClose = over.onClose ?? vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={qc}>
      <CollectionCardDetails oracleId="oid-1" cardName="Sol Ring" isInstanceSelected={(id) => selected.has(id)} onToggleInstance={onToggle} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { ...utils, onToggle, onClose }
}
const calls = (part: string) => log.filter((l) => l.url.includes(part) && l.method !== 'GET')
async function goTo(tab: string) {
  await screen.findByTestId('card-details-own-pill')
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${tab}`) }))
}
async function openMenu(user: ReturnType<typeof userEvent.setup>, copyId: number, item: string) {
  await user.click(screen.getByRole('button', { name: `More actions for copy ${copyId}` }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
}
const rowFor = (copyId: number) => screen.getByLabelText(new RegExp(`^Select copy ${copyId} `)).closest('tr') as HTMLElement

describe('collection window: rail and header', () => {
  it('shows You own N, Collection value, Cheapest and Commander legality', async () => {
    open()
    expect(await screen.findByTestId('card-details-own-pill')).toHaveTextContent('You own 3')
    expect(screen.getByTestId('card-details-rail-value')).toHaveTextContent('$6.90')
    expect(screen.getByTestId('card-details-rail-cheapest')).toHaveTextContent('$2.10')
    expect(screen.getByTestId('card-details-rail')).toHaveTextContent('Legal')
  })
  it("says You don't own it at zero copies", async () => {
    details = { ...baseDetails(), copies: [], ownedCount: 0, collectionValue: null, waitingDecks: [] }
    open()
    expect(await screen.findByTestId('card-details-own-pill')).toHaveTextContent("You don't own it")
    expect(screen.getByTestId('card-details-rail-value')).toHaveTextContent('—')
  })
  it('lists decks for "Add to a deck" and posts the card name; there is no "Add a copy"', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByTestId('card-details-own-pill')
    expect(screen.queryByRole('button', { name: /add a copy/i })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add to a deck' }))
    await user.click(await screen.findByRole('button', { name: /Rocco/ }))
    await waitFor(() => expect(calls('/api/decks/4/cards')).toHaveLength(1))
    expect(calls('/api/decks/4/cards')[0].body).toEqual({ cardName: 'Sol Ring' })
  })
  it('closes on Escape and moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup()
    const { onClose } = open()
    await screen.findByTestId('card-details-own-pill')
    await user.click(screen.getByRole('tab', { name: /^Overview/ }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /^Printings/ })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
  it('remembers the last tab for the collection separately from the deck', async () => {
    const first = open()
    await goTo('Rulings')
    first.unmount()
    open()
    await screen.findByTestId('card-details-own-pill')
    expect(screen.getByRole('tab', { name: /^Rulings/ })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('collection window: Overview', () => {
  it('lists each copy with its place, state and condition, in the convention words', async () => {
    open()
    const rows = await screen.findAllByTestId('card-details-where-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Auntie Ool')
    expect(rows[0]).toHaveTextContent('Playable · NM')
    expect(rows[1]).toHaveTextContent('The Fairmaker')
    expect(rows[1]).toHaveTextContent('Brewing · Proxy')
    expect(rows[2]).toHaveTextContent('Binder 2')
    expect(rows[2]).toHaveTextContent('Open · LP')
    const text = screen.getByTestId('card-details-where').textContent ?? ''
    expect(text).not.toMatch(/Sleeved|Free/)
  })
  it('sleeves the free copy into a waiting deck with the right request', async () => {
    open()
    const row = await screen.findByTestId('card-details-waiting-row')
    expect(row).toHaveTextContent('Planned, not sleeved')
    fireEvent.click(within(row).getByRole('button', { name: 'Sleeve free copy' }))
    await waitFor(() => expect(calls('/api/allocation/assign-free-copy')).toHaveLength(1))
    expect(calls('/api/allocation/assign-free-copy')[0].body).toEqual({ copyId: 10, targetDeckId: 4, cardName: 'Sol Ring' })
  })
  it('offers Add proxy when no copy is Open, and sends the slot', async () => {
    details = { ...baseDetails(), copies: baseDetails().copies.filter((c) => c.state !== 'open') }
    open()
    const row = await screen.findByTestId('card-details-waiting-row')
    expect(within(row).queryByRole('button', { name: 'Sleeve free copy' })).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'Add proxy' }))
    await waitFor(() => expect(calls('/api/allocation/add-proxy')).toHaveLength(1))
    expect(calls('/api/allocation/add-proxy')[0].body).toEqual({ deckCardsId: 50 })
  })
  it('keeps the row and says nothing was changed when sleeving fails', async () => {
    failUrl = '/api/allocation/assign-free-copy'
    open()
    const row = await screen.findByTestId('card-details-waiting-row')
    fireEvent.click(within(row).getByRole('button', { name: 'Sleeve free copy' }))
    expect(await screen.findByText("Couldn't sleeve that copy. Nothing was changed.")).toBeInTheDocument()
    expect(screen.getAllByTestId('card-details-waiting-row')).toHaveLength(1)
  })
  it('shows the empty lines', async () => {
    details = { ...baseDetails(), copies: [], waitingDecks: [], ownedCount: 0 }
    open()
    expect(await screen.findByText('None of your copies yet.')).toBeInTheDocument()
    expect(screen.getByText('No deck is waiting for this card.')).toBeInTheDocument()
  })
})

describe('collection window: Printings', () => {
  it('has no radio and no "Add a copy", and filters to the printings you own', async () => {
    open()
    await goTo('Printings')
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /add a copy/i })).toBeNull()
    expect(screen.getAllByTestId('card-details-printing-row')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /^You own/ }))
    expect(screen.getAllByTestId('card-details-printing-row')).toHaveLength(1)
  })
})

describe('collection window: Copies', () => {
  it('shows every copy of the card with price, and a dash for Proxy condition', async () => {
    open()
    await goTo('Copies')
    expect(screen.getAllByTestId('card-details-copy-row')).toHaveLength(3)
    expect(within(rowFor(11)).getByText('$4.80')).toBeInTheDocument()
    expect(within(rowFor(12)).queryByRole('combobox', { name: /Condition/ })).toBeNull()
    expect(within(rowFor(12)).getByRole('button', { name: 'Replace with original' })).toBeInTheDocument()
  })
  it('saves condition on change with Saving then Saved, writing the stored word', async () => {
    open()
    await goTo('Copies')
    fireEvent.change(screen.getByLabelText('Condition for copy 10'), { target: { value: 'moderately_played' } })
    await waitFor(() => expect(calls('/api/collection/instances/condition')).toHaveLength(1))
    expect(calls('/api/collection/instances/condition')[0].body).toEqual({ copyId: 10, condition: 'moderately_played' })
    expect(calls('/api/collection/instances/condition')[0].method).toBe('PATCH')
    expect(await screen.findByText(/^Saved at/)).toBeInTheDocument()
  })
  it('a failed condition save shows the error with Try again and changes nothing', async () => {
    failUrl = '/api/collection/instances/condition'
    open()
    await goTo('Copies')
    const select = screen.getByLabelText('Condition for copy 10') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'damaged' } })
    expect(await screen.findByText("Couldn't save. Nothing was changed.")).toBeInTheDocument()
    expect(select.value).toBe('lightly_played')
    failUrl = null
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(calls('/api/collection/instances/condition')).toHaveLength(2))
    expect(await screen.findByText(/^Saved at/)).toBeInTheDocument()
  })
  it('saves the storage place on change and shows no storage select for a copy in a deck', async () => {
    open()
    await goTo('Copies')
    expect(screen.queryByLabelText('Storage location for copy 11')).toBeNull()
    const select = await screen.findByLabelText('Storage location for copy 10')
    await waitFor(() => expect(within(select as HTMLElement).getByRole('option', { name: 'Box' })).toBeInTheDocument())
    fireEvent.change(select, { target: { value: '4' } })
    await waitFor(() => expect(calls('/api/collection/assign-location')).toHaveLength(1))
    expect(calls('/api/collection/assign-location')[0].body).toEqual({ physicalCopyId: 10, storageLocationId: 4 })
    expect(await screen.findByText(/^Saved at/)).toBeInTheDocument()
  })
  it('a failed storage save shows the error and keeps the old place', async () => {
    failUrl = '/api/collection/assign-location'
    open()
    await goTo('Copies')
    const select = (await screen.findByLabelText('Storage location for copy 10')) as HTMLSelectElement
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Box' })).toBeInTheDocument())
    fireEvent.change(select, { target: { value: '4' } })
    expect(await screen.findByText("Couldn't save. Nothing was changed.")).toBeInTheDocument()
    await waitFor(() => expect(select.value).toBe('3'))
  })
  it('replaces a Proxy with an Open original using the field names the route reads', async () => {
    open()
    await goTo('Copies')
    fireEvent.click(within(rowFor(12)).getByRole('button', { name: 'Replace with original' }))
    fireEvent.click(await screen.findByLabelText('Unsorted'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(calls('/api/allocation/replace-with-original')).toHaveLength(1))
    expect(calls('/api/allocation/replace-with-original')[0].body).toEqual({ proxyCopyId: 12, originalCopyId: 10, proxyStorageLocationId: null })
  })
  it('says there is no Open original instead of sending anything', async () => {
    details = { ...baseDetails(), copies: baseDetails().copies.filter((c) => c.state !== 'open') }
    open()
    await goTo('Copies')
    fireEvent.click(within(rowFor(12)).getByRole('button', { name: 'Replace with original' }))
    expect(await screen.findByTestId('card-details-no-original')).toHaveTextContent('No Open original copy to replace it with.')
    expect(calls('/api/allocation/replace-with-original')).toHaveLength(0)
  })
  it('unassigns with copyId after choosing where it goes', async () => {
    const user = userEvent.setup()
    open()
    await goTo('Copies')
    await openMenu(user, 12, 'Unassign')
    fireEvent.click(await screen.findByLabelText('Unsorted'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(calls('/api/collection/instances/unassign')).toHaveLength(1))
    expect(calls('/api/collection/instances/unassign')[0].body).toEqual({ copyId: 12 })
    await waitFor(() => expect(calls('/api/collection/assign-location')).toHaveLength(1))
  })
  it('warns that a Playable deck drops to Assembling before unassigning, and sends nothing until confirmed', async () => {
    const user = userEvent.setup()
    open()
    await goTo('Copies')
    await openMenu(user, 11, 'Unassign')
    expect(await screen.findByTestId('card-details-unassign-warning')).toHaveTextContent('Auntie Ool is Playable, so it will become Assembling.')
    expect(calls('/api/collection/instances/unassign')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /^Confirm unassign/ }))
    expect(await screen.findByLabelText('Unsorted')).toBeInTheDocument()
    expect(calls('/api/collection/instances/unassign')).toHaveLength(0)
  })
  it('asks before deleting, Cancel sends nothing, Confirm sends copyId', async () => {
    const user = userEvent.setup()
    open()
    await goTo('Copies')
    await openMenu(user, 10, 'Delete')
    expect(await screen.findByTestId('card-details-delete-confirm')).toHaveTextContent('Delete this copy permanently?')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(calls('/api/collection/instances/delete')).toHaveLength(0)
    await openMenu(user, 10, 'Delete')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(calls('/api/collection/instances/delete')).toHaveLength(1))
    expect(calls('/api/collection/instances/delete')[0].body).toEqual({ copyId: 10 })
  })
  it('moves an Open copy to a deck that is waiting for it', async () => {
    const user = userEvent.setup()
    open()
    await goTo('Copies')
    await openMenu(user, 10, 'Move to a deck')
    fireEvent.click(await screen.findByRole('button', { name: 'Rocco' }))
    await waitFor(() => expect(calls('/api/allocation/assign-free-copy')).toHaveLength(1))
    expect(calls('/api/allocation/assign-free-copy')[0].body).toEqual({ copyId: 10, targetDeckId: 4, cardName: 'Sol Ring' })
  })
  it('warns before moving a copy out of a Playable deck, and moves only after Confirm', async () => {
    const user = userEvent.setup()
    open()
    await goTo('Copies')
    await openMenu(user, 11, 'Move to a deck')
    fireEvent.click(await screen.findByRole('button', { name: 'Rocco' }))
    expect(await screen.findByTestId('card-details-move-warning')).toHaveTextContent('Auntie Ool is Playable, so it will become Assembling.')
    expect(calls('/api/allocation/reassign-to-deck')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /^Confirm move/ }))
    await waitFor(() => expect(calls('/api/allocation/reassign-to-deck')).toHaveLength(1))
    expect(calls('/api/allocation/reassign-to-deck')[0].body).toEqual({ copyId: 11, targetDeckId: 4, cardName: 'Sol Ring' })
  })
  it('Cancel on the Playable warning sends nothing', async () => {
    const user = userEvent.setup()
    open()
    await goTo('Copies')
    await openMenu(user, 11, 'Move to a deck')
    fireEvent.click(await screen.findByRole('button', { name: 'Rocco' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(calls('/api/allocation/reassign-to-deck')).toHaveLength(0)
    expect(screen.queryByTestId('card-details-move-warning')).toBeNull()
  })
  it('adds a proxy from the toolbar with the card oracle id', async () => {
    open()
    await goTo('Copies')
    fireEvent.click(screen.getByRole('button', { name: 'Add a proxy' }))
    await waitFor(() => expect(calls('/api/collection/instances/add-proxy')).toHaveLength(1))
    expect(calls('/api/collection/instances/add-proxy')[0].body).toEqual({ oracleId: 'oid-1' })
  })
})

describe('collection window: bulk selection', () => {
  it('ticking a copy calls onToggleInstance with its id and checked comes from isInstanceSelected', async () => {
    const onToggle = vi.fn()
    open({ selected: new Set([11]), onToggle })
    await goTo('Copies')
    expect(screen.getByLabelText(/^Select copy 11 /)).toBeChecked()
    expect(screen.getByLabelText(/^Select copy 10 /)).not.toBeChecked()
    expect(screen.getByTestId('card-details-selected-count')).toHaveTextContent('1 selected')
    fireEvent.click(screen.getByLabelText(/^Select copy 10 /))
    expect(onToggle).toHaveBeenCalledWith(10)
  })
  it('select all toggles only the rows that are not selected, then all when everything is selected', async () => {
    const onToggle = vi.fn()
    const first = open({ selected: new Set([11]), onToggle })
    await goTo('Copies')
    fireEvent.click(screen.getByLabelText('Select all copies'))
    expect(onToggle.mock.calls.map((c) => c[0]).sort()).toEqual([10, 12])
    first.unmount()
    onToggle.mockClear()
    open({ selected: new Set([10, 11, 12]), onToggle })
    await goTo('Copies')
    fireEvent.click(screen.getByLabelText('Select all copies'))
    expect(onToggle.mock.calls.map((c) => c[0]).sort()).toEqual([10, 11, 12])
  })
})
