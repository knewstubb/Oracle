import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { toast } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardPage from './page'
import * as liveRefresh from '@/hooks/useLiveRefresh'
import { PageHeaderProvider, usePageHeaderContext } from '@/contexts/PageHeaderContext'

vi.mock('@/hooks/useLiveRefresh', async (orig) => {
  const actual = await orig<typeof import('@/hooks/useLiveRefresh')>()
  return { ...actual, useLiveUserRefresh: vi.fn(actual.useLiveUserRefresh) }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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

// jsdom in this runner has no localStorage; the page reads saved view settings from it.
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

// The page title is rendered by the layout-level PageHeader, which reads the
// config the page sets through usePageHeader. This probe exposes that config so
// the page's title can be asserted without rendering the whole layout.
function HeaderTitleProbe() {
  const { config } = usePageHeaderContext()
  return <span data-testid="page-header-title">{config?.title ?? ''}</span>
}

function createWrapper(
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <PageHeaderProvider>
          {children}
          <HeaderTitleProbe />
        </PageHeaderProvider>
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
  localStorageMock.clear()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockDecks(decks: unknown[], hasCollection = false) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/decks')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ decks, folders: [], hasCollection }),
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

    const { container } = render(<DashboardPage />, { wrapper: createWrapper() })

    // Loading skeletons render while the decks query is pending, and no deck
    // links are shown until it resolves.
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(0)
  })

  it('shows the new-user empty state with a collection import prompt', async () => {
    mockDecks([])

    render(<DashboardPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Welcome to The Oracle' })
      ).toBeInTheDocument()
    })

    expect(
      screen.getByRole('link', { name: /Bring your collection over/ })
    ).toHaveAttribute('href', '/onboarding')
  })

  it('shows the no-decks empty state when a collection exists', async () => {
    mockDecks([], true)

    render(<DashboardPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'No decks yet' })
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /New Deck/ })).toBeInTheDocument()
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

  it('watches for Claude changes so the deck list refreshes by itself', async () => {
    mockDecks(makeDecks(1))
    render(<DashboardPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByTestId('page-header-title')).toHaveTextContent('Decks'))
    const keys = vi.mocked(liveRefresh.useLiveUserRefresh).mock.calls.at(-1)![0]
    expect(keys).toEqual(expect.arrayContaining([['decks']]))
  })
  it('sets the page header title to "Decks"', async () => {
    mockDecks(makeDecks(1))

    render(<DashboardPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('page-header-title')).toHaveTextContent('Decks')
    })
  })

  it('splits colour_identity string into array for ColourPips', async () => {
    mockDecks([makeDeck(1, 'Test Deck', 'Commander', 'abc00001-0000-0000-0000-000000000000', 'W,U,B')])

    render(<DashboardPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'White, Blue, Black' })).toBeInTheDocument()
    })
  })
})

