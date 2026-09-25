import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardPage from './page'
import { OracleProvider } from '@/contexts/OracleContext'
import { PageHeaderProvider } from '@/contexts/PageHeaderContext'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />
  },
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

const mockFetch = vi.fn()

// jsdom in this runner has no localStorage; OracleProvider hydrates from it.
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <OracleProvider>
          <PageHeaderProvider>{children}</PageHeaderProvider>
        </OracleProvider>
      </QueryClientProvider>
    )
  }
}

function makeDeck(id: number, name: string, commander: string, scryfallId: string, colours: string) {
  return {
    id,
    name,
    commander_name: commander,
    commander_scryfall_id: scryfallId,
    colour_identity: colours,
    card_count: 100,
  }
}

function makeDecks(count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeDeck(
      i + 1,
      `Deck ${i + 1}`,
      `Commander ${i + 1}`,
      `abc${String(i + 1).padStart(5, '0')}-0000-0000-0000-000000000000`,
      'B,U,G'
    )
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockDecks(decks: unknown[]) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/decks')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ decks, draftSessions: [] }),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

describe('DashboardPage', () => {
  it('renders 16 deck tiles in a grid', async () => {
    const decks = makeDecks(16)
    mockDecks(decks)

    const { container } = render(<DashboardPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(16)
    })

    const grid = container.querySelector<HTMLElement>('[style*="grid-template-columns"]')!
    expect(grid.children).toHaveLength(16)
  })

  it('sizes deck tiles to fill the row (auto-fill tracks, 1fr max)', async () => {
    mockDecks(makeDecks(16))

    const { container } = render(<DashboardPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(16)
    })

    const grid = container.querySelector<HTMLElement>('[style*="grid-template-columns"]')!
    expect(grid).toBeInTheDocument()
    // A fixed max track size (e.g. 280px) leaves dead space at the right edge.
    // 1fr makes every column grow to fill the row; the 200px min matches
    // DeckTile's own min-w-[200px], so tiles shrink to that floor to let one
    // more column fit rather than leaving a gap.
    expect(grid.style.gridTemplateColumns).toBe('repeat(auto-fill, minmax(min(100%, 200px), 1fr))')
    expect(grid.style.gridTemplateColumns).not.toContain('280px')
  })

  it('shows loading skeleton tiles', () => {
    // Never resolve so we stay in loading state
    mockFetch.mockImplementation(() => new Promise(() => {}))

    render(<DashboardPage />, { wrapper: createWrapper() })

    const loadingGrid = screen.getByRole('list', { name: 'Loading decks' })
    expect(loadingGrid).toBeInTheDocument()

    const skeletonItems = screen.getAllByRole('listitem')
    expect(skeletonItems.length).toBeGreaterThan(0)
  })

  it('shows empty state with import prompt', async () => {
    mockDecks([])

    render(<DashboardPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByText('No decks found. Import a deck to get started.')
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: /Import a Deck/ })).toBeInTheDocument()
  })

  it('shows error banner with retry button', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/decks')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'DB error' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<DashboardPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByText(/Couldn't load decks/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument()
  })

  it('renders page title "Decks"', async () => {
    mockDecks(makeDecks(1))

    render(<DashboardPage />, { wrapper: createWrapper() })

    expect(screen.getByRole('heading', { name: 'Decks' })).toBeInTheDocument()
  })

  it('renders "Brew Deck" link', async () => {
    mockDecks(makeDecks(1))

    render(<DashboardPage />, { wrapper: createWrapper() })

    const brewDeckLink = screen.getByRole('link', { name: /Brew Deck/ })
    expect(brewDeckLink).toHaveAttribute('href', '/new-deck')
  })

  it('splits colour_identity string into array for ColourPips', async () => {
    mockDecks([makeDeck(1, 'Test Deck', 'Commander', 'abc00001-0000-0000-0000-000000000000', 'W,U,B')])

    render(<DashboardPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'White, Blue, Black' })).toBeInTheDocument()
    })
  })
})
