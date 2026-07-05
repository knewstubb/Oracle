import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SharedCardsPage from './page'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    return <img {...rest} />
  },
}))

const mockFetch = vi.fn()

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function makeGroup(
  name: string,
  totalDeckCount: number,
  ownedTotal: number,
  printings: { set_code: string; owned: number; in_decks: number; decks: { id: number; name: string; is_proxy: boolean }[] }[]
) {
  return {
    card_name: name,
    total_deck_count: totalDeckCount,
    owned_total: ownedTotal,
    needing_proxies: totalDeckCount > ownedTotal,
    printings: printings.map((p) => ({
      ...p,
      scryfall_id: `abc-${name.replace(/\s/g, '')}-${p.set_code}`,
    })),
  }
}

const sampleGroups = [
  makeGroup('Sol Ring', 3, 2, [
    { set_code: 'c21', owned: 2, in_decks: 3, decks: [
      { id: 1, name: 'Muldrotha', is_proxy: false },
      { id: 2, name: 'Atraxa', is_proxy: true },
      { id: 3, name: 'Korvold', is_proxy: true },
    ]},
  ]),
  makeGroup('Arcane Signet', 2, 3, [
    { set_code: 'eld', owned: 3, in_decks: 2, decks: [
      { id: 1, name: 'Muldrotha', is_proxy: false },
      { id: 4, name: 'Prossh', is_proxy: false },
    ]},
  ]),
  makeGroup('Command Tower', 4, 1, [
    { set_code: 'c21', owned: 1, in_decks: 4, decks: [
      { id: 1, name: 'Muldrotha', is_proxy: false },
      { id: 2, name: 'Atraxa', is_proxy: true },
      { id: 3, name: 'Korvold', is_proxy: true },
      { id: 4, name: 'Prossh', is_proxy: true },
    ]},
  ]),
]

beforeEach(() => { vi.stubGlobal('fetch', mockFetch) })
afterEach(() => { vi.restoreAllMocks() })

describe('SharedCardsPage', () => {
  it('renders summary stats', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ groups: sampleGroups, collectionSynced: true }) })
    render(<SharedCardsPage />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByTestId('summary-stats')).toHaveTextContent('3 cards shared · 2 need proxies')
    })
  })

  it('renders card name rows', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ groups: sampleGroups, collectionSynced: true }) })
    render(<SharedCardsPage />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Sol Ring')).toBeInTheDocument()
      expect(screen.getByText('Arcane Signet')).toBeInTheDocument()
      expect(screen.getByText('Command Tower')).toBeInTheDocument()
    })
  })

  it('sorts by deck count descending by default', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ groups: sampleGroups, collectionSynced: true }) })
    render(<SharedCardsPage />, { wrapper: createWrapper() })
    await waitFor(() => { expect(screen.getByRole('list', { name: 'Shared cards list' })).toBeInTheDocument() })
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Command Tower')
    expect(items[1]).toHaveTextContent('Sol Ring')
    expect(items[2]).toHaveTextContent('Arcane Signet')
  })

  it('expands to show printings on click', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ groups: sampleGroups, collectionSynced: true }) })
    render(<SharedCardsPage />, { wrapper: createWrapper() })
    await waitFor(() => { expect(screen.getByText('Sol Ring')).toBeInTheDocument() })
    // Click Sol Ring to expand
    fireEvent.click(screen.getByText('Sol Ring'))
    // Should show the set code for the printing
    await waitFor(() => { expect(screen.getByText('c21')).toBeInTheDocument() })
  })

  it('filters to needs proxies only', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ groups: sampleGroups, collectionSynced: true }) })
    render(<SharedCardsPage />, { wrapper: createWrapper() })
    await waitFor(() => { expect(screen.getByText('Sol Ring')).toBeInTheDocument() })
    fireEvent.click(screen.getByRole('switch', { name: /Needs proxies only/i }))
    expect(screen.queryByText('Arcane Signet')).not.toBeInTheDocument()
    expect(screen.getByText('Sol Ring')).toBeInTheDocument()
  })

  it('shows loading skeleton', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    render(<SharedCardsPage />, { wrapper: createWrapper() })
    expect(screen.getByRole('list', { name: 'Loading shared cards' })).toBeInTheDocument()
  })

  it('shows empty state', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ groups: [], collectionSynced: false }) })
    render(<SharedCardsPage />, { wrapper: createWrapper() })
    await waitFor(() => { expect(screen.getByText('No shared cards found.')).toBeInTheDocument() })
  })

  it('shows error state with retry', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ error: 'DB error' }) })
    render(<SharedCardsPage />, { wrapper: createWrapper() })
    await waitFor(() => { expect(screen.getByRole('alert')).toBeInTheDocument() })
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument()
  })

  it('renders page title', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    render(<SharedCardsPage />, { wrapper: createWrapper() })
    expect(screen.getByRole('heading', { name: 'Shared Cards' })).toBeInTheDocument()
  })
})