describe('deleting a deck', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((r) => { resolve = r })
    return { promise, resolve }
  }
  const tile = (container: HTMLElement, id: number) => container.querySelector(`a[href="/decks/${id}"]`)

  async function deleteDeckViaMenu(container: HTMLElement, id: number) {
    fireEvent.contextMenu(tile(container, id)!)
    fireEvent.click(await screen.findByText('Delete deck'))
    expect(await screen.findByText('Delete deck?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  }

  it('removes the deck from the list at once, before the server answers', async () => {
    const decks = makeDecks(3)
    const del = deferred<{ ok: boolean; json: () => Promise<unknown> }>()
    let listGets = 0
    mockFetch.mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE') return del.promise
      listGets += 1
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ decks, folders: [], hasCollection: false }) })
    })
    const { container } = render(<DashboardPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(3))
    const getsBefore = listGets

    await deleteDeckViaMenu(container, 2)

    await waitFor(() => expect(tile(container, 2)).toBeNull())
    expect(tile(container, 1)).not.toBeNull()
    expect(tile(container, 3)).not.toBeNull()
    expect(listGets).toBe(getsBefore)
    expect(toast.success).not.toHaveBeenCalled()

    await act(async () => { del.resolve({ ok: true, json: () => Promise.resolve({ success: true }) }) })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Deleted "Deck 2"'))
  })

  it('puts the deck back in its place and shows an error when the delete fails', async () => {
    const decks = makeDecks(3)
    const del = deferred<{ ok: boolean; json: () => Promise<unknown> }>()
    mockFetch.mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE') return del.promise
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ decks, folders: [], hasCollection: false }) })
    })
    const { container } = render(<DashboardPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(3))

    await deleteDeckViaMenu(container, 2)
    await waitFor(() => expect(tile(container, 2)).toBeNull())

    await act(async () => { del.resolve({ ok: false, json: () => Promise.resolve({ error: 'boom' }) }) })

    await waitFor(() => expect(tile(container, 2)).not.toBeNull())
    const hrefs = Array.from(container.querySelectorAll('a[href^="/decks/"]')).map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/decks/1', '/decks/2', '/decks/3'])
    const message = vi.mocked(toast.error).mock.calls[0][0] as string
    expect(message).toContain('Deck 2')
    expect(message).toContain('boom')
  })

  it('shows the deck tiles without waiting for the colour pips', async () => {
    const decks = makeDecks(3)
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/decks/details') return new Promise(() => {}) // never answers
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ decks, folders: [], hasCollection: false }) })
    })
    const { container } = render(<DashboardPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(3))
    expect(mockFetch).toHaveBeenCalledWith('/api/decks/details')
  })

  it('a list fetch already in flight does not bring the deleted deck back', async () => {
    const decks = makeDecks(3)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const staleList = deferred<{ ok: boolean; json: () => Promise<unknown> }>()
    let slow = false
    let deleted = false
    let slowCalls = 0
    mockFetch.mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE') {
        deleted = true
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })
      }
      if (deleted) {
        // The server no longer has the deck once the delete went through
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ decks: decks.filter((d) => d.id !== 2), folders: [], hasCollection: false }),
        })
      }
      if (slow && url === '/api/decks') {
        slowCalls += 1
        return staleList.promise
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ decks, folders: [], hasCollection: false }) })
    })
    const { container } = render(<DashboardPage />, { wrapper: createWrapper(queryClient) })
    await waitFor(() => expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(3))

    slow = true
    act(() => { void queryClient.refetchQueries({ queryKey: ['decks'] }) })
    await waitFor(() => expect(slowCalls).toBe(1))

    await deleteDeckViaMenu(container, 2)
    await waitFor(() => expect(tile(container, 2)).toBeNull())

    await act(async () => {
      staleList.resolve({ ok: true, json: () => Promise.resolve({ decks, folders: [], hasCollection: false }) })
    })
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(tile(container, 2)).toBeNull()
  })
})

