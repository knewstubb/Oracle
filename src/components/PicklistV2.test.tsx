import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PicklistV2 } from './PicklistV2'

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
    expect(available.getByRole('button', { name: /Placed it: Sol Ring/ })).toBeTruthy()
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
