import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusControl } from './StatusControl'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Mock window.confirm
const mockConfirm = vi.fn(() => true)
Object.defineProperty(window, 'confirm', { value: mockConfirm, writable: true })

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
    mockConfirm.mockReturnValue(true)
  })

  it('renders three status buttons', () => {
    render(<StatusControl deckId={1} currentStatus="active" />, { wrapper: createWrapper() })
    expect(screen.getByRole('radio', { name: 'Set status to Active' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Set status to Draft' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Set status to Inactive' })).toBeInTheDocument()
  })

  it('marks the current status as checked', () => {
    render(<StatusControl deckId={1} currentStatus="draft" />, { wrapper: createWrapper() })
    expect(screen.getByRole('radio', { name: 'Set status to Draft' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Set status to Active' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Set status to Inactive' })).toHaveAttribute('aria-checked', 'false')
  })

  it('calls PATCH API on status change', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ deck: { id: 1, name: 'Test', status: 'draft' }, allocationRerun: true }),
    })

    render(<StatusControl deckId={1} currentStatus="active" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('radio', { name: 'Set status to Draft' }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/decks/1/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      })
    })
  })

  it('shows confirmation dialog when transitioning to inactive', () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ deck: { id: 1, name: 'Test', status: 'inactive' }, allocationRerun: true }),
    })

    render(<StatusControl deckId={1} currentStatus="active" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('radio', { name: 'Set status to Inactive' }))

    expect(mockConfirm).toHaveBeenCalledWith(
      'Making this deck inactive will release all card allocations. Cards will be redistributed to other active decks.'
    )
  })

  it('does not call API if inactive confirmation is cancelled', () => {
    mockConfirm.mockReturnValue(false)

    render(<StatusControl deckId={1} currentStatus="active" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('radio', { name: 'Set status to Inactive' }))

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not show confirmation dialog for non-inactive transitions', () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ deck: { id: 1, name: 'Test', status: 'active' }, allocationRerun: true }),
    })

    render(<StatusControl deckId={1} currentStatus="draft" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('radio', { name: 'Set status to Active' }))

    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('reverts to previous status on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Server error' }),
    })

    render(<StatusControl deckId={1} currentStatus="active" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('radio', { name: 'Set status to Draft' }))

    await waitFor(() => {
      const activeRadio = screen.getByRole('radio', { name: 'Set status to Active' })
      expect(activeRadio).toHaveAttribute('aria-checked', 'true')
    })
  })

  it('does nothing when clicking the already-selected status', () => {
    render(<StatusControl deckId={1} currentStatus="active" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('radio', { name: 'Set status to Active' }))

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('has accessible radiogroup role', () => {
    render(<StatusControl deckId={1} currentStatus="active" />, { wrapper: createWrapper() })
    expect(screen.getByRole('radiogroup', { name: 'Deck status' })).toBeInTheDocument()
  })
})
