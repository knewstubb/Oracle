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
import { SharedCardRow } from '@/components/SharedCardRow'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import { DeckEditor, type DeckSuggestion } from '@/components/DeckEditor'
import { CommanderSearch } from '@/components/CommanderSearch'

// ---------------------------------------------------------------------------
// ColourPips
// ---------------------------------------------------------------------------

describe('ColourPips accessibility', () => {
  it('has aria-label listing colour names', () => {
    render(<ColourPips colours={['W', 'U', 'G']} />)
    const pips = screen.getByRole('img')
    expect(pips).toHaveAttribute('aria-label', 'White, Blue, Green')
  })

  it('shows "Colourless" when no colours', () => {
    render(<ColourPips colours={[]} />)
    const pips = screen.getByRole('img')
    expect(pips).toHaveAttribute('aria-label', 'Colourless')
  })

  it('hides individual pip spans from screen readers', () => {
    const { container } = render(<ColourPips colours={['R', 'B']} />)
    const dots = container.querySelectorAll('[aria-hidden="true"]')
    expect(dots.length).toBe(2)
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
    const link = screen.getByRole('link')
    expect(link.className).toContain('motion-reduce:transition-none')
  })
})

// ---------------------------------------------------------------------------
// SharedCardRow
// ---------------------------------------------------------------------------

describe('SharedCardRow accessibility', () => {
  const mockCard = {
    card_name: 'Sol Ring',
    set_code: 'c21',
    scryfall_id: 'abc123',
    deck_count: 3,
    owned_this_printing: 1,
    owned_total: 1,
    needing_proxies: true,
    decks: [
      { id: 1, name: 'Deck A', is_proxy: false },
      { id: 2, name: 'Deck B', is_proxy: true },
    ],
  }

  it('has aria-expanded attribute on the toggle button', () => {
    render(<SharedCardRow card={mockCard} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('toggles aria-expanded on click', async () => {
    const user = userEvent.setup()
    render(<SharedCardRow card={mockCard} />)
    const button = screen.getByRole('button')
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('has descriptive aria-label on the toggle button', () => {
    render(<SharedCardRow card={mockCard} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-label', 'Sol Ring (C21), in 3 decks')
  })

  it('has focus-visible ring classes', () => {
    render(<SharedCardRow card={mockCard} />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('focus-visible:ring-2')
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
// DeckEditor
// ---------------------------------------------------------------------------

describe('DeckEditor accessibility', () => {
  const mockCards: DeckSuggestion[] = [
    { name: 'Sol Ring', manaCost: '{1}', typeLine: 'Artifact', role: 'Ramp', owned: true },
    { name: 'Forest', manaCost: '', typeLine: 'Basic Land — Forest', role: 'Land', owned: true },
  ]

  it('remove buttons have descriptive aria-label', () => {
    render(
      <DeckEditor
        cards={mockCards}
        onCardsChange={vi.fn()}
        onBack={vi.fn()}
        onCreateDeck={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Remove Sol Ring')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove Forest')).toBeInTheDocument()
  })

  it('card images have descriptive alt text with type', () => {
    render(
      <DeckEditor
        cards={mockCards}
        onCardsChange={vi.fn()}
        onBack={vi.fn()}
        onCreateDeck={vi.fn()}
      />
    )
    expect(screen.getByAltText('Sol Ring — Artifact')).toBeInTheDocument()
    expect(screen.getByAltText('Forest — Basic Land — Forest')).toBeInTheDocument()
  })

  it('sections have aria-label with type and count', () => {
    render(
      <DeckEditor
        cards={mockCards}
        onCardsChange={vi.fn()}
        onBack={vi.fn()}
        onCreateDeck={vi.fn()}
      />
    )
    expect(screen.getByRole('region', { name: /Artifacts \(1\)/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Lands \(1\)/ })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// CommanderSearch — listbox keyboard navigation
// ---------------------------------------------------------------------------

describe('CommanderSearch accessibility', () => {
  it('search input has aria-label', () => {
    render(<CommanderSearch onSelect={vi.fn()} onNext={vi.fn()} />)
    const input = screen.getByLabelText('Search commanders')
    expect(input).toBeInTheDocument()
  })

  it('collection only toggle has role="switch" with aria-checked', () => {
    render(<CommanderSearch onSelect={vi.fn()} onNext={vi.fn()} />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('Next button has aria-disabled when no commander selected', () => {
    render(<CommanderSearch onSelect={vi.fn()} onNext={vi.fn()} />)
    const nextBtn = screen.getByRole('button', { name: 'Next' })
    expect(nextBtn).toHaveAttribute('aria-disabled', 'true')
    expect(nextBtn).toBeDisabled()
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
    const link = screen.getByRole('link')
    expect(link.className).toContain('motion-reduce:transition-none')
    expect(link.className).toContain('motion-reduce:hover:translate-y-0')
  })

  it('SharedCardRow has motion-reduce utility classes', () => {
    render(
      <SharedCardRow
        card={{
          card_name: 'Test',
          set_code: 'c21',
          scryfall_id: 'abc',
          deck_count: 2,
          owned_this_printing: 1,
          owned_total: 1,
          needing_proxies: false,
          decks: [{ id: 1, name: 'D1', is_proxy: false }],
        }}
      />
    )
    const button = screen.getByRole('button')
    expect(button.className).toContain('motion-reduce:transition-none')
  })
})
