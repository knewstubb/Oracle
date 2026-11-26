import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { buildDeckHealth } from '@/lib/deck-health'

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '7' }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/contexts/OracleContext', () => ({ useOracle: () => ({ setContext: vi.fn() }) }))
vi.mock('@/hooks/useDeckHoverPreload', () => ({ useDeckHoverPreload: () => {} }))
vi.mock('@/components/LegalityBanner', () => ({ LegalityBanner: () => null }))
vi.mock('@/components/BuildSelector', () => ({ BuildSelector: () => <button type="button">Build picker</button> }))
vi.mock('@/components/VersionHistoryPanel', () => ({
  VersionHistoryPanel: ({ open, hideTrigger }: { open?: boolean; hideTrigger?: boolean }) =>
    open ? <div role="dialog" aria-label="Version history" data-hide-trigger={String(!!hideTrigger)} /> : null,
}))
vi.mock('@/components/CardsTab', () => ({ CardsTab: () => <div><label>Add card<input aria-label="Add card" /></label></div> }))
vi.mock('@/components/PicklistV2', () => ({ PicklistV2: () => <div>Picklist panel</div> }))
vi.mock('@/components/AnalysisTab', () => ({ AnalysisTab: () => <div>Analysis panel</div> }))
vi.mock('@/components/CombosPanel', () => ({ CombosPanel: () => <div>Combos panel</div> }))
vi.mock('@/components/StrategyTab', () => ({ StrategyTab: () => <div>Strategy panel</div> }))

import DeckViewPage from './page'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const card = (name: string, quantity: number, extra: Record<string, unknown> = {}) => ({
  id: name, card_name: name, quantity, categories: '["Other"]', mana_cost: null, type_line: 'Creature', price_usd: 0, ...extra,
})
const DECK = {
  deck: {
    id: 7, name: 'Yedora, the Explorer', commander_name: 'Yedora, Grave Gardener', commander_scryfall_id: 'abc', commander_id: null,
    build_id: null, colour_identity: 'G', card_count: 102, deck_type: null, precon_url: null, bracket: null, last_synced_at: null,
    raw_json: null, format: 'commander', salt_score: 1.2, edhrec_rank: null, edhrec_deck_count: null,
  },
  cards: [
    card('Yedora, Grave Gardener', 1, { is_commander: 1, mana_cost: '{3}{G}' }),
    card('Llanowar Elves', 1, { mana_cost: '{G}' }),
    card('Forest', 100, { type_line: 'Basic Land — Forest' }),
  ],
  brewSessionId: null,
}
const HEALTH = buildDeckHealth([
  { cardName: 'Forest', quantity: 36, typeLine: 'Basic Land — Forest', oracleText: null, inMainDeck: true },
  { cardName: 'Sol Ring', quantity: 1, typeLine: 'Artifact', oracleText: '{T}: Add {C}{C}.', inMainDeck: true },
])
const STATUSES = { cards: [], counts: { total: 102, original: 80, proxy: 5, available: 3, claimed: 10, unowned: 2, generic_land: 0 } }
const WINDOW = { configured: false, bracket: null, summary: '', strategy: '', playgroup: '', updatedBy: null, updatedAt: null, canStoreNewFields: true, implied: null }

let windowData: unknown
beforeEach(() => {
  windowData = WINDOW
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/health')) return json(200, HEALTH)
    if (url.endsWith('/card-statuses')) return json(200, STATUSES)
    if (url.endsWith('/legality')) return json(200, { format: 'commander', isLegal: true, issues: [] })
    if (url.endsWith('/strategy-window')) return json(200, windowData)
    if (url.endsWith('/api/decks/7')) return json(200, DECK)
    return json(200, {})
  }))
})
afterEach(() => vi.unstubAllGlobals())

async function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DeckViewPage />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), aside: await screen.findByRole('complementary', { name: 'Deck summary' }) }
}

describe('Deck page with the left rail', () => {
  it('shows every rail section with the real deck data, and 102 / 100 as "2 over"', async () => {
    const { aside } = await renderPage()
    await within(aside).findByRole('heading', { name: 'Strategy & bracket' })
    const headings = within(aside).getAllByRole('heading').map((h) => h.textContent)
    expect(headings).toEqual(['Yedora, the Explorer', 'Cards', 'Strategy & bracket', 'Deck health', 'Mana curve', 'Mana production', 'Mana by turn'])
    expect(within(aside).getByTestId('rail-count')).toHaveTextContent('102')
    expect(await within(aside).findByText('2 cards over')).toBeInTheDocument()
    expect(await within(aside).findByTestId('health-rows')).toBeInTheDocument()
    expect(await within(aside).findByTestId('rail-problems')).toBeInTheDocument()
    expect(within(aside).queryByText('Commander · Green')).toBeNull()
    expect(within(aside).getByRole('img', { name: 'Green' })).toBeInTheDocument()
  })

  it('has the Strategy block in the rail, and it opens the Strategy window (empty)', async () => {
    const { user, aside } = await renderPage()
    const block = await within(aside).findByTestId('strategy-block')
    expect(within(block).getByTestId('bracket-box')).toHaveTextContent('–')
    await user.click(within(block).getByRole('button', { name: 'Edit strategy' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('has the Strategy block in the rail, and it opens the Strategy window (set)', async () => {
    windowData = { ...WINDOW, configured: true, bracket: 4, summary: 'Plants and recursion', updatedBy: 'owner', updatedAt: '2026-11-19T10:00:00Z' }
    const { user, aside } = await renderPage()
    const block = await within(aside).findByTestId('strategy-block')
    expect(within(block).getByTestId('bracket-box')).toHaveTextContent('4')
    await user.click(within(block).getByRole('button', { name: 'Edit strategy' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('offers Export, History, Delete deck in the menu; Delete asks first; History opens the history window', async () => {
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'More deck actions' }))
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['Export', 'History', 'Delete deck'])
    await user.click(items[2])
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'))
    expect(dialog).toBeInTheDocument()
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(false)
  })

  it('opens the history window from the menu, with no separate History button', async () => {
    const { user } = await renderPage()
    expect(screen.queryByRole('button', { name: /^History$/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'More deck actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'History' }))
    expect(await screen.findByRole('dialog', { name: 'Version history' })).toHaveAttribute('data-hide-trigger', 'true')
  })

  it('no longer shows the old header, slot-usage bar or footer health strip', async () => {
    await renderPage()
    expect(screen.queryByTestId('persistent-header')).toBeNull()
    expect(screen.queryByTestId('health-strip')).toBeNull()
    expect(screen.queryByText(/slots ·/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'View Picklist' })).toBeNull()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('collapses the rail on a narrow page with an aria-expanded button', async () => {
    const { user } = await renderPage()
    const toggle = screen.getByRole('button', { name: /Show deck summary/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: /Hide deck summary/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps the build picker and switches between all five tabs, with Add card on the Cards tab', async () => {
    const { user } = await renderPage()
    expect(screen.getByRole('button', { name: 'Build picker' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Add card' })).toBeInTheDocument()
    const tabs = ['Cards', 'Picklist', 'Analysis', 'Combos', 'Strategy']
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(tabs)
    for (const name of tabs.slice(1)) {
      await user.click(screen.getByRole('tab', { name }))
      await waitFor(() => expect(screen.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true'))
      expect(screen.getByText(`${name} panel`)).toBeInTheDocument()
    }
  })
})
