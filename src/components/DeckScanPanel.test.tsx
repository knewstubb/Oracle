import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeckScanPanel } from './DeckScanPanel'
import type { DeckCard } from './CardGrid'

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
    card_name: 'Sol Ring',
    scryfall_id: 'abc12345-6789-0000-0000-000000000001',
    set_code: 'c21',
    quantity: 1,
    categories: 'Artifacts',
    tags: '',
    is_commander: false,
  },
  {
    id: 2,
    deck_id: 100,
    card_name: 'Muldrotha, the Gravetide',
    scryfall_id: 'abc12345-6789-0000-0000-000000000002',
    set_code: 'dom',
    quantity: 1,
    categories: 'Creatures',
    tags: '',
    is_commander: true,
  },
]

const mockScanResult = {
  strategy: 'This is a graveyard-based strategy that recurs permanents.',
  winConditions: ['Commander damage with Muldrotha, the Gravetide'],
  combos: [
    { cards: ['Sol Ring', 'Muldrotha, the Gravetide'], result: 'Infinite mana loop' },
  ],
  strengths: ['Strong recursion engine', 'Good card advantage'],
  weaknesses: ['Vulnerable to graveyard hate', 'Slow early game'],
  bracket: 'Mid',
  commanderName: 'Muldrotha, the Gravetide',
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('DeckScanPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders pre-scan prompt and button in idle state', () => {
    render(
      <DeckScanPanel deckId={100} commanderName="Muldrotha, the Gravetide" cards={mockCards} />,
      { wrapper: createWrapper() }
    )
    expect(
      screen.getByText("Run a scan to analyze this deck's strategy, combos, and power level.")
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Scan Deck/i })).toBeInTheDocument()
  })

  it('shows step progress during analysis', async () => {
    // Never resolve the fetch so we stay in scanning state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(
      <DeckScanPanel deckId={100} commanderName="Muldrotha, the Gravetide" cards={mockCards} />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(screen.getByRole('button', { name: /Scan Deck/i }))

    await waitFor(() => {
      expect(screen.getByText('Analyzing card synergies...')).toBeInTheDocument()
      expect(screen.getByText('Detecting combos...')).toBeInTheDocument()
      expect(screen.getByText('Assessing power level...')).toBeInTheDocument()
    })
  })

  it('renders full analysis on success', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockScanResult),
    })

    render(
      <DeckScanPanel deckId={100} commanderName="Muldrotha, the Gravetide" cards={mockCards} />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(screen.getByRole('button', { name: /Scan Deck/i }))

    await waitFor(() => {
      // Strategy section
      expect(screen.getByRole('heading', { name: 'Strategy' })).toBeInTheDocument()
      expect(screen.getByText(/graveyard-based strategy/)).toBeInTheDocument()
    })

    // Win Conditions
    expect(screen.getByRole('heading', { name: 'Win Conditions' })).toBeInTheDocument()

    // Combos
    expect(screen.getByRole('heading', { name: 'Combos' })).toBeInTheDocument()
    expect(screen.getByText('Infinite mana loop')).toBeInTheDocument()

    // Strengths (green dots)
    expect(screen.getByRole('heading', { name: 'Strengths' })).toBeInTheDocument()
    expect(screen.getByText('Strong recursion engine')).toBeInTheDocument()

    // Weaknesses (amber dots)
    expect(screen.getByRole('heading', { name: 'Weaknesses' })).toBeInTheDocument()
    expect(screen.getByText('Vulnerable to graveyard hate')).toBeInTheDocument()

    // Bracket badge
    expect(screen.getByRole('heading', { name: 'Power Level' })).toBeInTheDocument()
    expect(screen.getByText('Mid')).toBeInTheDocument()
  })

  it('renders card names as clickable elements in combos', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockScanResult),
    })

    render(
      <DeckScanPanel deckId={100} commanderName="Muldrotha, the Gravetide" cards={mockCards} />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(screen.getByRole('button', { name: /Scan Deck/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Combos' })).toBeInTheDocument()
    })

    // Combo card names should be clickable elements with aria-labels
    const solRingLink = screen.getByRole('link', { name: 'View Sol Ring' })
    expect(solRingLink).toBeInTheDocument()
  })

  it('shows error message with retry button on failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'MCP server unavailable' }),
    })

    render(
      <DeckScanPanel deckId={100} commanderName="Muldrotha, the Gravetide" cards={mockCards} />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(screen.getByRole('button', { name: /Scan Deck/i }))

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveTextContent('MCP server unavailable')
    })

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
  })

  it('retries scan when Retry button is clicked after error', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Timeout' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockScanResult),
      })

    render(
      <DeckScanPanel deckId={100} commanderName="Muldrotha, the Gravetide" cards={mockCards} />,
      { wrapper: createWrapper() }
    )

    // First attempt fails
    fireEvent.click(screen.getByRole('button', { name: /Scan Deck/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // Retry succeeds
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Strategy' })).toBeInTheDocument()
    })
  })

  it('renders strengths with green dots and weaknesses with amber dots', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockScanResult),
    })

    const { container } = render(
      <DeckScanPanel deckId={100} commanderName="Muldrotha, the Gravetide" cards={mockCards} />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(screen.getByRole('button', { name: /Scan Deck/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Strengths' })).toBeInTheDocument()
    })

    // Green dots for strengths
    const strengthDots = container.querySelectorAll('.bg-success')
    expect(strengthDots.length).toBeGreaterThan(0)

    // Amber dots for weaknesses
    const weaknessDots = container.querySelectorAll('.bg-warning')
    expect(weaknessDots.length).toBeGreaterThan(0)
  })
})