describe('grouping decks by status', () => {
  const KEY = 'oracle:decks:groupBy'
  type S = 'brewing' | 'assembling' | 'playable'
  const withStatus = (id: number, name: string, status: S, folder_id: number | null = null) => ({
    ...makeDeck(id, name, `Commander ${id}`, `abc${String(id).padStart(5, '0')}-0000-0000-0000-000000000000`, 'B'),
    status,
    folder_id,
  })
  // API order is A to Z by name
  const decks = [
    withStatus(1, 'Alpha', 'brewing'),
    withStatus(2, 'Bravo', 'playable', 7),
    withStatus(3, 'Charlie', 'assembling'),
    withStatus(4, 'Delta', 'playable'),
    withStatus(5, 'Echo', 'brewing', 7),
  ]
  function mockList(list: unknown[], folders: unknown[] = []) {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/decks/details') return new Promise(() => {})
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ decks: list, folders, hasCollection: true }) })
    })
  }
  const group = () => screen.getByRole('combobox', { name: 'Group by' }) as HTMLSelectElement
  const sectionLabels = (c: HTMLElement) =>
    Array.from(c.querySelectorAll('section')).map((s) => s.getAttribute('aria-label'))
  const sectionButtons = () => screen.getAllByRole('button', { name: /\(\d+\)/ }).map((b) => b.textContent)
  const hrefs = (el: Element) => Array.from(el.querySelectorAll('a[href^="/decks/"]')).map((a) => a.getAttribute('href'))

  it('defaults to None: one A to Z list, no sections', async () => {
    mockList(decks)
    const { container } = render(<DashboardPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(5))
    expect(group().value).toBe('none')
    expect(container.querySelectorAll('section')).toHaveLength(0)
    expect(hrefs(container)).toEqual(['/decks/1', '/decks/2', '/decks/3', '/decks/4', '/decks/5'])
  })

  it('shows sections Playable, Assembling, Brewing with counts, decks A to Z inside', async () => {
    mockList(decks)
    const { container } = render(<DashboardPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(5))
    fireEvent.change(group(), { target: { value: 'status' } })
    expect(sectionLabels(container)).toEqual(['Playable', 'Assembling', 'Brewing'])
    expect(sectionButtons()).toEqual(['Playable (2)', 'Assembling (1)', 'Brewing (2)'])
    const sections = Array.from(container.querySelectorAll('section'))
    expect(hrefs(sections[0])).toEqual(['/decks/2', '/decks/4'])
    expect(hrefs(sections[1])).toEqual(['/decks/3'])
    expect(hrefs(sections[2])).toEqual(['/decks/1', '/decks/5'])
    // header carries the status icon badge
    expect(sections[0].querySelector('button svg')).not.toBeNull()
  })

  it('hides empty sections', async () => {
    mockList([withStatus(1, 'Alpha', 'brewing'), withStatus(2, 'Bravo', 'playable')])
    const { container } = render(<DashboardPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(2))
    fireEvent.change(group(), { target: { value: 'status' } })
    expect(sectionLabels(container)).toEqual(['Playable', 'Brewing'])
  })

  it('remembers the choice between visits and when switching back', async () => {
    mockList(decks)
    const first = render(<DashboardPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(first.container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(5))
    fireEvent.change(group(), { target: { value: 'status' } })
    expect(localStorageMock.setItem).toHaveBeenCalledWith(KEY, 'status')
    first.unmount()
    const second = render(<DashboardPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(second.container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(5))
    expect(group().value).toBe('status')
    expect(sectionLabels(second.container)).toEqual(['Playable', 'Assembling', 'Brewing'])
    fireEvent.change(group(), { target: { value: 'none' } })
    expect(localStorageMock.setItem).toHaveBeenLastCalledWith(KEY, 'none')
  })

  it('applies to the selected folder only', async () => {
    mockList(decks, [{ id: 7, name: 'Pod', color: null }])
    const { container } = render(<DashboardPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(5))
    fireEvent.change(group(), { target: { value: 'status' } })
    fireEvent.click(screen.getByRole('button', { name: /Pod/ }))
    expect(sectionLabels(container)).toEqual(['Playable', 'Brewing'])
    expect(sectionButtons()).toEqual(['Playable (1)', 'Brewing (1)'])
    expect(hrefs(container)).toEqual(['/decks/2', '/decks/5'])
  })

  it('a deleted deck leaves its section at once and an emptied section disappears', async () => {
    const list = [withStatus(1, 'Alpha', 'brewing'), withStatus(2, 'Bravo', 'playable'), withStatus(3, 'Charlie', 'playable')]
    mockFetch.mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE') return new Promise(() => {})
      if (url === '/api/decks/details') return new Promise(() => {})
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ decks: list, folders: [], hasCollection: true }) })
    })
    const { container } = render(<DashboardPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(3))
    fireEvent.change(group(), { target: { value: 'status' } })
    const del = async (id: number) => {
      fireEvent.contextMenu(container.querySelector(`a[href="/decks/${id}"]`)!)
      fireEvent.click(await screen.findByText('Delete deck'))
      await screen.findByText('Delete deck?')
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    }
    await del(2)
    await waitFor(() => expect(container.querySelector('a[href="/decks/2"]')).toBeNull())
    expect(sectionButtons()).toEqual(['Playable (1)', 'Brewing (1)'])
    await del(1)
    await waitFor(() => expect(container.querySelector('a[href="/decks/1"]')).toBeNull())
    expect(sectionLabels(container)).toEqual(['Playable'])
  })

  it('sections collapse, and a refresh keeps the grouping and collapsed state', async () => {
    mockList(decks)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const { container } = render(<DashboardPage />, { wrapper: createWrapper(queryClient) })
    await waitFor(() => expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(5))
    fireEvent.change(group(), { target: { value: 'status' } })
    fireEvent.click(screen.getByRole('button', { name: /Brewing \(2\)/ }))
    expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(3)
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['decks'], exact: true }) })
    expect(group().value).toBe('status')
    expect(sectionButtons()).toEqual(['Playable (2)', 'Assembling (1)', 'Brewing (2)'])
    expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(3)
  })

  it('does not reorder when the details response arrives later', async () => {
    let resolveDetails!: (v: unknown) => void
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/decks/details') return new Promise((r) => { resolveDetails = r })
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ decks, folders: [], hasCollection: true }) })
    })
    const { container } = render(<DashboardPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(5))
    fireEvent.change(group(), { target: { value: 'status' } })
    const before = hrefs(container)
    await waitFor(() => expect(resolveDetails).toBeDefined())
    await act(async () => {
      resolveDetails({ ok: true, json: () => Promise.resolve({ pips: { 1: { W: 3 } }, sleeved: { 2: 100 }, unresolved: {} }) })
    })
    expect(hrefs(container)).toEqual(before)
    expect(sectionButtons()).toEqual(['Playable (2)', 'Assembling (1)', 'Brewing (2)'])
  })
})
