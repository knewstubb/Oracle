import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OverviewPanel } from './OverviewPanel'
import type { DeckCard } from './CardGrid'

// Mock lucide-react icons used across OverviewPanel and sub-components
vi.mock('lucide-react', () => ({
  AlertCircle: (props: Record<string, unknown>) => <svg data-testid="alert-circle-icon" {...props} />,
  ChevronRight: (props: Record<string, unknown>) => <svg data-testid="chevron-right" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <svg data-testid="chevron-down" {...props} />,
}))

const mockCards: DeckCard[] = [
  {
    id: 1,
    deck_id: 42,
    card_name: 'Sol Ring',
    scryfall_id: 'sol-ring-id',
    set_code: 'c21',
    quantity: 1,
    categories: '["Ramp"]',
    tags: '',
    is_commander: false,
  },
  {
    id: 2,
    deck_id: 42,
    card_name: 'Forest',
    scryfall_id: 'forest-id',
    set_code: 'c21',
    quantity: 30,
    categories: '["Land"]',
    tags: '',
    is_commander: false,
  },
  {
    id: 3,
    deck_id: 42,
    card_name: 'Muldrotha, the Gravetide',
    scryfall_id: 'muldrotha-id',
    set_code: 'dom',
    quantity: 1,
    categories: '["Commander"]',
    tags: '',
    is_commander: true,
  },
]

const mockOverviewData = {
  strategy: 'Muldrotha plays permanents from the graveyard for value.',
  winConditions: ['Infinite combo with Deadeye Navigator'],
  strengths: ['Strong recursion engine'],
  weaknesses: ['Weak to graveyard hate'],
  bracket: '3',
}

const mockRatingsResponse = {
  scores: { consistency: 7, resilience: 5, interaction: 6, speed: 4 },
  contributingCards: {
    tutors: ['Demonic Tutor'],
    drawEngines: ['Rhystic Study'],
    recursion: ['Eternal Witness'],
    removal: ['Swords to Plowshares'],
    counterspells: ['Counterspell'],
    boardWipes: ['Wrath of God'],
    fastMana: ['Sol Ring'],
  },
  keyCards: [{ cardName: 'Muldrotha', reason: 'Commander', priorityTier: 'commander' }],
  primer: {
    coreStrategy: 'Muldrotha leads a resilient strategy.',
    mulliganPriorities: ['Keep hands with lands and ramp'],
    keyTips: ['Deploy Muldrotha when protected'],
  },
  weaknesses: [{ description: 'Graveyard hate', severity: 'Critical', hateCards: ['Rest in Peace'] }],
  metadata: { nonLandCardCount: 65, insufficientData: false },
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('OverviewPanel integration — ratings', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders skeleton placeholders while loading ratings', async () => {
    // Overview resolves immediately, ratings never resolves (stays loading)
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/overview')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockOverviewData),
        })
      }
      // Ratings fetch never resolves
      return new Promise(() => {})
    })

    render(
      <OverviewPanel deckId={42} commanderName="Muldrotha" cards={mockCards} bracket="3" />,
      { wrapper: createWrapper() }
    )

    // Wait for overview to finish loading (so the main skeleton goes away)
    await waitFor(() => {
      expect(screen.getByText('Strategy & Playstyle')).toBeInTheDocument()
    })

    // The ratings section should show skeleton while loading
    // The ratings skeleton is a section with Skeleton elements
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders empty state when ratings returns 404', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/ratings')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ message: 'No ratings generated' }),
        })
      }
      // overview
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverviewData),
      })
    })

    render(
      <OverviewPanel deckId={42} commanderName="Muldrotha" cards={mockCards} bracket="3" />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('No ratings computed yet')).toBeInTheDocument()
    })
  })

  it('renders error indicator on network failure', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/ratings')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: 'Internal server error' }),
        })
      }
      // overview
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverviewData),
      })
    })

    render(
      <OverviewPanel deckId={42} commanderName="Muldrotha" cards={mockCards} bracket="3" />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to load ratings data.')).toBeInTheDocument()
    })

    // Other sections still render
    expect(screen.getByText('Strategy & Playstyle')).toBeInTheDocument()
  })

  it('renders all four sections in correct order when data available', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/ratings')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockRatingsResponse),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverviewData),
      })
    })

    render(
      <OverviewPanel deckId={42} commanderName="Muldrotha" cards={mockCards} bracket="3" />,
      { wrapper: createWrapper() }
    )

    // Wait for all sections to render
    await waitFor(() => {
      expect(screen.getByText('Consistency')).toBeInTheDocument()
    })

    // Verify all four sections exist
    // RatingsSection: shows attribute labels
    expect(screen.getByText('Consistency')).toBeInTheDocument()
    expect(screen.getByText('Resilience')).toBeInTheDocument()
    expect(screen.getByText('Interaction')).toBeInTheDocument()
    expect(screen.getByText('Speed')).toBeInTheDocument()

    // KeyCardsSection: shows Key Cards heading and card name
    expect(screen.getByText('Key Cards')).toBeInTheDocument()
    expect(screen.getByText('Muldrotha')).toBeInTheDocument()

    // PrimerSection: shows Primer heading and subsections
    expect(screen.getByText('Primer')).toBeInTheDocument()
    expect(screen.getByText('Core Strategy')).toBeInTheDocument()
    expect(screen.getByText('Muldrotha leads a resilient strategy.')).toBeInTheDocument()

    // WeaknessSection: shows Weaknesses heading with severity
    expect(screen.getByText('Weaknesses')).toBeInTheDocument()
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByText('Graveyard hate')).toBeInTheDocument()

    // Verify order: RatingsSection → KeyCardsSection → PrimerSection → WeaknessSection → Strategy
    const container = document.querySelector('.space-y-8')!
    const allText = container.textContent || ''
    const consistencyIdx = allText.indexOf('Consistency')
    const keyCardsIdx = allText.indexOf('Key Cards')
    const primerIdx = allText.indexOf('Primer')
    const weaknessesIdx = allText.indexOf('Weaknesses')
    const strategyIdx = allText.indexOf('Strategy & Playstyle')

    expect(consistencyIdx).toBeLessThan(keyCardsIdx)
    expect(keyCardsIdx).toBeLessThan(primerIdx)
    expect(primerIdx).toBeLessThan(weaknessesIdx)
    expect(weaknessesIdx).toBeLessThan(strategyIdx)
  })

  it('severity-categorized weaknesses replace flat list when ratings available', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/ratings')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockRatingsResponse),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOverviewData),
      })
    })

    render(
      <OverviewPanel deckId={42} commanderName="Muldrotha" cards={mockCards} bracket="3" />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('Critical')).toBeInTheDocument()
    })

    // Severity-categorized weakness section renders with hate cards
    expect(screen.getByText('Graveyard hate')).toBeInTheDocument()
    expect(screen.getByText('Rest in Peace')).toBeInTheDocument()

    // The flat weaknesses list (bullet point style) should NOT render
    // The overview data has weaknesses: ['Weak to graveyard hate']
    // When ratings are available, the flat "Weaknesses" heading from the overview
    // strengths/weaknesses grid is not rendered (only the severity-categorized version shows)
    const flatWeaknessText = screen.queryByText('Weak to graveyard hate')
    expect(flatWeaknessText).not.toBeInTheDocument()
  })
})
