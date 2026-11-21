// DV-04 and the unified History: one History per deck, Claude's changes first (with the reason and Undo), then the saved versions.
// The Strategy window's "See in History" opens this same History.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
vi.mock('sonner', () => ({ toast: vi.fn() }))
import { VersionHistoryPanel } from './VersionHistoryPanel'
import { StrategyBlock } from './deck-strategy/StrategyBlock'
import { DeckSettingsHost } from './deck-strategy/DeckSettingsHost'
const now = new Date().toISOString()
const REASON = 'The deck is two mana sources under its target.'
const change = (over: Record<string, unknown> = {}) => ({
  id: 'r1', group_id: 'g1', kind: 'deck_add', client_name: 'Claude', deck_id: 7, deck_name: 'Yedora', other_deck_id: null, other_deck_name: null,
  card_name: 'Arcane Signet', created_at: now, undoable_until: now, undone_at: null, undone_by: null, owner_only: false, undo_blocker: null,
  summary: 'Added Arcane Signet to Yedora.', claude_reason: REASON, ...over,
})
const version = { id: 1, version_number: 3, version_name: 'Before the cuts', trigger_type: 'manual', trigger_details: 'Named', created_at: now, card_count: 99, creature_count: 20, land_count: 36, diff_from_previous: null }
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
let changes: () => unknown
let undone: string[]
let changesDown = false
const calls: string[] = []
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  calls.push(`${init?.method ?? 'GET'} ${url}`)
  if (url.startsWith('/api/connector/changes?deckId=7')) return changesDown ? json(500, { error: 'down' }) : json(200, { ok: true, changes: changes() })
  if (/\/api\/connector\/changes\/.+\/undo/.test(url)) { undone.push(url); return json(200, { ok: true, success: true, undone: 1 }) }
  if (url === '/api/decks/7/versions') return json(200, { versions: [version], count: 1 })
  if (url === '/api/decks/7/strategy-window') return json(200, { configured: true, bracket: 4, summary: 'Plants and recursion', strategy: '', playgroup: '', updatedBy: 'claude', updatedAt: now, canStoreNewFields: true, implied: null })
  return json(404, {})
})
beforeEach(() => {
  changes = () => [change()]
  undone = []
  changesDown = false
  calls.length = 0
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())
const wrap = (ui: React.ReactNode) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
describe('History (one per deck)', () => {
  it('opens as "History" with Claude\'s changes first, then the saved versions', async () => {
    const user = userEvent.setup()
    render(wrap(<VersionHistoryPanel deckId={7} deckName="Yedora" />))
    await user.click(screen.getByRole('button', { name: 'View version history' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'History' })).toBeInTheDocument()
    const claude = await within(dialog).findByRole('heading', { name: 'Changes Claude made' })
    const saved = within(dialog).getByRole('heading', { name: 'Saved versions' })
    expect(claude.compareDocumentPosition(saved) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // the saved versions are the ones the Version History window showed before
    expect(await within(dialog).findByText('Before the cuts')).toBeInTheDocument()
    expect(within(dialog).getByText('Save Current State')).toBeInTheDocument()
    // and Claude's row comes before the first saved version in the page order
    const row = within(dialog).getByTestId('change-row')
    expect(row.compareDocumentPosition(within(dialog).getByText('Before the cuts')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('asks for this deck\'s changes only, and shows the reason and Undo on the row', async () => {
    const user = userEvent.setup()
    render(wrap(<VersionHistoryPanel deckId={7} deckName="Yedora" />))
    await user.click(screen.getByRole('button', { name: 'View version history' }))
    const row = await screen.findByTestId('change-row')
    expect(calls).toContain('GET /api/connector/changes?deckId=7')
    expect(within(row).getByTestId('claude-reason')).toHaveTextContent(`Reason: ${REASON}`)
    expect(within(row).getByRole('button', { name: /Undo/ })).toBeInTheDocument()
  })
  it('Undo in History uses the one Undo and says so', async () => {
    const user = userEvent.setup()
    render(wrap(<VersionHistoryPanel deckId={7} deckName="Yedora" />))
    await user.click(screen.getByRole('button', { name: 'View version history' }))
    await user.click(await screen.findByRole('button', { name: /Undo/ }))
    await waitFor(() => expect(undone).toEqual(['/api/connector/changes/g1/undo']))
    expect((await screen.findAllByText(/Undone/)).length).toBeGreaterThan(0)
  })
  it('older changes show no reason line, and the rows keep Claude\'s newest change first', async () => {
    changes = () => [
      change({ id: 'r2', group_id: 'g2', card_name: 'Newer', summary: 'Added Newer.', created_at: now, claude_reason: undefined }),
      change({ id: 'r3', group_id: 'g3', card_name: 'Older', summary: 'Added Older.', created_at: new Date(Date.now() - 3600_000).toISOString(), claude_reason: 'Because.' }),
    ]
    const user = userEvent.setup()
    render(wrap(<VersionHistoryPanel deckId={7} deckName="Yedora" />))
    await user.click(screen.getByRole('button', { name: 'View version history' }))
    const rows = await screen.findAllByTestId('change-row')
    expect(rows.map((r) => r.dataset.card)).toEqual(['Newer', 'Older'])
    expect(within(rows[0]).queryByTestId('claude-reason')).toBeNull()
    expect(within(rows[1]).getByTestId('claude-reason')).toHaveTextContent('Reason: Because.')
  })
  it('no Claude changes: says so for this deck and the saved versions are still there', async () => {
    changes = () => []
    const user = userEvent.setup()
    render(wrap(<VersionHistoryPanel deckId={7} deckName="Yedora" />))
    await user.click(screen.getByRole('button', { name: 'View version history' }))
    expect(await screen.findByTestId('history-claude-empty')).toHaveTextContent("Claude hasn't changed Yedora in the last 7 days.")
    expect(await screen.findByText('Before the cuts')).toBeInTheDocument()
  })
  it('Claude\'s changes failing to load says so plainly (never "none") and the saved versions still show', async () => {
    changesDown = true
    const user = userEvent.setup()
    render(wrap(<VersionHistoryPanel deckId={7} deckName="Yedora" />))
    await user.click(screen.getByRole('button', { name: 'View version history' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load Claude's changes. This doesn't mean there are none.")
    expect(screen.queryByTestId('history-claude-empty')).toBeNull()
    expect(await screen.findByText('Before the cuts')).toBeInTheDocument()
  })
  it('nothing about Claude is fetched until History is opened', async () => {
    render(wrap(<VersionHistoryPanel deckId={7} deckName="Yedora" />))
    await new Promise((r) => setTimeout(r, 20))
    expect(calls.filter((c) => c.includes('/api/connector/changes'))).toEqual([])
  })
})
describe('the Strategy window\'s "See in History" opens this History', () => {
  function Page() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <VersionHistoryPanel deckId={7} deckName="Yedora" open={open} onOpenChange={setOpen} />
        <DeckSettingsHost deckId={7} deckName="Yedora" cards={[]} onSeeHistory={() => setOpen(true)}>
          <StrategyBlock deckId={7} />
        </DeckSettingsHost>
      </>
    )
  }
  it('click the link: the window closes and History opens with Claude\'s changes (reason and Undo) above the saved versions', async () => {
    const user = userEvent.setup()
    render(wrap(<Page />))
    await user.click(await screen.findByRole('button', { name: 'Edit strategy' }))
    await user.click(await screen.findByRole('button', { name: 'See in History' }))
    const history = await screen.findByRole('dialog', { name: /History/ })
    expect(within(history).getByRole('heading', { name: 'Changes Claude made' })).toBeInTheDocument()
    expect(await within(history).findByTestId('claude-reason')).toHaveTextContent(`Reason: ${REASON}`)
    expect(within(history).getByRole('button', { name: /Undo/ })).toBeInTheDocument()
    expect(within(history).getByRole('heading', { name: 'Saved versions' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /Strategy/ })).toBeNull()
  })
})
describe('hideTrigger', () => {
  it('renders no History button, and open still shows the History window', async () => {
    const { rerender } = render(wrap(<VersionHistoryPanel deckId={7} deckName="Yedora" hideTrigger open={false} onOpenChange={() => {}} />))
    expect(screen.queryByRole('button', { name: 'View version history' })).toBeNull()
    rerender(wrap(<VersionHistoryPanel deckId={7} deckName="Yedora" hideTrigger open onOpenChange={() => {}} />))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'History' })).toBeInTheDocument()
  })
})
