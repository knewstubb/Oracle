/**
 * Tests for RollupView component.
 *
 * Validates:
 * - Renders loading state
 * - Renders rows with correct data
 * - Sorts by card_name ascending by default
 * - Highlights shortfall rows with distinct treatment
 * - Hide Basic Land toggle filters out basic lands
 * - Row click calls onRowSelect callback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RollupView } from './RollupView'
import type { RollupRow } from './RollupView'

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockRows: RollupRow[] = [
  {
    oracleId: 'oracle-1',
    cardName: 'Sol Ring',
    ownedCount: 3,
    proxyCount: 0,
    allocatedCount: 2,
    shortfall: 0,
    typeLine: 'Artifact',
  },
  {
    oracleId: 'oracle-2',
    cardName: 'Arcane Signet',
    ownedCount: 2,
    proxyCount: 1,
    allocatedCount: 3,
    shortfall: 1,
    typeLine: 'Artifact',
  },
  {
    oracleId: 'oracle-3',
    cardName: 'Forest',
    ownedCount: 30,
    proxyCount: 0,
    allocatedCount: 28,
    shortfall: 0,
    typeLine: 'Basic Land — Forest',
  },
  {
    oracleId: 'oracle-4',
    cardName: 'Plains',
    ownedCount: 20,
    proxyCount: 0,
    allocatedCount: 15,
    shortfall: 0,
    typeLine: 'Basic Land — Plains',
  },
]

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

let mockFetchResponse: { ok: boolean; json: () => Promise<unknown> }

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchResponse = {
    ok: true,
    json: async () => ({ rows: mockRows }),
  }
  global.fetch = vi.fn(() => Promise.resolve(mockFetchResponse as Response))
})

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function renderWithProviders(props: { onRowSelect?: (oracleId: string) => void } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RollupView {...props} />
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RollupView', () => {
  it('renders loading state initially', () => {
    // Never resolve fetch so it stays loading
    global.fetch = vi.fn(() => new Promise(() => {}))
    renderWithProviders()
    // Loading skeleton should be visible (animated pulse divs)
    const pulses = document.querySelectorAll('.animate-pulse')
    expect(pulses.length).toBeGreaterThan(0)
  })

  it('renders rows after data loads', async () => {
    renderWithProviders()
    await waitFor(() => {
      expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    })
    expect(screen.getByText('Arcane Signet')).toBeInTheDocument()
  })

  it('sorts by card_name ascending by default', async () => {
    renderWithProviders()
    await waitFor(() => {
      expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    })

    // Arcane Signet comes before Sol Ring alphabetically
    const buttons = screen.getAllByRole('button')
    const rowButtons = buttons.filter(btn =>
      btn.getAttribute('aria-label')?.includes('Sol Ring') ||
      btn.getAttribute('aria-label')?.includes('Arcane Signet')
    )
    // First row (Arcane Signet) should appear before Sol Ring
    const allText = document.body.textContent ?? ''
    const arcaneIdx = allText.indexOf('Arcane Signet')
    const solIdx = allText.indexOf('Sol Ring')
    expect(arcaneIdx).toBeLessThan(solIdx)
  })

  it('hides basic land rows by default (toggle on)', async () => {
    renderWithProviders()
    await waitFor(() => {
      expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    })
    // Forest and Plains should be hidden (Basic Land filter active by default)
    expect(screen.queryByText('Forest')).not.toBeInTheDocument()
    expect(screen.queryByText('Plains')).not.toBeInTheDocument()
  })

  it('shows basic land rows when toggle is off', async () => {
    renderWithProviders()
    await waitFor(() => {
      expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    })

    // Toggle off the Basic Land filter
    const toggle = screen.getByRole('switch', { name: /hide basic land/i })
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(screen.getByText('Forest')).toBeInTheDocument()
    })
    expect(screen.getByText('Plains')).toBeInTheDocument()
  })

  it('highlights rows with shortfall > 0', async () => {
    renderWithProviders()
    await waitFor(() => {
      expect(screen.getByText('Arcane Signet')).toBeInTheDocument()
    })

    // The Arcane Signet row button should have a shortfall indicator
    const shortfallButton = screen.getByLabelText(/Arcane Signet, shortfall of 1/)
    expect(shortfallButton).toBeInTheDocument()
    // The parent row div should have amber left border
    const rowDiv = shortfallButton.closest('[style*="border-left"]')
    expect(rowDiv).toHaveStyle({ borderLeft: '2px solid rgba(245,158,11,0.5)' })
  })

  it('calls onRowSelect when a row is clicked', async () => {
    const onRowSelect = vi.fn()
    renderWithProviders({ onRowSelect })
    await waitFor(() => {
      expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Sol Ring'))
    expect(onRowSelect).toHaveBeenCalledWith('oracle-1')
  })

  it('shows correct card count in toolbar', async () => {
    renderWithProviders()
    await waitFor(() => {
      expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    })
    // With basic lands hidden, should show 2 cards
    expect(screen.getByText('2 cards')).toBeInTheDocument()
  })

  it('renders error state on fetch failure', async () => {
    mockFetchResponse = { ok: false, json: async () => ({ error: 'fail' }) }
    renderWithProviders()
    await waitFor(() => {
      expect(screen.getByText(/Failed to load collection rollup/)).toBeInTheDocument()
    })
  })
})
