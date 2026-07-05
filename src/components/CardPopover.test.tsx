import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardPopover } from './CardPopover'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />
  },
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const mockCrossDeckResponse = {
  card_name: 'Sol Ring',
  deck_count: 2,
  decks: [
    { id: 1, name: 'Atraxa Superfriends', is_proxy: false },
    { id: 2, name: 'Muldrotha Graveyard', is_proxy: true },
  ],
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function renderPopover(props: Partial<React.ComponentProps<typeof CardPopover>> = {}) {
  return render(
    <CardPopover
      cardName="Sol Ring"
      scryfallId="abc12345-6789-0000-0000-000000000000"
      setCode="c21"
      tags=""
      {...props}
    >
      <span>Card trigger</span>
    </CardPopover>,
    { wrapper: createWrapper() }
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('CardPopover', () => {
  it('renders trigger children', () => {
    renderPopover()
    expect(screen.getByText('Card trigger')).toBeInTheDocument()
  })

  it('opens popover on click showing card image and name', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCrossDeckResponse),
    })

    renderPopover()
    fireEvent.click(screen.getByText('Card trigger'))

    expect(screen.getByRole('dialog', { name: 'Card details: Sol Ring' })).toBeInTheDocument()
    expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    expect(screen.getByText('C21')).toBeInTheDocument()
    expect(screen.getByAltText('Sol Ring full card')).toBeInTheDocument()
  })

  it('shows proxy badge when tags include proxy', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCrossDeckResponse),
    })

    renderPopover({ tags: 'Proxy,#e158ff' })
    fireEvent.click(screen.getByText('Card trigger'))

    expect(screen.getByText('Proxy')).toBeInTheDocument()
  })

  it('shows cross-deck list with clickable deck links', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCrossDeckResponse),
    })

    renderPopover()
    fireEvent.click(screen.getByText('Card trigger'))

    await waitFor(() => {
      expect(screen.getByText('In 2 decks:')).toBeInTheDocument()
    })

    const link1 = screen.getByText('Atraxa Superfriends')
    expect(link1.closest('a')).toHaveAttribute('href', '/decks/1')

    const link2 = screen.getByText('Muldrotha Graveyard')
    expect(link2.closest('a')).toHaveAttribute('href', '/decks/2')
  })

  it('shows (proxy) indicator for proxy decks in cross-deck list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCrossDeckResponse),
    })

    renderPopover()
    fireEvent.click(screen.getByText('Card trigger'))

    await waitFor(() => {
      expect(screen.getByText('(proxy)')).toBeInTheDocument()
    })
  })

  it('dismisses on Escape key', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCrossDeckResponse),
    })

    renderPopover()
    fireEvent.click(screen.getByText('Card trigger'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('dismisses on click outside', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCrossDeckResponse),
    })

    renderPopover()
    fireEvent.click(screen.getByText('Card trigger'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows error message when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    renderPopover()
    fireEvent.click(screen.getByText('Card trigger'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load card details.")
    })
  })

  it('has role="dialog" with correct aria-label', () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCrossDeckResponse),
    })

    renderPopover()
    fireEvent.click(screen.getByText('Card trigger'))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Card details: Sol Ring')
  })

  it('shows loading skeletons while fetching', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) // never resolves

    renderPopover()
    fireEvent.click(screen.getByText('Card trigger'))

    // Skeletons are rendered during loading
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })
})
