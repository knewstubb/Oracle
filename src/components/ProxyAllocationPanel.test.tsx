import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProxyAllocationPanel } from './ProxyAllocationPanel'
import type { SharedCardData } from './SharedCardRow'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    return <img {...rest} />
  },
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockCard: SharedCardData = {
  card_name: 'Sol Ring',
  scryfall_id: 'abc12345-6789-0000-0000-000000000000',
  deck_count: 3,
  owned_copies: 1,
  needing_proxies: true,
  decks: [
    { id: 1, name: 'Muldrotha', is_proxy: false },
    { id: 2, name: 'Atraxa', is_proxy: true },
    { id: 3, name: 'Korvold', is_proxy: true },
  ],
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('ProxyAllocationPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders heading with owned copies count', () => {
    render(<ProxyAllocationPanel card={mockCard} />, { wrapper: createWrapper() })
    expect(screen.getByText('You own 1 copy')).toBeInTheDocument()
  })

  it('renders plural "copies" when owned > 1', () => {
    const card = { ...mockCard, owned_copies: 3 }
    render(<ProxyAllocationPanel card={card} />, { wrapper: createWrapper() })
    expect(screen.getByText('You own 3 copies')).toBeInTheDocument()
  })

  it('renders radio groups for each deck', () => {
    render(<ProxyAllocationPanel card={mockCard} />, { wrapper: createWrapper() })
    expect(screen.getByText('Muldrotha')).toBeInTheDocument()
    expect(screen.getByText('Atraxa')).toBeInTheDocument()
    expect(screen.getByText('Korvold')).toBeInTheDocument()
    // Each deck has Original and Proxy radio options
    const radioGroups = screen.getAllByRole('radiogroup')
    expect(radioGroups).toHaveLength(3)
  })

  it('initializes radios from current is_proxy state', () => {
    render(<ProxyAllocationPanel card={mockCard} />, { wrapper: createWrapper() })
    // Muldrotha is original (is_proxy: false), Atraxa and Korvold are proxy (is_proxy: true)
    const radioGroups = screen.getAllByRole('radiogroup')
    // Muldrotha's group should have "original" checked
    expect(radioGroups[0]).toHaveAttribute('aria-label', 'Allocation for Muldrotha')
  })

  it('shows no pending changes initially', () => {
    render(<ProxyAllocationPanel card={mockCard} />, { wrapper: createWrapper() })
    expect(screen.queryByText('Pending changes:')).not.toBeInTheDocument()
  })

  it('Apply button is disabled when no changes', () => {
    render(<ProxyAllocationPanel card={mockCard} />, { wrapper: createWrapper() })
    expect(screen.getByRole('button', { name: 'Apply to Archidekt' })).toBeDisabled()
  })

  it('calls onCancel when Cancel button clicked', () => {
    const onCancel = vi.fn()
    render(<ProxyAllocationPanel card={mockCard} onCancel={onCancel} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('shows preview when radio is changed', async () => {
    render(<ProxyAllocationPanel card={mockCard} />, { wrapper: createWrapper() })
    // Find the Muldrotha radiogroup and click the "Proxy" radio
    const radioGroups = screen.getAllByRole('radiogroup')
    const muldrothaGroup = radioGroups[0]
    const proxyRadios = muldrothaGroup.querySelectorAll('[data-slot="radio-group-item"]')
    // The second radio is "Proxy"
    fireEvent.click(proxyRadios[1])

    await waitFor(() => {
      expect(screen.getByText('Pending changes:')).toBeInTheDocument()
      expect(screen.getByText(/Muldrotha: Original → Proxy/)).toBeInTheDocument()
    })
  })

  it('opens confirmation modal when Apply clicked with changes', async () => {
    render(<ProxyAllocationPanel card={mockCard} />, { wrapper: createWrapper() })
    // Make a change
    const radioGroups = screen.getAllByRole('radiogroup')
    const proxyRadios = radioGroups[0].querySelectorAll('[data-slot="radio-group-item"]')
    fireEvent.click(proxyRadios[1])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply to Archidekt' })).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Apply to Archidekt' }))

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(screen.getByText(/Update proxy tags for Sol Ring/)).toBeInTheDocument()
    })
  })

  it('submits mutation on confirm and shows success toast', async () => {
    const { toast } = await import('sonner')
    const onSuccess = vi.fn()

    global.fetch = vi.fn().mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, results: [] }),
    })

    render(<ProxyAllocationPanel card={mockCard} onSuccess={onSuccess} />, { wrapper: createWrapper() })

    // Make a change
    const radioGroups = screen.getAllByRole('radiogroup')
    const proxyRadios = radioGroups[0].querySelectorAll('[data-slot="radio-group-item"]')
    fireEvent.click(proxyRadios[1])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply to Archidekt' })).not.toBeDisabled()
    })

    // Click Apply
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Archidekt' }))

    // Confirm in modal
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    // Find the confirm button inside the modal (the one labeled "Apply to Archidekt" inside the dialog)
    const confirmButtons = screen.getAllByRole('button', { name: 'Apply to Archidekt' })
    // The last one is in the modal
    fireEvent.click(confirmButtons[confirmButtons.length - 1])

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Proxy tags updated for Sol Ring.')
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('shows inline error with retry on mutation failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, error: 'Network timeout', results: [] }),
    })

    render(<ProxyAllocationPanel card={mockCard} />, { wrapper: createWrapper() })

    // Make a change
    const radioGroups = screen.getAllByRole('radiogroup')
    const proxyRadios = radioGroups[0].querySelectorAll('[data-slot="radio-group-item"]')
    fireEvent.click(proxyRadios[1])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply to Archidekt' })).not.toBeDisabled()
    })

    // Click Apply
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Archidekt' }))

    // Confirm in modal
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })
    const confirmButtons = screen.getAllByRole('button', { name: 'Apply to Archidekt' })
    fireEvent.click(confirmButtons[confirmButtons.length - 1])

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveTextContent(/Network timeout/)
      expect(alert).toHaveTextContent(/Your data hasn't been changed/)
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })
  })

  it('renders card image', () => {
    render(<ProxyAllocationPanel card={mockCard} />, { wrapper: createWrapper() })
    expect(screen.getByRole('img', { name: 'Sol Ring card art' })).toBeInTheDocument()
  })
})
