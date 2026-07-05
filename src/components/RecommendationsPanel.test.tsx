import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecommendationsPanel } from './RecommendationsPanel'

// ---------------------------------------------------------------------------
// Test data matching the UpgradeResponse shape
// ---------------------------------------------------------------------------

const mockUpgradeResponse = {
  budgetMode: 'unrestricted' as const,
  budgetCeiling: 10,
  upgrades: [
    {
      cardName: 'Spore Frog',
      role: 'Recursion',
      synergyScore: 85,
      reason: 'Excellent recursion target for Muldrotha',
      owned: true,
      price: 0.5,
      suggestedCut: 'Coiling Oracle',
      cutFlag: 'off_strategy' as const,
    },
    {
      cardName: 'Sakura-Tribe Elder',
      role: 'Ramp',
      synergyScore: 78,
      reason: 'Ramp that can be recurred',
      owned: true,
      price: 1.0,
      suggestedCut: 'Rampant Growth',
      cutFlag: 'redundant' as const,
    },
    {
      cardName: 'Rhystic Study',
      role: 'Draw',
      synergyScore: 72,
      reason: 'Best blue draw engine in multiplayer',
      owned: false,
      price: 35.0,
      suggestedCut: 'Divination',
      cutFlag: 'off_strategy' as const,
    },
    {
      cardName: 'Dauthi Voidwalker',
      role: 'Hate',
      synergyScore: 65,
      reason: 'Graveyard hate on a body',
      owned: false,
      price: 8.0,
      suggestedCut: 'Grafdigger\'s Cage',
      cutFlag: 'bracket_mismatch' as const,
    },
    {
      cardName: 'Seal of Primordium',
      role: 'Removal',
      synergyScore: 60,
      reason: 'Recurrable enchantment removal',
      owned: false,
      price: 0.25,
      suggestedCut: 'Naturalize',
      cutFlag: 'format_violation' as const,
    },
  ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

function mockFetchSuccess(data = mockUpgradeResponse) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  })
}

