import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TopNav } from './TopNav'
import { HealthStrip } from './HealthStrip'
import { buildDeckHealth } from '@/lib/deck-health'
import ExplorePage from '@/app/explore/page'

const oracle = vi.hoisted(() => ({ open: vi.fn(), toggle: vi.fn(), sendMessage: vi.fn(async () => {}) }))
vi.mock('@/contexts/OracleContext', () => ({
  useOracle: () => ({
    isOpen: false, open: oracle.open, toggle: oracle.toggle, sendMessage: oracle.sendMessage,
    activeSession: null, messages: [],
  }),
  useOracleOptional: () => ({ open: oracle.open, sendMessage: oracle.sendMessage }),
  useOracleContext: () => {},
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/app/actions/auth', () => ({ logout: vi.fn() }))
vi.mock('@/components/CardDataLastUpdate', () => ({ CardDataLastUpdate: () => null }))
vi.mock('@/components/explore/CommanderBrowser', () => ({ CommanderBrowser: () => <div>browser</div> }))
vi.mock('@/components/explore/SuggestedCommanders', () => ({ SuggestedCommanders: () => null }))

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  oracle.open.mockClear()
  oracle.toggle.mockClear()
})

describe('top bar Oracle button', () => {
  it('is hidden while paused', () => {
    vi.stubEnv('NEXT_PUBLIC_AI_CHAT_ENABLED', 'false')
    render(<TopNav />)
    expect(screen.queryByLabelText('Toggle Oracle assistant')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Settings')).toBeInTheDocument()
  })
  it('shows (desktop and phone) when on, and still toggles', () => {
    render(<TopNav />)
    const buttons = screen.getAllByLabelText('Toggle Oracle assistant')
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0])
    expect(oracle.toggle).toHaveBeenCalled()
  })
})

describe('Explore page', () => {
  it('shows no "Start a conversation with Oracle" card or Open Oracle button while paused', () => {
    vi.stubEnv('NEXT_PUBLIC_AI_CHAT_ENABLED', 'false')
    render(<ExplorePage />)
    expect(screen.queryByText(/conversation with Oracle/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Open Oracle/ })).not.toBeInTheDocument()
    expect(screen.getByText('Browse Commanders')).toBeInTheDocument()
  })
  it('shows the card when on', () => {
    render(<ExplorePage />)
    expect(screen.getByText(/conversation with Oracle/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Oracle/ })).toBeInTheDocument()
  })
})

describe('health strip "Chat about this"', () => {
  it('is not offered while paused', async () => {
    vi.stubEnv('NEXT_PUBLIC_AI_CHAT_ENABLED', 'false')
    const health = buildDeckHealth([
      { cardName: 'Forest', quantity: 36, typeLine: 'Basic Land — Forest', oracleText: null, inMainDeck: true },
      { cardName: 'Divination', quantity: 1, typeLine: 'Sorcery', oracleText: 'Draw two cards.', inMainDeck: true },
    ])
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(health), { status: 200 }))))
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <HealthStrip deckId={7} />
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /^Deck health:/ }))
    await screen.findByRole('dialog').catch(() => null)
    expect(screen.queryByRole('button', { name: 'Chat about this' })).not.toBeInTheDocument()
  })
})
