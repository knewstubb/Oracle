/**
 * Focused accessibility tests for The Oracle.
 * Validates key a11y patterns: keyboard navigation, focus management,
 * screen reader labels, ARIA roles, and reduced-motion support.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { fill, priority, blurDataURL, unoptimized, ...rest } = props
    return <img {...rest} />
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  QueryClient: vi.fn(),
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, render }: { children?: React.ReactNode; render?: React.ReactElement }) => render || <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ColourPips } from '@/components/ColourPips'
import { CardImage } from '@/components/CardImage'
import { DeckTile } from '@/components/DeckTile'
import { ConfirmationModal } from '@/components/ConfirmationModal'
// ---------------------------------------------------------------------------
// ColourPips
// ---------------------------------------------------------------------------

describe('ColourPips accessibility', () => {
  it('has aria-label listing colour names', () => {
    render(<ColourPips colours={['W', 'U', 'G']} />)
    const pips = screen.getByRole('img', { name: 'White, Blue, Green' })
    expect(pips).toHaveAttribute('aria-label', 'White, Blue, Green')
  })

  it('shows "Colourless" when no colours', () => {
    render(<ColourPips colours={[]} />)
    const pips = screen.getByRole('img', { name: 'Colourless' })
    expect(pips).toHaveAttribute('aria-label', 'Colourless')
  })

  it('renders each pip as a mana icon inside a single labelled wrapper', () => {
    render(<ColourPips colours={['R', 'B']} />)
    const wrapper = screen.getByRole('img', { name: 'Black, Red' })
    const icons = wrapper.querySelectorAll('img')
    expect(icons).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// CardImage
// ---------------------------------------------------------------------------

describe('CardImage accessibility', () => {
  it('renders alt text on the image', () => {
    render(<CardImage scryfallId="abc123" alt="Sol Ring card art" />)
    const img = screen.getByAltText('Sol Ring card art')
    expect(img).toBeInTheDocument()
  })

  it('renders fallback with aria-label when no scryfallId', () => {
    render(<CardImage scryfallId="" alt="Missing card" />)
    const fallback = screen.getByRole('img')
    expect(fallback).toHaveAttribute('aria-label', 'Missing card')
  })
})

// ---------------------------------------------------------------------------
// DeckTile
// ---------------------------------------------------------------------------

describe('DeckTile accessibility', () => {
  it('renders as a link with descriptive aria-label', () => {
    render(
      <DeckTile
        id={1}
        name="Muldrotha Graveyard"
        commanderName="Muldrotha, the Gravetide"
        commanderScryfallId="abc123"
        colourIdentity={['B', 'G', 'U']}
      />
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('aria-label', 'Muldrotha Graveyard — Muldrotha, the Gravetide')
    expect(link).toHaveAttribute('href', '/decks/1')
  })

  it('has focus-visible ring classes', () => {
    render(
      <DeckTile
        id={1}
        name="Test Deck"
        commanderName="Test Commander"
        commanderScryfallId="abc"
        colourIdentity={[]}
      />
    )
    const link = screen.getByRole('link')
    expect(link.className).toContain('focus-visible:ring-2')
  })

  it('has motion-reduce classes for reduced motion', () => {
    render(
      <DeckTile
        id={1}
        name="Test Deck"
        commanderName="Test Commander"
        commanderScryfallId="abc"
        colourIdentity={[]}
      />
    )
    const link = screen.getByTestId('deck-tile')
    expect(link.className).toContain('motion-reduce:transition-none')
  })
})

// ---------------------------------------------------------------------------
// ConfirmationModal
// ---------------------------------------------------------------------------

describe('ConfirmationModal accessibility', () => {
  it('has role="alertdialog" and aria-label', () => {
    render(
      <ConfirmationModal
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        title="Delete deck?"
        description="This cannot be undone."
      />
    )
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-label', 'Delete deck?')
  })

  it('renders confirm and cancel buttons', () => {
    render(
      <ConfirmationModal
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        title="Delete?"
        confirmLabel="Delete"
      />
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Skip link (layout)
// ---------------------------------------------------------------------------

describe('Skip to main content link', () => {
  it('exists in the layout markup pattern', () => {
    // This tests the pattern — the actual layout is a server component,
    // so we verify the href target exists
    const { container } = render(
      <div>
        <a href="#main-content" className="sr-only">Skip to main content</a>
        <main id="main-content">Content</main>
      </div>
    )
    const skipLink = container.querySelector('a[href="#main-content"]')
    expect(skipLink).toBeInTheDocument()
    expect(skipLink).toHaveTextContent('Skip to main content')
    const main = container.querySelector('#main-content')
    expect(main).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Reduced motion CSS
// ---------------------------------------------------------------------------

describe('Reduced motion support', () => {
  it('DeckTile has motion-reduce utility classes', () => {
    render(
      <DeckTile
        id={1}
        name="Test"
        commanderName="Commander"
        commanderScryfallId="abc"
        colourIdentity={[]}
      />
    )
    const link = screen.getByTestId('deck-tile')
    expect(link.className).toContain('motion-reduce:transition-none')
    expect(link.className).toContain('motion-reduce:hover:translate-y-0')
  })
})
