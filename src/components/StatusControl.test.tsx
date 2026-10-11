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

  it('renders two status buttons', () => {
    render(<StatusControl deckId={1} currentStatus="in_rotation" />, { wrapper: createWrapper() })
    expect(screen.getByRole('radio', { name: 'Set status to Brewing' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Set status to Active' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Set status to Graveyard' })).not.toBeInTheDocument()
  })

  it('marks the current status as checked', () => {
    render(<StatusControl deckId={1} currentStatus="brewing" />, { wrapper: createWrapper() })
    expect(screen.getByRole('radio', { name: 'Set status to Brewing' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Set status to Active' })).toHaveAttribute('aria-checked', 'false')
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

  it('does not show a confirmation dialog for status transitions', () => {
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
})
