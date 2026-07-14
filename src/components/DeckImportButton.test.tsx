import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeckImportButton } from './DeckImportButton'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('DeckImportButton', () => {
  let onPreviewSuccess: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onPreviewSuccess = vi.fn()
    vi.restoreAllMocks()
  })

  it('renders an "Import Deck" button', () => {
    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByRole('button', { name: /import deck/i })).toBeInTheDocument()
  })

  it('opens dialog when button is clicked', async () => {
    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, {
      wrapper: createWrapper(),
    })

    fireEvent.click(screen.getByRole('button', { name: /import deck/i }))

    await waitFor(() => {
      expect(screen.getByText(/Import a deck from a URL/i)).toBeInTheDocument()
    })
  })

  it('shows validation error for invalid URL', async () => {
    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, {
      wrapper: createWrapper(),
    })

    fireEvent.click(screen.getByRole('button', { name: /import deck/i }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/archidekt\.com\/decks/i)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/archidekt\.com\/decks/i)
    fireEvent.change(input, { target: { value: 'https://example.com/invalid' } })
    fireEvent.click(screen.getByRole('button', { name: /fetch deck/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/isn't supported/i)
    })
  })

  it('shows validation error for empty input', async () => {
    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, {
      wrapper: createWrapper(),
    })

    fireEvent.click(screen.getByRole('button', { name: /import deck/i }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/archidekt\.com\/decks/i)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/archidekt\.com\/decks/i)
    fireEvent.change(input, { target: { value: '   ' } })
    // The submit button should be disabled for empty input
    expect(screen.getByRole('button', { name: /fetch deck/i })).toBeDisabled()
  })

  it('calls onPreviewSuccess on successful fetch', async () => {
    const mockDeck = {
      name: 'Test Deck',
      platform: 'archidekt' as const,
      platformDeckId: '12345',
      sourceUrl: 'https://archidekt.com/decks/12345',
      commander: null,
      cards: [],
      cardCount: 0,
      colourIdentity: '',
    }
    const mockCardsByType = {
      groups: {
        Creature: [],
        Instant: [],
        Sorcery: [],
        Artifact: [],
        Enchantment: [],
        Land: [],
        Planeswalker: [],
        Battle: [],
        Other: [],
      },
      totalCount: 0,
    }

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ deck: mockDeck, cardsByType: mockCardsByType }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, {
      wrapper: createWrapper(),
    })

    fireEvent.click(screen.getByRole('button', { name: /import deck/i }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/archidekt\.com\/decks/i)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/archidekt\.com\/decks/i)
    fireEvent.change(input, { target: { value: 'https://archidekt.com/decks/12345' } })
    fireEvent.click(screen.getByRole('button', { name: /fetch deck/i }))

    await waitFor(() => {
      expect(onPreviewSuccess).toHaveBeenCalledWith(mockDeck, mockCardsByType)
    })
  })

  it('shows API error message on fetch failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Deck not found on Archidekt' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, {
      wrapper: createWrapper(),
    })

    fireEvent.click(screen.getByRole('button', { name: /import deck/i }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/archidekt\.com\/decks/i)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/archidekt\.com\/decks/i)
    fireEvent.change(input, { target: { value: 'https://archidekt.com/decks/99999' } })
    fireEvent.click(screen.getByRole('button', { name: /fetch deck/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Deck not found on Archidekt/i)
    })
  })
})
