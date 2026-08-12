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
    const heading = screen.getByText('Muldrotha Graveyard')
    expect(heading.tagName).toBe('H3')
  })

  it('renders commander name as subtitle', () => {
    renderWithProviders(<DeckTile {...defaultProps} />)
    expect(screen.getByText('Muldrotha, the Gravetide')).toBeInTheDocument()
  })

  it('renders card count', () => {
    renderWithProviders(<DeckTile {...defaultProps} />)
    expect(screen.getByText('100/100 cards')).toBeInTheDocument()
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
    const link = container.querySelector('a')!
    expect(link.className).toContain('rounded-2xl')
    expect(link.className).toContain('hover:-translate-y-1')
  })

  it('respects prefers-reduced-motion on tile container', () => {
    const { container } = renderWithProviders(<DeckTile {...defaultProps} />)
    const link = container.querySelector('a')!
    expect(link.className).toContain('motion-reduce:transition-none')
    expect(link.className).toContain('motion-reduce:hover:translate-y-0')
  })

  it('handles empty colour identity (colourless)', () => {
    renderWithProviders(<DeckTile {...defaultProps} colourIdentity={[]} />)
    // No colour bars should render
    expect(screen.queryByRole('img', { name: /White|Blue|Black|Red|Green/ })).not.toBeInTheDocument()
  })

  it('applies opacity when inactive', () => {
    const { container } = renderWithProviders(<DeckTile {...defaultProps} isActive={false} />)
    const link = container.querySelector('a')!
    expect(link.className).toContain('opacity-80')
  })

  it('applies green border when active and ready', () => {
    const { container } = renderWithProviders(
      <DeckTile {...defaultProps} isActive={true} completeness={{ resolved: 100, total: 100 }} />
    )
    const link = container.querySelector('a')!
    expect(link.style.border).toContain('var(--accent-primary)')
  })
})
