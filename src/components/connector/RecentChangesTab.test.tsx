import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('sonner', () => ({ toast: vi.fn() }))
vi.mock('./api', async (orig) => {
  const real = await orig<typeof import('./api')>()
  return { ...real, fetchChanges: vi.fn(), fetchPending: vi.fn(), undoGroup: vi.fn(), decidePending: vi.fn() }
})

import * as api from './api'
import { RecentChangesTab } from './RecentChangesTab'

const now = new Date().toISOString()
const row = (over: Partial<api.ChangeRowData> = {}): api.ChangeRowData => ({
  id: 'r1', group_id: 'g1', kind: 'deck_add', client_name: 'Claude on the phone',
  deck_id: 7, deck_name: 'Rocco', other_deck_id: null, other_deck_name: null,
  card_name: 'Swords to Plowshares', oracle_id: null, printing_id: null,
  approved_by_owner: false, created_at: now, undoable_until: now, undone_at: null, undone_by: null,
  owner_only: false, undo_blocker: null,
  summary: 'Added Swords to Plowshares to Rocco. It is on the list, Planned. No copy was moved.',
  ...over,
})
const counts = (size: number, sleeved: number) => ({ size, sleeved, unsleeved_generics: 0 })
const moveItem = (over: Partial<api.PendingItem> = {}): api.PendingItem => ({
  id: 'p1', kind: 'copy_move', action: 'copy_move', reason: 'card_move', deck_id: 1, deck_name: 'Prosper',
  other_deck_id: 2, other_deck_name: 'Korvold', card_count: 1, status: 'waiting', client_name: 'Claude on the phone',
  created_at: now, expires_at: now, decided_at: null, failure_reason: null, cancel_reason: null,
  title: 'Move Sol Ring from Prosper to Korvold?',
  preview: {
    cards: [{ name: 'Sol Ring', quantity: 1 }],
    decks: [
      { deck_id: 2, name: 'Korvold', role: 'gains', before: counts(100, 80), after: counts(100, 81) },
      { deck_id: 1, name: 'Prosper', role: 'loses', before: counts(100, 100), after: counts(100, 99) },
    ],
  },
  ...over,
})
const bigItem = (): api.PendingItem => moveItem({
  id: 'p2', kind: 'big_edit', action: 'deck_remove', reason: 'over_ten', card_count: 15, title: 'Cut 15 cards from Rocco?',
  preview: {
    cards: Array.from({ length: 15 }, (_, i) => ({ name: `Card ${i}`, quantity: 1 })),
    decks: [{ deck_id: 3, name: 'Rocco', role: 'changes', before: counts(100, 90), after: counts(85, 75) }],
  },
})

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><RecentChangesTab /></QueryClientProvider>)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('RecentChangesTab', () => {
  it('shows a loading state with aria-busy', () => {
    vi.mocked(api.fetchChanges).mockReturnValue(new Promise(() => {}))
    vi.mocked(api.fetchPending).mockReturnValue(new Promise(() => {}))
    setup()
    expect(screen.getByText("Loading Claude's recent changes…")).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  it('shows the empty state only after a successful empty answer', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([])
    vi.mocked(api.fetchPending).mockResolvedValue([])
    setup()
    expect(await screen.findByText("Claude hasn't changed anything in the last 7 days")).toBeInTheDocument()
    expect(screen.getByText(/it will show up here with an Undo button/)).toBeInTheDocument()
  })

  it('shows an error, never the empty state, when loading fails, and retries', async () => {
    vi.mocked(api.fetchChanges).mockRejectedValueOnce(new Error('x')).mockResolvedValue([])
    vi.mocked(api.fetchPending).mockResolvedValue([])
    setup()
    const alert = await screen.findByText("We couldn't load Claude's recent changes. This doesn't mean there are none.")
    expect(alert).toBeInTheDocument()
    expect(screen.queryByTestId('changes-empty')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('changes-empty')).toBeInTheDocument()
  })

  it('does not call a failed pending lookup "nothing waiting"', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([])
    vi.mocked(api.fetchPending).mockRejectedValue(new Error('x'))
    setup()
    expect(await screen.findByText(/This doesn't mean nothing is waiting/)).toBeInTheDocument()
    expect(screen.queryByTestId('changes-empty')).toBeNull()
  })

  it('lists applied changes with the 7-day caption, grouped by day, with Undo', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([row()])
    vi.mocked(api.fetchPending).mockResolvedValue([])
    setup()
    expect(await screen.findByText(/Added Swords to Plowshares to Rocco/)).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText(/Showing the last 7 days/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Undo/ })).toBeInTheDocument()
  })

  it('puts pending first: a move card and a big edit card with Approve and Decline', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([row()])
    vi.mocked(api.fetchPending).mockResolvedValue([moveItem(), bigItem()])
    setup()
    const heading = await screen.findByRole('heading', { name: /Waiting for your yes \(2\)/ })
    const applied = screen.getByRole('heading', { name: 'Changes Claude made' })
    expect(heading.compareDocumentPosition(applied) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(/Only you can approve these/)).toBeInTheDocument()
    expect(screen.getByText(/Only you can approve these/).parentElement?.textContent).toContain('approve these. Claude can ask')
    const [move, big] = screen.getAllByTestId('pending-card')
    expect(within(move).getByText('Move Sol Ring from Prosper to Korvold?')).toBeInTheDocument()
    // losing deck first
    const boxes = within(move).getAllByTestId('pending-deck-box')
    expect(boxes[0]).toHaveTextContent('Prosper')
    expect(boxes[0]).toHaveTextContent('(loses a card)')
    expect(boxes[1]).toHaveTextContent('(gains a card)')
    expect(within(move).getByText(/Nothing is lost or duplicated/)).toBeInTheDocument()
    expect(within(move).getByRole('button', { name: 'Approve move' })).toBeInTheDocument()
    expect(within(big).getByRole('button', { name: 'Approve all 15' })).toBeInTheDocument()
    expect(within(big).getByText('The copies go back to storage, not deleted.')).toBeInTheDocument()
    expect(within(big).getByRole('button', { name: 'See the 15 cards' })).toBeInTheDocument()
    expect(within(big).getByLabelText('The 15 cards in this change')).toHaveAttribute('tabindex', '0')
  })

  it('approving shows a toast and removes the card from the waiting list', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([])
    vi.mocked(api.fetchPending).mockResolvedValue([moveItem()])
    vi.mocked(api.decidePending).mockResolvedValue({ ok: true, summary: 'Moved Sol Ring from Prosper to Korvold.' })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Approve move' }))
    expect(api.decidePending).toHaveBeenCalledWith('p1', 'approve')
    await waitFor(() => expect(screen.queryByTestId('pending-card')).toBeNull())
    expect(screen.getByRole('status')).toHaveTextContent('Approved. Moved Sol Ring from Prosper to Korvold.')
  })

  it('declining keeps the card, marked declined, with nothing changed', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([])
    vi.mocked(api.fetchPending).mockResolvedValue([moveItem()])
    vi.mocked(api.decidePending).mockResolvedValue({ ok: true })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }))
    expect(await screen.findByText(/Declined, .* Nothing changed. Claude was told no./)).toBeInTheDocument()
  })

  it('shows "Couldn\'t apply" with Dismiss when approval is refused as stale', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([])
    vi.mocked(api.fetchPending).mockResolvedValue([moveItem()])
    vi.mocked(api.decidePending).mockResolvedValue({ ok: false, stale: true, reason: 'Sol Ring is no longer in Prosper' })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Approve move' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't apply. Sol Ring is no longer in Prosper. Nothing was moved. Ask Claude again.")
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('pending-card')).toBeNull()
  })

  it('renders expired, cancelled and declined pending items without buttons', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([])
    vi.mocked(api.fetchPending).mockResolvedValue([
      moveItem({ id: 'a', status: 'expired' }),
      moveItem({ id: 'b', status: 'cancelled', cancel_reason: 'Cancelled. You switched the connection off. Nothing changed.' }),
      moveItem({ id: 'c', status: 'failed', failure_reason: 'Sol Ring is no longer in Prosper' }),
    ])
    setup()
    expect(await screen.findByText('Expired. Nobody answered within 24 hours. Nothing changed.')).toBeInTheDocument()
    const cancelled = screen.getByText(/^Cancelled: /)
    expect(cancelled).toHaveTextContent('Cancelled: You switched the connection off. Nothing changed.')
    expect(cancelled.textContent).not.toMatch(/Nothing changed\.\./)
    expect(screen.getByText(/Couldn't apply. Sol Ring is no longer in Prosper. Nothing was moved/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve move' })).toBeNull()
  })

  it('Undo turns the row into Undone, announces it and keeps the row', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([row()])
    vi.mocked(api.fetchPending).mockResolvedValue([])
    vi.mocked(api.undoGroup).mockResolvedValue({ ok: true, undone: 1 })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /^Undo/ }))
    expect(api.undoGroup).toHaveBeenCalledWith('g1')
    expect(await screen.findByText(/Undone, /)).toBeInTheDocument()
    expect(screen.getAllByText(/Rocco is as it was before/)).toHaveLength(2) // row + live region
    expect(screen.getByTestId('change-row')).toHaveAttribute('data-status', 'undone')
    expect(screen.getByRole('status')).toHaveTextContent('Undone. Rocco is as it was before.')
  })

  it('an already-undone row loads as Undone', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([row({ undone_at: now, undone_by: 'owner' })])
    vi.mocked(api.fetchPending).mockResolvedValue([])
    setup()
    expect(await screen.findByText(/Undone, /)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Undo/ })).toBeNull()
  })

  it('a refused Undo stays aria-disabled with the reason written in the row', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([row()])
    vi.mocked(api.fetchPending).mockResolvedValue([])
    vi.mocked(api.undoGroup).mockResolvedValue({ ok: false, refused: { code: 'slot_sleeved', card: 'Cyclonic Rift', deck: 'Rocco', on: '2026-11-14T10:00:00Z' } })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /^Undo/ }))
    const btn = await screen.findByRole('button', { name: /^Undo/ })
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText("Can't undo this one.", { selector: 'b' })).toBeInTheDocument()
    expect(screen.getByText(/Cyclonic Rift was sleeved with a copy on/)).toBeInTheDocument()
    expect(btn.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Rocco' })).toHaveAttribute('href', '/decks/7')
    expect(screen.queryByText(/Undone, /)).toBeNull()
  })

  it('shows a refusal that is already known when the list loads', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([row({ undo_blocker: { code: 'copy_elsewhere', card: 'Sol Ring', deck: 'Prosper', on: null } })])
    vi.mocked(api.fetchPending).mockResolvedValue([])
    setup()
    expect(await screen.findByText("Can't undo this one.", { selector: 'b' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Undo/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('prefers the server-written refusal text when the list loads', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([row({ undo_blocker: { code: 'slot_sleeved' }, refusal_text: 'Cyclonic Rift was sleeved with a copy on 14 Nov.' })])
    vi.mocked(api.fetchPending).mockResolvedValue([])
    setup()
    expect(await screen.findByText(/Cyclonic Rift was sleeved with a copy on 14 Nov\./)).toBeInTheDocument()
  })

  it('a technical failure says nothing changed and never says undone', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([row()])
    vi.mocked(api.fetchPending).mockResolvedValue([])
    vi.mocked(api.undoGroup).mockResolvedValue({ ok: false, failed: true })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /^Undo/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't undo this. Nothing was changed. Try again.")
    expect(screen.queryByText(/Undone, /)).toBeNull()
    expect(screen.getByRole('button', { name: /^Undo/ })).not.toHaveAttribute('aria-disabled')
  })

  it('a multi-card request is one row with a disclosure, undone as one', async () => {
    const rows = ['A', 'B', 'C'].map((n, i) => row({ id: `x${i}`, group_id: 'big', card_name: n, summary: 'Cut 3 cards from Rocco.' }))
    vi.mocked(api.fetchChanges).mockResolvedValue(rows)
    vi.mocked(api.fetchPending).mockResolvedValue([])
    setup()
    expect(await screen.findAllByTestId('change-row')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'See the 3 cards' }))
    expect(screen.getByText('B')).toBeInTheDocument()
  })
})