function mockFetch404() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    json: () => Promise.resolve(null),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecommendationsPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // =========================================================================
  // Paired swap layout renders upgrade + cut side-by-side
  // Validates: Requirement 9.1
  // =========================================================================
  describe('paired swap layout', () => {
    it('renders upgrade card name and its suggested cut side-by-side', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      })

      // Upgrade candidates are displayed
      expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      expect(screen.getByText('Sakura-Tribe Elder')).toBeInTheDocument()
      expect(screen.getByText('Rhystic Study')).toBeInTheDocument()

      // Their paired cuts are displayed
      expect(screen.getByText('Coiling Oracle')).toBeInTheDocument()
      expect(screen.getByText('Rampant Growth')).toBeInTheDocument()
      expect(screen.getByText('Divination')).toBeInTheDocument()
    })

    it('renders swap arrow between add and cut cards', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      })

      // The ArrowLeftRight icon has aria-label "swaps with"
      const swapArrows = screen.getAllByLabelText('swaps with')
      expect(swapArrows.length).toBe(5) // one per upgrade row
    })

    it('shows "No paired cut" when suggestedCut is null', async () => {
      const dataWithNullCut = {
        ...mockUpgradeResponse,
        upgrades: [
          {
            cardName: 'Spore Frog',
            role: 'Recursion',
            synergyScore: 85,
            reason: 'Recursion target',
            owned: true,
            price: 0.5,
            suggestedCut: null,
            cutFlag: null,
          },
        ],
      }
      mockFetchSuccess(dataWithNullCut)

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      })

      expect(screen.getByText('No paired cut')).toBeInTheDocument()
    })

    it('displays synergy score percentage on each upgrade', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      })

      expect(screen.getByText('85% synergy')).toBeInTheDocument()
      expect(screen.getByText('78% synergy')).toBeInTheDocument()
      expect(screen.getByText('72% synergy')).toBeInTheDocument()
    })

    it('displays price for unowned cards', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Rhystic Study')).toBeInTheDocument()
      })

      // Rhystic Study is unowned with price $35.00
      expect(screen.getByText('$35.00')).toBeInTheDocument()
      // Dauthi Voidwalker is unowned with price $8.00
      expect(screen.getByText('$8.00')).toBeInTheDocument()
    })
  })

  // =========================================================================
  // Ownership badge distinguishes owned vs unowned
  // Validates: Requirement 9.2
  // =========================================================================
  describe('ownership badge', () => {
    it('shows green "Owned" badge for owned upgrades', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      })

      // Two owned cards (Spore Frog, Sakura-Tribe Elder) should have "Owned" badges
      const ownedBadges = screen.getAllByText('Owned')
      expect(ownedBadges.length).toBe(2)
    })

    it('shows grey "Buy" badge for unowned upgrades', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Rhystic Study')).toBeInTheDocument()
      })

      // Three unowned cards should have "Buy" badges
      const buyBadges = screen.getAllByText('Buy')
      expect(buyBadges.length).toBe(3)
    })
  })

  // =========================================================================
  // Budget toggle filters displayed results client-side
  // Validates: Requirement 9.5, 9.7
  // =========================================================================
  describe('budget toggle filtering', () => {
    it('renders the budget mode toggle with three options', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      })

      const radioGroup = screen.getByRole('radiogroup', { name: /budget mode filter/i })
      expect(radioGroup).toBeInTheDocument()

      expect(screen.getByRole('radio', { name: 'Collection' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Budget' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Unrestricted' })).toBeInTheDocument()
    })

    it('defaults to unrestricted showing all upgrades', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      })

      // All 5 upgrades visible in unrestricted mode
      expect(screen.getByText('5 suggestions shown')).toBeInTheDocument()
    })

    it('collection mode shows only owned upgrades', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      })

      // Switch to Collection mode
      fireEvent.click(screen.getByRole('radio', { name: 'Collection' }))

      // Only owned cards shown (Spore Frog and Sakura-Tribe Elder)
      await waitFor(() => {
        expect(screen.getByText('2 suggestions shown (collection filter active)')).toBeInTheDocument()
      })

      expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      expect(screen.getByText('Sakura-Tribe Elder')).toBeInTheDocument()
      // Unowned cards should NOT be visible
      expect(screen.queryByText('Rhystic Study')).not.toBeInTheDocument()
      expect(screen.queryByText('Dauthi Voidwalker')).not.toBeInTheDocument()
    })

    it('budget mode shows owned + cards within budget ceiling', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      })

      // Switch to Budget mode (ceiling is 10)
      fireEvent.click(screen.getByRole('radio', { name: 'Budget' }))

      await waitFor(() => {
        expect(screen.getByText('4 suggestions shown (budget filter active)')).toBeInTheDocument()
      })

      // Owned cards always pass
      expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      expect(screen.getByText('Sakura-Tribe Elder')).toBeInTheDocument()
      // Dauthi Voidwalker ($8) is within budget ceiling ($10)
      expect(screen.getByText('Dauthi Voidwalker')).toBeInTheDocument()
      // Seal of Primordium ($0.25) is within budget ceiling
      expect(screen.getByText('Seal of Primordium')).toBeInTheDocument()
      // Rhystic Study ($35) exceeds budget ceiling
      expect(screen.queryByText('Rhystic Study')).not.toBeInTheDocument()
    })

    it('does not make a new API call when toggle changes', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      })

      const fetchCallCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

      // Switch to Collection mode
      fireEvent.click(screen.getByRole('radio', { name: 'Collection' }))

      // No new fetch calls
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallCount)
    })
  })

  // =========================================================================
  // Sort order (owned first, then synergy descending)
  // Validates: Requirement 9.6
  // =========================================================================
  describe('sort order', () => {
    it('displays owned cards before unowned cards', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Spore Frog')).toBeInTheDocument()
      })

      const cardNames = screen.getAllByText(
        /Spore Frog|Sakura-Tribe Elder|Rhystic Study|Dauthi Voidwalker|Seal of Primordium/
      )

      // First two should be owned (Spore Frog 85%, Sakura-Tribe Elder 78%)
      // Then unowned sorted by synergy: Rhystic Study 72%, Dauthi Voidwalker 65%, Seal of Primordium 60%
      expect(cardNames[0]).toHaveTextContent('Spore Frog')
      expect(cardNames[1]).toHaveTextContent('Sakura-Tribe Elder')
      expect(cardNames[2]).toHaveTextContent('Rhystic Study')
      expect(cardNames[3]).toHaveTextContent('Dauthi Voidwalker')
      expect(cardNames[4]).toHaveTextContent('Seal of Primordium')
    })

    it('sorts within owned group by synergy descending', async () => {
      const data = {
        ...mockUpgradeResponse,
        upgrades: [
          {
            cardName: 'Low Synergy Owned',
            role: 'Ramp',
            synergyScore: 40,
            reason: 'ok',
            owned: true,
            price: 1,
            suggestedCut: null,
            cutFlag: null,
          },
          {
            cardName: 'High Synergy Owned',
            role: 'Draw',
            synergyScore: 90,
            reason: 'great',
            owned: true,
            price: 2,
            suggestedCut: null,
            cutFlag: null,
          },
        ],
      }
      mockFetchSuccess(data)

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('High Synergy Owned')).toBeInTheDocument()
      })

      const cardNames = screen.getAllByText(/High Synergy Owned|Low Synergy Owned/)
      expect(cardNames[0]).toHaveTextContent('High Synergy Owned')
      expect(cardNames[1]).toHaveTextContent('Low Synergy Owned')
    })
  })

  // =========================================================================
  // Dead weight flag badge appears on cuts
  // Validates: Requirement 9.4
  // =========================================================================
  describe('dead weight flag badge on cuts', () => {
    it('shows "Off Strategy" badge on cuts flagged off_strategy', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Coiling Oracle')).toBeInTheDocument()
      })

      // off_strategy cuts show "Off Strategy" badge
      expect(screen.getAllByText('Off Strategy').length).toBeGreaterThanOrEqual(1)
    })

    it('shows "Redundant" badge on cuts flagged redundant', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Rampant Growth')).toBeInTheDocument()
      })

      expect(screen.getByText('Redundant')).toBeInTheDocument()
    })

    it('shows "Bracket" badge on cuts flagged bracket_mismatch', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText("Grafdigger's Cage")).toBeInTheDocument()
      })

      expect(screen.getByText('Bracket')).toBeInTheDocument()
    })

    it('shows "Format" badge on cuts flagged format_violation', async () => {
      mockFetchSuccess()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Naturalize')).toBeInTheDocument()
      })

      expect(screen.getByText('Format')).toBeInTheDocument()
    })

    it('does not show a flag badge when cutFlag is null', async () => {
      const data = {
        ...mockUpgradeResponse,
        upgrades: [
          {
            cardName: 'Test Card',
            role: 'Ramp',
            synergyScore: 50,
            reason: 'Test',
            owned: true,
            price: 1,
            suggestedCut: 'Some Cut',
            cutFlag: null,
          },
        ],
      }
      mockFetchSuccess(data)

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Some Cut')).toBeInTheDocument()
      })

      // No flag badges should appear
      expect(screen.queryByText('Redundant')).not.toBeInTheDocument()
      expect(screen.queryByText('Off Strategy')).not.toBeInTheDocument()
      expect(screen.queryByText('Bracket')).not.toBeInTheDocument()
      expect(screen.queryByText('Format')).not.toBeInTheDocument()
    })
  })

  // =========================================================================
  // Loading and error states
  // =========================================================================
  describe('loading and error states', () => {
    it('shows loading spinner while fetching', () => {
      global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      expect(screen.getByText('Loading upgrade suggestions...')).toBeInTheDocument()
    })

    it('shows error state with retry button on fetch failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      })

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      expect(screen.getByText(/Failed to load suggestions/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
    })

    it('shows empty state when API returns 404 (no data generated)', async () => {
      mockFetch404()

      render(<RecommendationsPanel deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByText(/No upgrade suggestions generated yet/)
        ).toBeInTheDocument()
      })
    })
  })
})
