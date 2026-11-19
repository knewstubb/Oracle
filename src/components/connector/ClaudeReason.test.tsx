// DV-04: the reason shows beside the change, and nothing extra shows for older changes. The hold reason stays its own thing.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
vi.mock('sonner', () => ({ toast: vi.fn() }))
vi.mock('./api', async (orig) => {
  const real = await orig<typeof import('./api')>()
  return { ...real, fetchChanges: vi.fn(), fetchPending: vi.fn(), undoGroup: vi.fn(), decidePending: vi.fn() }
})
import * as api from './api'
import { ChangeRow } from './ChangeRow'
import { PendingCard } from './PendingCard'
import { RecentChangesTab } from './RecentChangesTab'
const now = new Date().toISOString()
const REASON = 'The deck is two mana sources under its target.'
const row = (over: Partial<api.ChangeRowData> = {}): api.ChangeRowData => ({
  id: 'r1', group_id: 'g1', kind: 'deck_add', client_name: 'Claude', deck_id: 7, deck_name: 'Yedora', other_deck_id: null, other_deck_name: null,
  card_name: 'Arcane Signet', oracle_id: null, printing_id: null, approved_by_owner: false, created_at: now, undoable_until: now, undone_at: null, undone_by: null,
  owner_only: false, undo_blocker: null, summary: 'Added Arcane Signet to Yedora.', ...over,
} as api.ChangeRowData)
const waiting = (over: Partial<api.PendingItem> = {}): api.PendingItem => ({
  id: 'p1', kind: 'big_edit', action: 'deck_remove', reason: 'over_ten', deck_id: 1, deck_name: 'Prosper', other_deck_id: null, other_deck_name: null, card_count: 15,
  status: 'waiting', client_name: 'Claude', created_at: now, expires_at: now, decided_at: null, failure_reason: null, cancel_reason: null, title: 'Cut 15 cards from Prosper?',
  preview: { cards: [{ name: 'Sol Ring', quantity: 1 }], decks: [{ deck_id: 1, name: 'Prosper', role: 'changes', before: { size: 100, sleeved: 90, unsleeved_generics: 0 }, after: { size: 85, sleeved: 75, unsleeved_generics: 0 } }] },
  ...over,
} as api.PendingItem)
beforeEach(() => vi.resetAllMocks())
describe('ChangeRow', () => {
  const props = { summary: 'Added Arcane Signet to Yedora.', deckName: 'Yedora', cardName: 'Arcane Signet', at: now, client: 'Claude', status: 'done' as const, onUndo: vi.fn() }
  it('shows "Reason: ..." under the sentence, with Undo still there', () => {
    render(<ul><ChangeRow {...props} reason={REASON} /></ul>)
    expect(screen.getByTestId('claude-reason')).toHaveTextContent(`Reason: ${REASON}`)
    expect(screen.getByRole('button', { name: /Undo/ })).toBeInTheDocument()
  })
  it.each([null, undefined, '', '   '])('an older change (reason %j) shows nothing extra: no "Reason" and no "No reason" line', (none) => {
    render(<ul><ChangeRow {...props} reason={none} /></ul>)
    expect(screen.queryByTestId('claude-reason')).toBeNull()
    expect(screen.queryByText(/reason/i)).toBeNull()
  })
})
describe('Recent changes', () => {
  function setup() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={qc}><RecentChangesTab /></QueryClientProvider>)
  }
  it('each row shows its own reason; a row from before reasons existed has none', async () => {
    vi.mocked(api.fetchChanges).mockResolvedValue([row({ claude_reason: REASON }), row({ id: 'r2', group_id: 'g2', card_name: 'Old', summary: 'Added Old to Yedora.' })])
    vi.mocked(api.fetchPending).mockResolvedValue([])
    setup()
    const rows = await screen.findAllByTestId('change-row')
    expect(rows).toHaveLength(2)
    expect(within(rows.find((r) => r.dataset.card === 'Arcane Signet')!).getByTestId('claude-reason')).toHaveTextContent(`Reason: ${REASON}`)
    expect(within(rows.find((r) => r.dataset.card === 'Old')!).queryByTestId('claude-reason')).toBeNull()
  })
})
describe('Waiting requests', () => {
  it('show Claude\'s reason and the hold tag separately, never mixed', () => {
    render(<PendingCard item={waiting({ claude_reason: REASON })} onApprove={vi.fn()} onDecline={vi.fn()} />)
    const card = screen.getByTestId('pending-card')
    expect(within(card).getByTestId('claude-reason')).toHaveTextContent(`Reason: ${REASON}`)
    expect(card).toHaveTextContent('Big edit · waiting')
    expect(card).not.toHaveTextContent('over_ten')
    expect(within(card).getByTestId('claude-reason')).not.toHaveTextContent(/Big edit|waiting/)
  })
  it('a waiting request without a reason shows no reason line', () => {
    render(<PendingCard item={waiting({ claude_reason: null })} onApprove={vi.fn()} onDecline={vi.fn()} />)
    expect(screen.queryByTestId('claude-reason')).toBeNull()
  })
})
