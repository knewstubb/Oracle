import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeckTile } from './DeckTile'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />
  },
}))

// Mock next/link to render a plain anchor
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

const defaultProps = {
  id: 42,
  name: 'Muldrotha Graveyard',
  commanderName: 'Muldrotha, the Gravetide',
  commanderScryfallId: 'abc12345-6789-0000-0000-000000000000',
  colourIdentity: ['B', 'U', 'G'],
  cardCount: 100,
}

describe('DeckTile', () => {
  it('renders commander image from Scryfall CDN', () => {
    renderWithProviders(<DeckTile {...defaultProps} />)
    const img = screen.getByRole('img', { name: 'Muldrotha, the Gravetide card art' })
    expect(img).toHaveAttribute(
      'src',
      'https://cards.scryfall.io/art_crop/front/a/b/abc12345-6789-0000-0000-000000000000.jpg'
    )
  })

  it('renders deck name as heading', () => {
    renderWithProviders(<DeckTile {...defaultProps} />)
    const heading = screen.getByRole('heading', { level: 3 })
    expect(heading).toHaveTextContent('Muldrotha Graveyard')
  })

  it('renders commander name as subtitle', () => {
    renderWithProviders(<DeckTile {...defaultProps} />)
    expect(screen.getByText('Muldrotha, the Gravetide')).toBeInTheDocument()
  })

  it('shows the list count against the target before the sleeved count arrives', () => {
    renderWithProviders(<DeckTile {...defaultProps} cardCount={55} />)
    expect(screen.getByText('55/100')).toBeInTheDocument()
  })

  it('shows "55/100 (14 sleeved)" for a Commander deck', () => {
    renderWithProviders(<DeckTile {...defaultProps} format="commander" cardCount={55} sleevedCount={14} />)
    expect(screen.getByText('55/100 (14 sleeved)')).toBeInTheDocument()
  })

  it('a Playable deck shows just the count, in green, with no sleeved bracket', () => {
    renderWithProviders(<DeckTile {...defaultProps} format="commander" cardCount={100} sleevedCount={100} status="playable" />)
    const count = screen.getByText('100/100')
    expect(count).toBeInTheDocument()
    expect(count).toHaveStyle({ color: 'var(--signal-success)' })
    expect(screen.queryByText(/sleeved/)).not.toBeInTheDocument()
  })

  it('shows "(0 sleeved)" when nothing is sleeved', () => {
    renderWithProviders(<DeckTile {...defaultProps} cardCount={55} sleevedCount={0} />)
    expect(screen.getByText('55/100 (0 sleeved)')).toBeInTheDocument()
  })

  it('uses the format target size', () => {
    renderWithProviders(<DeckTile {...defaultProps} format="standard" cardCount={50} sleevedCount={3} />)
    expect(screen.getByText('50/60 (3 sleeved)')).toBeInTheDocument()
  })

  it('reads "N cards (M sleeved)" when the format has no target size', () => {
    renderWithProviders(<DeckTile {...defaultProps} format="casual" cardCount={40} sleevedCount={7} />)
    expect(screen.getByText('40 cards (7 sleeved)')).toBeInTheDocument()
  })

  it('adds the sleeved count in place when the details arrive later', () => {
    const { rerender } = renderWithProviders(<DeckTile {...defaultProps} cardCount={55} />)
    const line = screen.getByText('55/100')
    rerender(
      <QueryClientProvider client={queryClient}>
        <DeckTile {...defaultProps} cardCount={55} sleevedCount={14} />
      </QueryClientProvider>
    )
    expect(screen.getByText('55/100 (14 sleeved)')).toBe(line)
  })

  it('renders colour identity bars with correct aria-label', () => {
    renderWithProviders(<DeckTile {...defaultProps} />)
    const bars = screen.getByRole('img', { name: 'Blue, Black, Green' })
    expect(bars).toBeInTheDocument()
  })

  it('links to /decks/[id]', () => {
    renderWithProviders(<DeckTile {...defaultProps} />)
    const link = screen.getByLabelText('Muldrotha Graveyard — Muldrotha, the Gravetide')
    expect(link).toHaveAttribute('href', '/decks/42')
  })

  it('has accessible aria-label with deck name and commander', () => {
    renderWithProviders(<DeckTile {...defaultProps} />)
    const link = screen.getByLabelText('Muldrotha Graveyard — Muldrotha, the Gravetide')
    expect(link).toHaveAttribute('aria-label', 'Muldrotha Graveyard — Muldrotha, the Gravetide')
  })

  it('has M3 elevation shadow and rounded-2xl on tile container', () => {
    const { container } = renderWithProviders(<DeckTile {...defaultProps} />)
    const link = screen.getByTestId('deck-tile')
    expect(link.className).toContain('rounded-2xl')
    expect(link.className).toContain('hover:-translate-y-1')
  })

  it('respects prefers-reduced-motion on tile container', () => {
    const { container } = renderWithProviders(<DeckTile {...defaultProps} />)
    const link = screen.getByTestId('deck-tile')
    expect(link.className).toContain('motion-reduce:transition-none')
    expect(link.className).toContain('motion-reduce:hover:translate-y-0')
  })

  it('handles empty colour identity (colourless)', () => {
    renderWithProviders(<DeckTile {...defaultProps} colourIdentity={[]} />)
    // No colour bars should render
    expect(screen.queryByRole('img', { name: /White|Blue|Black|Red|Green/ })).not.toBeInTheDocument()
  })

  it('shows the Brewing badge (purple flask) with its label and tooltip', () => {
    renderWithProviders(<DeckTile {...defaultProps} status="brewing" />)
    const badge = screen.getByLabelText('Brewing')
    expect(badge).toHaveAttribute('title', 'Brewing')
    expect(badge.querySelector('svg')).toHaveClass('lucide-flask-conical')
    expect(badge).toHaveStyle({ backgroundColor: '#8F51D5' })
  })
  it('shows the Assembling badge (construction icon, amber) with its label and tooltip', () => {
    renderWithProviders(<DeckTile {...defaultProps} status="assembling" />)
    const badge = screen.getByLabelText('Assembling')
    expect(badge).toHaveAttribute('title', 'Assembling')
    expect(badge.querySelector('svg')).toHaveClass('lucide-construction')
    expect(badge.style.backgroundColor).toBe('var(--signal-warning)')
  })
  it('shows the Playable badge (green tick) with its label and tooltip', () => {
    renderWithProviders(<DeckTile {...defaultProps} status="playable" />)
    const badge = screen.getByLabelText('Playable')
    expect(badge).toHaveAttribute('title', 'Playable')
    expect(badge.querySelector('svg')).toHaveClass('lucide-check')
    expect(badge.style.backgroundColor).toBe('var(--signal-success)')
  })
  it('shows exactly one status badge', () => {
    renderWithProviders(<DeckTile {...defaultProps} status="assembling" />)
    expect(screen.queryByLabelText('Brewing')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Playable')).not.toBeInTheDocument()
  })
  it('dims the tile unless it is Playable', () => {
    const brewing = renderWithProviders(<DeckTile {...defaultProps} status="brewing" />)
    expect(brewing.container.querySelector('[data-testid="deck-tile"]')!.className).toContain('opacity-80')
    brewing.unmount()
    const ready = renderWithProviders(<DeckTile {...defaultProps} status="playable" />)
    expect(ready.container.querySelector('[data-testid="deck-tile"]')!.className).not.toContain('opacity-80')
  })
  it('keeps the count text next to the badge', () => {
    renderWithProviders(<DeckTile {...defaultProps} status="assembling" cardCount={55} sleevedCount={14} />)
    expect(screen.getByText('55/100 (14 sleeved)')).toBeInTheDocument()
  })
})
