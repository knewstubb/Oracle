import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ManaAnalysisPanel } from './ManaAnalysisPanel'
import type { DeckCard } from './CardGrid'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    return <img {...rest} />
  },
}))

const mockCards: DeckCard[] = [
  {
    id: 1,
    deck_id: 100,
    card_name: 'Forest',
    scryfall_id: 'abc12345-6789-0000-0000-000000000001',
    set_code: 'c21',
    quantity: 1,
    categories: 'Lands',
    tags: '',
    is_commander: false,
  },
]

const mockManaResult = {
  colorDistribution: { B: 12, U: 10, G: 15 },
  landCount: 34,
  recommendedLandCount: 37,
  coverageGaps: ['Not enough blue sources for your blue pip count'],
  suggestions: [
    {
      current: 'Evolving Wilds',
      suggested: 'Breeding Pool',
      reasoning: 'Dual land for U/G coverage',
      owned: true,
    },
    {
      current: '',
      suggested: 'Watery Grave',
      reasoning: 'Dual land for U/B coverage',
      owned: false,
    },
  ],
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('ManaAnalysisPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders idle state with prompt, toggle, and button', () => {
    render(
      <ManaAnalysisPanel
        deckId={100}
        commanderName="Muldrotha, the Gravetide"
        cards={mockCards}
      />,
      { wrapper: createWrapper() }
    )
    expect(
      screen.getByText(
        'Analyze your mana base for colour coverage and curve support.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', {
        name: /collection only/i,
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Analyze Mana Base/i })
    ).toBeInTheDocument()
  })

  it('shows loading state when fetching', async () => {
    // Never resolve so we stay in loading
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(
      <ManaAnalysisPanel
        deckId={100}
        commanderName="Muldrotha, the Gravetide"
        cards={mockCards}
      />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(
      screen.getByRole('button', { name: /Analyze Mana Base/i })
    )

    await waitFor(() => {
      expect(
        screen.getByText('Analyzing mana base...')
      ).toBeInTheDocument()
    })
  })

  it('renders colour distribution, land count, gaps, and suggestions on success', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockManaResult),
    })

    render(
      <ManaAnalysisPanel
        deckId={100}
        commanderName="Muldrotha, the Gravetide"
        cards={mockCards}
      />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(
      screen.getByRole('button', { name: /Analyze Mana Base/i })
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Colour Distribution' })
      ).toBeInTheDocument()
    })

    // Land count section
    expect(screen.getByText(/You have/)).toBeInTheDocument()
    expect(screen.getByText('34')).toBeInTheDocument()
    expect(screen.getByText('37')).toBeInTheDocument()

    // Coverage gaps
    expect(
      screen.getByRole('heading', { name: 'Coverage Gaps' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Not enough blue sources for your blue pip count')
    ).toBeInTheDocument()

    // Suggested changes
    expect(
      screen.getByRole('heading', { name: 'Suggested Changes' })
    ).toBeInTheDocument()
    expect(screen.getByText('Breeding Pool')).toBeInTheDocument()
    expect(screen.getByText('Watery Grave')).toBeInTheDocument()
    expect(screen.getByText('Evolving Wilds')).toBeInTheDocument()
  })

  it('shows "Owned" badge on owned suggestions', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockManaResult),
    })

    render(
      <ManaAnalysisPanel
        deckId={100}
        commanderName="Muldrotha, the Gravetide"
        cards={mockCards}
      />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(
      screen.getByRole('button', { name: /Analyze Mana Base/i })
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Suggested Changes' })
      ).toBeInTheDocument()
    })

    // Breeding Pool is owned
    const ownedBadges = screen.getAllByText('Owned')
    expect(ownedBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('shows confirmation modal when Swap button is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockManaResult),
    })

    render(
      <ManaAnalysisPanel
        deckId={100}
        commanderName="Muldrotha, the Gravetide"
        cards={mockCards}
      />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(
      screen.getByRole('button', { name: /Analyze Mana Base/i })
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Suggested Changes' })
      ).toBeInTheDocument()
    })

    // Click swap button for Breeding Pool
    fireEvent.click(
      screen.getByRole('button', {
        name: /Swap Evolving Wilds for Breeding Pool/i,
      })
    )

    // Confirmation modal should appear
    await waitFor(() => {
      expect(
        screen.getByText(/Swap Evolving Wilds → Breeding Pool\?/)
      ).toBeInTheDocument()
    })
  })

  it('shows error state with retry button on failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({ error: 'MCP server unavailable' }),
    })

    render(
      <ManaAnalysisPanel
        deckId={100}
        commanderName="Muldrotha, the Gravetide"
        cards={mockCards}
      />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(
      screen.getByRole('button', { name: /Analyze Mana Base/i })
    )

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveTextContent('MCP server unavailable')
    })

    expect(
      screen.getByRole('button', { name: /Retry/i })
    ).toBeInTheDocument()
  })

  it('shows empty state when no suggestions or gaps', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          colorDistribution: {},
          landCount: 37,
          recommendedLandCount: 37,
          coverageGaps: [],
          suggestions: [],
        }),
    })

    render(
      <ManaAnalysisPanel
        deckId={100}
        commanderName="Muldrotha, the Gravetide"
        cards={mockCards}
      />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(
      screen.getByRole('button', { name: /Analyze Mana Base/i })
    )

    await waitFor(() => {
      expect(
        screen.getByText(
          'Your mana base looks solid — no changes suggested.'
        )
      ).toBeInTheDocument()
    })
  })

  it('retries after error when Retry button is clicked', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Timeout' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockManaResult),
      })

    render(
      <ManaAnalysisPanel
        deckId={100}
        commanderName="Muldrotha, the Gravetide"
        cards={mockCards}
      />,
      { wrapper: createWrapper() }
    )

    // First attempt fails
    fireEvent.click(
      screen.getByRole('button', { name: /Analyze Mana Base/i })
    )
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // Retry succeeds
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Colour Distribution' })
      ).toBeInTheDocument()
    })
  })
})
