import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeckImportButton } from './DeckImportButton'
import type { NormalizedDeck, CardsByType } from '@/lib/deck-normalizer'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: i,
        start: i * estimateSize(),
        end: (i + 1) * estimateSize(),
        size: estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
    measure: () => {},
  }),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('DeckImportButton', () => {
  let onPreviewSuccess: (deck: NormalizedDeck, cardsByType: CardsByType) => void

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
      expect(screen.getByRole('alert')).toHaveTextContent(/can't read that link/i)
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

  it('File tab uses the fixed modal size and ignores outside clicks', async () => {
    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: /import deck/i }))
    await waitFor(() => expect(screen.getByText(/Import a deck from a URL/i)).toBeInTheDocument())
    const content = () => document.querySelector('[data-slot="dialog-content"]')!
    expect(content().className).toContain('h-[min(46rem,calc(100dvh-4rem))]')
    for (const tab of ['Text list', 'Precon', 'URL']) {
      fireEvent.click(screen.getByRole('button', { name: tab }))
      expect(content().className).toContain('h-[min(46rem,calc(100dvh-4rem))]')
      expect(content().className).toContain('sm:max-w-3xl')
    }
    fireEvent.click(screen.getByRole('button', { name: 'File upload' }))
    await waitFor(() => expect(screen.getByLabelText('Choose file')).toBeInTheDocument())
    expect(content().className).toContain('h-[min(46rem,calc(100dvh-4rem))]')
    fireEvent.pointerDown(document.body)
    fireEvent.mouseDown(document.body)
    fireEvent.click(document.body)
    expect(screen.getByLabelText('Choose file')).toBeInTheDocument()
  })

  it('shows the deck icon, hides the tabs on the review list, and asks in-app before discarding', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const preview = {
      fileName: 'deck.txt',
      totalLines: 1,
      rows: [
        {
          sourceIndex: 1,
          sourceLines: [1],
          cardName: 'Sol Ring',
          setCode: 'c21',
          collectorNumber: '263',
          scryfallId: 'abc',
          oracleId: 'def',
          qty: 1,
          rowKey: 'abc|text',
          availableFinishes: ['nonfoil', 'foil'],
          copies: [{ index: 0, sourceLine: 1, file: {}, owner: {} }],
          isBasicLand: false,
        },
      ],
      skippedTokens: [],
      unmatched: [],
    }
    vi.spyOn(global, 'fetch').mockImplementation(async (input) =>
      new Response(JSON.stringify(String(input).includes('/ownership') ? { rows: [] } : preview), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: /import deck/i }))
    await waitFor(() => expect(document.querySelector('[data-import-icon="deck"]')).toBeInTheDocument())
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'File upload' }))
    const input = await screen.findByLabelText('Choose file')
    fireEvent.change(input, { target: { files: [new File(['1 Sol Ring'], 'deck.txt', { type: 'text/plain' })] } })
    // The deck loads first, then "What's this deck?" with the tabs still shown and File highlighted.
    await waitFor(() => expect(screen.getByRole('radio', { name: /I'm planning it/ })).toBeChecked())
    expect(screen.getByRole('button', { name: 'URL' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'File upload' }).getAttribute('style')).toContain('var(--accent-primary)')
    expect(screen.getByRole('button', { name: 'URL' }).getAttribute('style') ?? '').not.toContain('var(--accent-primary)')
    expect(screen.getByRole('heading', { name: 'Import deck' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.getByText('Sol Ring')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Import planned deck' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'URL' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Text list' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Sol Ring' }))
    // Planned decks have no Card origin dropdown; any edit makes the deck dirty.
    expect(screen.queryByRole('button', { name: /card origin for Sol Ring/i })).toBeNull()
    fireEvent.change(screen.getByLabelText(/^Copy 1 finish/), { target: { value: 'foil' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Discard edits?')).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('shows "What\'s this deck?" disabled on the URL tab before loading, and Fetch works without an intent', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}))
    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: /import deck/i }))
    fireEvent.change(await screen.findByPlaceholderText(/archidekt|moxfield|url/i), { target: { value: 'https://archidekt.com/decks/123' } })
    expect(screen.getByText("What's this deck?")).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled())
    expect(screen.getAllByText('Numbers appear once the deck has loaded')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /fetch deck/i }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect(screen.queryByText('Choose one to continue.')).toBeNull()
  })

  it('keeps the tabs (and the disabled choices) while a URL fetch runs', async () => {
    vi.spyOn(global, 'fetch').mockImplementationOnce(() => new Promise(() => {}))
    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: /import deck/i }))
    fireEvent.change(await screen.findByPlaceholderText(/archidekt|moxfield|url/i), { target: { value: 'https://archidekt.com/decks/123' } })
    fireEvent.click(screen.getByRole('button', { name: /fetch deck/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /fetching/i })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Text list' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'URL' })).toBeInTheDocument()
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled())
  })
  it('every tab has Cancel and Continue; Continue is disabled except on Text list with text; Cancel closes', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ precons: [], setup: false }), { status: 200 }))
    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: /import deck/i }))
    for (const tab of ['URL', 'Text list', 'Precon', 'File upload']) {
      fireEvent.click(await screen.findByRole('button', { name: tab }))
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Text list' }))
    fireEvent.change(screen.getByPlaceholderText(/1 Sol Ring/), { target: { value: '1 Sol Ring' } })
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument())
  })

  it('Fetch Deck sits inline beside the URL field', async () => {
    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: /import deck/i }))
    const input = await screen.findByPlaceholderText(/archidekt\.com\/decks/i)
    const fetchBtn = screen.getByRole('button', { name: /fetch deck/i })
    expect(input.parentElement).toBe(fetchBtn.parentElement)
  })

  it('Text list tab has no deck name field', async () => {
    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: /import deck/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Text list' }))
    expect(screen.queryByRole('button', { name: 'Paste text' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/deck name/i)).toBeNull()
    expect(screen.queryByPlaceholderText(/deck name/i)).toBeNull()
  })

  it('File tab shows no help cards', async () => {
    render(<DeckImportButton onPreviewSuccess={onPreviewSuccess} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: /import deck/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'File upload' }))
    await screen.findByLabelText('Choose file')
    expect(screen.queryByText('Export your list')).toBeNull()
    expect(screen.queryByText('What happens next')).toBeNull()
  })
})
