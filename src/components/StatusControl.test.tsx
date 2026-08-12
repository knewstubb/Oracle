import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusControl } from './StatusControl'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('StatusControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders three status buttons', () => {
    render(<StatusControl deckId={1} currentStatus="in_rotation" />, { wrapper: createWrapper() })
    expect(screen.getByRole('radio', { name: 'Set status to Brewing' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Set status to Active' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Set status to Graveyard' })).toBeInTheDocument()
  })

  it('marks the current status as checked', () => {
    render(<StatusControl deckId={1} currentStatus="brewing" />, { wrapper: createWrapper() })
    expect(screen.getByRole('radio', { name: 'Set status to Brewing' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Set status to Active' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Set status to Graveyard' })).toHaveAttribute('aria-checked', 'false')
  })

  it('calls PATCH API on status change', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ deck: { id: 1, name: 'Test', status: 'brewing' }, allocationRerun: true }),
    })

    render(<StatusControl deckId={1} currentStatus="in_rotation" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('radio', { name: 'Set status to Brewing' }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/decks/1/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'brewing' }),
      })
    })
  })

  it('shows confirmation dialog when transitioning Active to Graveyard', async () => {
    render(<StatusControl deckId={1} currentStatus="in_rotation" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('radio', { name: 'Set status to Graveyard' }))

    // Dialog should open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Move to Graveyard?')).toBeInTheDocument()
    })
  })

  it('does not call API if graveyard confirmation is cancelled', async () => {
    render(<StatusControl deckId={1} currentStatus="in_rotation" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('radio', { name: 'Set status to Graveyard' }))

    // Wait for dialog to open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Click cancel
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not show confirmation dialog for non-graveyard transitions', () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ deck: { id: 1, name: 'Test', status: 'brewing' }, allocationRerun: true }),
    })

    render(<StatusControl deckId={1} currentStatus="in_rotation" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('radio', { name: 'Set status to Brewing' }))

    // No dialog should appear
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reverts to previous status on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Server error' }),
    })

    render(<StatusControl deckId={1} currentStatus="in_rotation" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('radio', { name: 'Set status to Brewing' }))

    await waitFor(() => {
      const activeRadio = screen.getByRole('radio', { name: 'Set status to Active' })
      expect(activeRadio).toHaveAttribute('aria-checked', 'true')
    })
  })

  it('does nothing when clicking the already-selected status', () => {
    render(<StatusControl deckId={1} currentStatus="in_rotation" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('radio', { name: 'Set status to Active' }))

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('has accessible radiogroup role', () => {
    render(<StatusControl deckId={1} currentStatus="in_rotation" />, { wrapper: createWrapper() })
    expect(screen.getByRole('radiogroup', { name: 'Deck status' })).toBeInTheDocument()
  })

  it('does not show confirmation when transitioning Brewing to Graveyard', () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ deck: { id: 1, name: 'Test', status: 'graveyard' }, allocationRerun: false }),
    })

    render(<StatusControl deckId={1} currentStatus="brewing" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('radio', { name: 'Set status to Graveyard' }))

    // No dialog should appear for Brewing → Graveyard (no claimed cards in Brewing)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
