import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrategyCanvas } from './StrategyCanvas'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

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

const unconfiguredResponse = {
  configured: false,
  win_condition: null,
  table_context: null,
  bracket: null,
  budget_mode: null,
  budget_ceiling: null,
  frustration: null,
  strategy_notes: null,
  format_rules: null,
  updated_at: null,
}

const configuredResponse = {
  configured: true,
  win_condition: 'Infinite mana via Peregrine Drake loops',
  table_context: 'Casual pod, power level 6-7',
  bracket: 3,
  budget_mode: 'budget',
  budget_ceiling: 25.0,
  frustration: 'Deck feels too slow in the early game',
  strategy_notes: 'Focus on recursion engine',
  format_rules: null,
  updated_at: '2026-06-01T00:00:00Z',
}

describe('StrategyCanvas', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('Onboarding state (configured: false)', () => {
    it('renders onboarding prompt when strategy is not configured', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(unconfiguredResponse),
      })

      render(<StrategyCanvas deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Strategy Canvas')).toBeInTheDocument()
      })

      expect(
        screen.getByText(/Configure your deck's strategic intent/)
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /Configure Strategy/i })
      ).toBeInTheDocument()
    })

    it('transitions to editing state when Configure Strategy is clicked', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(unconfiguredResponse),
      })

      render(<StrategyCanvas deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Configure Strategy/i })
        ).toBeInTheDocument()
      })

      fireEvent.click(
        screen.getByRole('button', { name: /Configure Strategy/i })
      )

      await waitFor(() => {
        expect(screen.getByText('Configure Strategy')).toBeInTheDocument()
        expect(screen.getByLabelText(/Win Condition/i)).toBeInTheDocument()
      })
    })
  })

  describe('Editing state (form fields)', () => {
    it('shows all form fields when in editing state', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(unconfiguredResponse),
      })

      render(<StrategyCanvas deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Configure Strategy/i })
        ).toBeInTheDocument()
      })

      fireEvent.click(
        screen.getByRole('button', { name: /Configure Strategy/i })
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Win Condition/i)).toBeInTheDocument()
      })

      // Core form fields
      expect(screen.getByLabelText(/Table Context/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Bracket/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Budget Mode/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Format Type/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Frustrations/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Strategy Notes/i)).toBeInTheDocument()

      // Budget ceiling should NOT be visible when budget_mode is not 'budget'
      expect(screen.queryByLabelText(/Budget Ceiling/i)).not.toBeInTheDocument()
    })

    it('shows budget_ceiling field only when budget_mode is "budget"', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(unconfiguredResponse),
      })

      render(<StrategyCanvas deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Configure Strategy/i })
        ).toBeInTheDocument()
      })

      fireEvent.click(
        screen.getByRole('button', { name: /Configure Strategy/i })
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Budget Mode/i)).toBeInTheDocument()
      })

      // Budget ceiling not visible initially
      expect(screen.queryByLabelText(/Budget Ceiling/i)).not.toBeInTheDocument()

      // Select 'budget' mode
      fireEvent.change(screen.getByLabelText(/Budget Mode/i), {
        target: { value: 'budget' },
      })

      // Budget ceiling now visible
      expect(screen.getByLabelText(/Budget Ceiling/i)).toBeInTheDocument()
    })

    it('hides budget_ceiling when switching away from budget mode', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(unconfiguredResponse),
      })

      render(<StrategyCanvas deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Configure Strategy/i })
        ).toBeInTheDocument()
      })

      fireEvent.click(
        screen.getByRole('button', { name: /Configure Strategy/i })
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Budget Mode/i)).toBeInTheDocument()
      })

      // Select budget mode to show ceiling
      fireEvent.change(screen.getByLabelText(/Budget Mode/i), {
        target: { value: 'budget' },
      })
      expect(screen.getByLabelText(/Budget Ceiling/i)).toBeInTheDocument()

      // Switch to collection mode — ceiling disappears
      fireEvent.change(screen.getByLabelText(/Budget Mode/i), {
        target: { value: 'collection' },
      })
      expect(screen.queryByLabelText(/Budget Ceiling/i)).not.toBeInTheDocument()
    })
  })

  describe('Viewing state (read-only summary)', () => {
    it('renders read-only summary with configured data', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(configuredResponse),
      })

      render(<StrategyCanvas deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Strategy Canvas')).toBeInTheDocument()
      })

      // Verify data fields are displayed
      expect(
        screen.getByText('Infinite mana via Peregrine Drake loops')
      ).toBeInTheDocument()
      expect(
        screen.getByText('Casual pod, power level 6-7')
      ).toBeInTheDocument()
      expect(
        screen.getByText('Deck feels too slow in the early game')
      ).toBeInTheDocument()
      expect(
        screen.getByText('Focus on recursion engine')
      ).toBeInTheDocument()
    })

    it('shows Edit button in viewing state', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(configuredResponse),
      })

      render(<StrategyCanvas deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Edit/i })
        ).toBeInTheDocument()
      })
    })

    it('transitions to editing state when Edit button is clicked', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(configuredResponse),
      })

      render(<StrategyCanvas deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Edit/i })
        ).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Edit/i }))

      await waitFor(() => {
        expect(screen.getByLabelText(/Win Condition/i)).toBeInTheDocument()
      })

      // Form should be populated with existing values
      expect(screen.getByLabelText(/Win Condition/i)).toHaveValue(
        'Infinite mana via Peregrine Drake loops'
      )
    })
  })

  describe('Format-specific fields', () => {
    it('shows no format-specific fields when format type is "none"', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(unconfiguredResponse),
      })

      render(<StrategyCanvas deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Configure Strategy/i })
        ).toBeInTheDocument()
      })

      fireEvent.click(
        screen.getByRole('button', { name: /Configure Strategy/i })
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Format Type/i)).toBeInTheDocument()
      })

      // Default is 'none' — no format-specific fields
      expect(screen.queryByText('Precon Mod Rules')).not.toBeInTheDocument()
      expect(screen.queryByText('Baggy League Rules')).not.toBeInTheDocument()
      expect(screen.queryByText('Custom Format Rules')).not.toBeInTheDocument()
    })

    it('shows precon mod fields when format type is "precon_mod"', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(unconfiguredResponse),
      })

      render(<StrategyCanvas deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Configure Strategy/i })
        ).toBeInTheDocument()
      })

      fireEvent.click(
        screen.getByRole('button', { name: /Configure Strategy/i })
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Format Type/i)).toBeInTheDocument()
      })

      fireEvent.change(screen.getByLabelText(/Format Type/i), {
        target: { value: 'precon_mod' },
      })

      // Precon mod fields appear
      expect(screen.getByText('Precon Mod Rules')).toBeInTheDocument()
      expect(screen.getByLabelText(/Swap Limit/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Mandatory Cuts/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Value Cap/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Precon URL/i)).toBeInTheDocument()

      // Other format sections not present
      expect(screen.queryByText('Baggy League Rules')).not.toBeInTheDocument()
      expect(screen.queryByText('Custom Format Rules')).not.toBeInTheDocument()
    })

    it('shows baggy league fields when format type is "baggy_league"', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(unconfiguredResponse),
      })

      render(<StrategyCanvas deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Configure Strategy/i })
        ).toBeInTheDocument()
      })

      fireEvent.click(
        screen.getByRole('button', { name: /Configure Strategy/i })
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Format Type/i)).toBeInTheDocument()
      })

      fireEvent.change(screen.getByLabelText(/Format Type/i), {
        target: { value: 'baggy_league' },
      })

      // Baggy league fields appear
      expect(screen.getByText('Baggy League Rules')).toBeInTheDocument()
      expect(screen.getByLabelText(/Max Rarity Allowed/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Progression Level/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Progression Points/i)).toBeInTheDocument()

      // Other format sections not present
      expect(screen.queryByText('Precon Mod Rules')).not.toBeInTheDocument()
      expect(screen.queryByText('Custom Format Rules')).not.toBeInTheDocument()
    })

    it('shows custom format fields when format type is "custom"', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(unconfiguredResponse),
      })

      render(<StrategyCanvas deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Configure Strategy/i })
        ).toBeInTheDocument()
      })

      fireEvent.click(
        screen.getByRole('button', { name: /Configure Strategy/i })
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Format Type/i)).toBeInTheDocument()
      })

      fireEvent.change(screen.getByLabelText(/Format Type/i), {
        target: { value: 'custom' },
      })

      // Custom format fields appear
      expect(screen.getByText('Custom Format Rules')).toBeInTheDocument()
      expect(screen.getByLabelText(/Description/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Constraints/i)).toBeInTheDocument()

      // Other format sections not present
      expect(screen.queryByText('Precon Mod Rules')).not.toBeInTheDocument()
      expect(screen.queryByText('Baggy League Rules')).not.toBeInTheDocument()
    })

    it('hides format fields when switching from a format type to "none"', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(unconfiguredResponse),
      })

      render(<StrategyCanvas deckId={1} />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Configure Strategy/i })
        ).toBeInTheDocument()
      })

      fireEvent.click(
        screen.getByRole('button', { name: /Configure Strategy/i })
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Format Type/i)).toBeInTheDocument()
      })

      // Select precon_mod
      fireEvent.change(screen.getByLabelText(/Format Type/i), {
        target: { value: 'precon_mod' },
      })
      expect(screen.getByText('Precon Mod Rules')).toBeInTheDocument()

      // Switch back to none
      fireEvent.change(screen.getByLabelText(/Format Type/i), {
        target: { value: 'none' },
      })
      expect(screen.queryByText('Precon Mod Rules')).not.toBeInTheDocument()
    })
  })
})
