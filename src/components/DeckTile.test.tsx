import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    render(<DeckTile {...defaultProps} />)
    const img = screen.getByRole('img', { name: 'Muldrotha, the Gravetide card art' })
    expect(img).toHaveAttribute(
      'src',
      'https://cards.scryfall.io/art_crop/front/a/b/abc12345-6789-0000-0000-000000000000.jpg'
    )
  })

  it('renders deck name as bold heading', () => {
    render(<DeckTile {...defaultProps} />)
    const heading = screen.getByText('Muldrotha Graveyard')
    expect(heading.tagName).toBe('H3')
    expect(heading.className).toContain('font-bold')
  })

  it('renders commander name as subtitle', () => {
    render(<DeckTile {...defaultProps} />)
    expect(screen.getByText('Muldrotha, the Gravetide')).toBeInTheDocument()
  })

  it('renders card count', () => {
    render(<DeckTile {...defaultProps} />)
    expect(screen.getByText('100 Cards')).toBeInTheDocument()
  })

  it('renders colour identity bars with correct aria-label', () => {
    render(<DeckTile {...defaultProps} />)
    const bars = screen.getByRole('img', { name: 'Blue, Black, Green' })
    expect(bars).toBeInTheDocument()
  })

  it('links to /decks/[id]', () => {
    render(<DeckTile {...defaultProps} />)
    const link = screen.getByLabelText('Muldrotha Graveyard — Muldrotha, the Gravetide')
    expect(link).toHaveAttribute('href', '/decks/42')
  })

  it('has accessible aria-label with deck name and commander', () => {
    render(<DeckTile {...defaultProps} />)
    const link = screen.getByLabelText('Muldrotha Graveyard — Muldrotha, the Gravetide')
    expect(link).toHaveAttribute('aria-label', 'Muldrotha Graveyard — Muldrotha, the Gravetide')
  })

  it('has M3 elevation shadow and rounded-2xl on tile container', () => {
    render(<DeckTile {...defaultProps} />)
    const container = screen.getByLabelText('Muldrotha Graveyard — Muldrotha, the Gravetide').closest('.group')!
    expect(container.className).toContain('rounded-2xl')
    expect(container.className).toContain('hover:-translate-y-1')
  })

  it('respects prefers-reduced-motion on tile container', () => {
    render(<DeckTile {...defaultProps} />)
    const container = screen.getByLabelText('Muldrotha Graveyard — Muldrotha, the Gravetide').closest('.group')!
    expect(container.className).toContain('motion-reduce:transition-none')
    expect(container.className).toContain('motion-reduce:hover:translate-y-0')
  })

  it('has focus-within ring styles for accessibility on tile container', () => {
    render(<DeckTile {...defaultProps} />)
    const container = screen.getByLabelText('Muldrotha Graveyard — Muldrotha, the Gravetide').closest('.group')!
    expect(container.className).toContain('focus-within:ring-2')
    expect(container.className).toContain('focus-within:ring-primary')
    expect(container.className).toContain('focus-within:ring-offset-2')
  })

  it('handles empty colour identity (colourless)', () => {
    render(<DeckTile {...defaultProps} colourIdentity={[]} />)
    // No colour bars should render
    expect(screen.queryByRole('img', { name: /White|Blue|Black|Red|Green/ })).not.toBeInTheDocument()
  })

  // New feature tests

  it('renders health pips for non-ok statuses', () => {
    render(<DeckTile {...defaultProps} healthStatus={['ok', 'warn', 'crit']} />)
    const pipsContainer = screen.getByRole('img', { name: /Deck health: 2 issues/ })
    expect(pipsContainer).toBeInTheDocument()
    // Should render 2 pip dots (warn + crit, filtering out ok)
    const pips = pipsContainer.querySelectorAll('.rounded-full')
    expect(pips).toHaveLength(2)
  })

  it('renders checkmark when all health statuses are ok', () => {
    render(<DeckTile {...defaultProps} healthStatus={['ok', 'ok', 'ok']} />)
    const pipsContainer = screen.getByRole('img', { name: /all categories healthy/ })
    expect(pipsContainer).toBeInTheDocument()
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('does not render health pips when isDraft is true', () => {
    render(<DeckTile {...defaultProps} healthStatus={['ok', 'warn']} isDraft />)
    expect(screen.queryByRole('img', { name: /Deck health/ })).not.toBeInTheDocument()
  })

  it('truncates health pips at 3 with overflow count', () => {
    render(<DeckTile {...defaultProps} healthStatus={['warn', 'crit', 'warn', 'crit', 'warn']} />)
    // 5 non-ok pips → show 3, truncate 2
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('renders proxy count when greater than 0', () => {
    render(<DeckTile {...defaultProps} proxyCount={27} />)
    expect(screen.getByText('27 proxies')).toBeInTheDocument()
  })

  it('does not render proxy count when 0', () => {
    render(<DeckTile {...defaultProps} proxyCount={0} />)
    expect(screen.queryByText(/prox/)).not.toBeInTheDocument()
  })

  it('does not render proxy count when undefined', () => {
    render(<DeckTile {...defaultProps} />)
    expect(screen.queryByText(/prox/)).not.toBeInTheDocument()
  })

  it('renders singular "proxy" for count of 1', () => {
    render(<DeckTile {...defaultProps} proxyCount={1} />)
    expect(screen.getByText('1 proxy')).toBeInTheDocument()
  })

  it('renders dashed border when isDraft is true', () => {
    render(<DeckTile {...defaultProps} isDraft />)
    const container = screen.getByLabelText('Muldrotha Graveyard — Muldrotha, the Gravetide').closest('.group')!
    expect(container.className).toContain('border-dashed')
    expect(container.className).toContain('border-[rgba(55,138,221,0.3)]')
  })

  it('renders Draft badge instead of card count when isDraft is true', () => {
    render(<DeckTile {...defaultProps} isDraft />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.queryByText('100 Cards')).not.toBeInTheDocument()
  })

  it('renders hover overlay with Post-game and Open buttons', () => {
    render(<DeckTile {...defaultProps} />)
    expect(screen.getByText('Post-game')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('Post-game button links to debrief page', () => {
    render(<DeckTile {...defaultProps} />)
    const postGameLink = screen.getByText('Post-game').closest('a')
    expect(postGameLink).toHaveAttribute('href', '/decks/42/debrief')
  })

  it('Open button links to deck detail page', () => {
    render(<DeckTile {...defaultProps} />)
    const openLink = screen.getByText('Open').closest('a')
    expect(openLink).toHaveAttribute('href', '/decks/42')
  })
})
