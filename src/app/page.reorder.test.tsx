import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, createEvent } from '@testing-library/react'
import { toast } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardPage from './page'
import * as liveRefresh from '@/hooks/useLiveRefresh'
import { PageHeaderProvider, usePageHeaderContext } from '@/contexts/PageHeaderContext'

vi.mock('@/hooks/useLiveRefresh', async (orig) => {
  const actual = await orig<typeof import('@/hooks/useLiveRefresh')>()
  return { ...actual, useLiveUserRefresh: vi.fn(actual.useLiveUserRefresh) }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

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

type S = 'brewing' | 'assembling' | 'playable'
const deck = (id: number, name: string, status: S, folder_id: number | null = null) => ({
  id, name, commander_name: `Commander ${id}`,
  commander_scryfall_id: `abc${String(id).padStart(5, '0')}-0000-0000-0000-000000000000`,
  colour_identity: 'B', card_count: 100, status, folder_id,
})
// Saved order from the server: 1 Alpha, 2 Bravo, 3 Charlie, 4 Delta
const decks = [deck(1, 'Alpha', 'playable', 7), deck(2, 'Bravo', 'brewing'), deck(3, 'Charlie', 'playable', 7), deck(4, 'Delta', 'playable')]
const folders = [{ id: 7, name: 'Commanders', color: null }]
let putResponse: () => Promise<unknown>
function mockServer() {
  mockFetch.mockImplementation((url: string, init?: { method?: string }) => {
    if (url === '/api/decks/order' && init?.method === 'PUT') return putResponse()
    if (url === '/api/decks/details') return new Promise(() => {})
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ decks, folders, hasCollection: true }) })
  })
}
const puts = () => mockFetch.mock.calls.filter((c) => c[0] === '/api/decks/order')
const slots = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-deck-slot]'))
const idOf = (el: Element) => Number(el.querySelector('a[href^="/decks/"]')!.getAttribute('href')!.split('/')[2])
const dt = () => ({ setData: vi.fn(), getData: vi.fn(), effectAllowed: '', dropEffect: 'move', types: [] as string[] })
/** Drag deck `from` onto the left half of deck `onto` and drop it on the grid. */
function dragBefore(c: HTMLElement, from: number, onto: number, endEffect = 'move') {
  const src = slots(c).find((s) => idOf(s) === from)!
  const tgt = slots(c).find((s) => idOf(s) === onto)!
  // jsdom has no layout: make the pointer (x = 0) sit in the left half of the target tile.
  tgt.getBoundingClientRect = () => ({ left: 100, width: 100, top: 0, bottom: 10, right: 200, height: 10, x: 100, y: 0, toJSON: () => ({}) })
  fireEvent.dragStart(src, { dataTransfer: dt() })
  // jsdom drag events carry no pointer position, so set it by hand.
  const over = createEvent.dragOver(tgt, { dataTransfer: dt() })
  Object.defineProperty(over, 'clientX', { value: 0 })
  Object.defineProperty(over, 'clientY', { value: 0 })
  fireEvent(tgt, over)
  fireEvent.drop(tgt, { dataTransfer: dt() })
  fireEvent.dragEnd(src, { dataTransfer: { ...dt(), dropEffect: endEffect } })
}
async function loaded(group?: 'status') {
  const r = render(<DashboardPage />, { wrapper: createWrapper() })
  await waitFor(() => expect(r.container.querySelectorAll('a[href^="/decks/"]')).toHaveLength(4))
  if (group) fireEvent.change(screen.getByRole('combobox', { name: 'Group by' }), { target: { value: group } })
  return r
}

describe('library reorder (brief scenarios 3, 6, 7)', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    vi.mocked(toast.info).mockClear()
    vi.mocked(toast.error).mockClear()
    putResponse = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, count: 4 }) })
    mockServer()
  })
  afterEach(() => vi.restoreAllMocks())

  it('scenario 3: dropping a tile before another saves the whole new order once and shows it', async () => {
    const { container } = await loaded()
    dragBefore(container, 3, 1)
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(JSON.parse(puts()[0][1].body)).toEqual({ deckIds: [3, 1, 2, 4] })
    await waitFor(() => expect(slots(container).map(idOf)).toEqual([3, 1, 2, 4]))
    expect(toast.error).not.toHaveBeenCalled()
  })
  it('scenario 3: a drop that changes nothing saves nothing', async () => {
    const { container } = await loaded()
    dragBefore(container, 1, 2)
    expect(puts()).toHaveLength(0)
  })
  it('a failed save puts the old order back and says so (D-030)', async () => {
    putResponse = () => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'save_failed' }) })
    const { container } = await loaded()
    dragBefore(container, 3, 1)
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(slots(container).map(idOf)).toEqual([1, 2, 3, 4])
  })
  it('scenario 6: with a folder open nothing is saved when a tile is dropped', async () => {
    const { container } = await loaded()
    fireEvent.click(screen.getByRole('button', { name: /Commanders/ }))
    await waitFor(() => expect(slots(container).map(idOf)).toEqual([1, 3]))
    dragBefore(container, 3, 1, 'none')
    expect(puts()).toHaveLength(0)
    expect(slots(container).map(idOf)).toEqual([1, 3])
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/Reordering is off while a folder is open/))
  })
  it('scenario 6: with a folder open the tiles still show their rename control', async () => {
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: /Commanders/ }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Rename / })).toHaveLength(2))
  })
  it('scenario 7: grouped by status, a move inside a group saves the full order and only that deck moves', async () => {
    const { container } = await loaded('status')
    dragBefore(container, 4, 1) // Playable group: 1, 3, 4 -> 4, 1, 3; Brewing deck 2 keeps its place
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(JSON.parse(puts()[0][1].body)).toEqual({ deckIds: [4, 1, 2, 3] })
  })
  it('scenario 7: grouped by status, a drop in another group is refused with a grey message and saves nothing', async () => {
    const { container } = await loaded('status')
    dragBefore(container, 3, 2, 'none') // 3 is Playable, 2 is Brewing
    expect(puts()).toHaveLength(0)
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/Decks stay in their status group/))
    expect(slots(container).map(idOf)).toEqual([1, 3, 4, 2])
  })
})
