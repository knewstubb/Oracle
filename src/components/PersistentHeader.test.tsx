import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PersistentHeader } from './PersistentHeader'

// Mock next/image to render a plain img tag for testing
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

const baseDeck = {
  id: 123,
  name: 'Yedora the Explorer',
  commander_name: 'Yedora, Grave Gardener',
  commander_scryfall_id: 'abc123-def456',
  colour_identity: 'G',
  card_count: 100,
  deck_type: null as string | null,
  bracket: '3' as string | null,
}

describe('PersistentHeader', () => {
  it('renders the deck name', () => {
    render(<PersistentHeader deck={baseDeck} totalCards={100} proxyCount={27} />)
    expect(screen.getByText('Yedora the Explorer')).toBeInTheDocument()
  })

  it('renders card count and proxy count in stats line', () => {
    render(<PersistentHeader deck={baseDeck} totalCards={100} proxyCount={27} />)
    expect(screen.getByText('100 cards · 27 proxies · Bracket 3')).toBeInTheDocument()
  })

  it('renders bracket number when present', () => {
    render(<PersistentHeader deck={baseDeck} totalCards={100} proxyCount={0} />)
    expect(screen.getByText('100 cards · 0 proxies · Bracket 3')).toBeInTheDocument()
  })

  it('omits bracket text when bracket is null', () => {
    const deckNoBracket = { ...baseDeck, bracket: null }
    render(<PersistentHeader deck={deckNoBracket} totalCards={100} proxyCount={27} />)
    expect(screen.getByText('100 cards · 27 proxies')).toBeInTheDocument()
  })

  it('renders the "Post-game debrief" button with Swords icon', () => {
    render(<PersistentHeader deck={baseDeck} totalCards={100} proxyCount={27} />)
    const btn = screen.getByRole('button', { name: /post-game debrief/i })
    expect(btn).toBeInTheDocument()
    // Verify teal styling
    expect(btn).toHaveStyle({ background: 'rgba(29,158,117,0.15)' })
    expect(btn).toHaveStyle({ color: '#1D9E75' })
  })

  it('renders "Open in Archidekt" link with correct href and target', () => {
    render(<PersistentHeader deck={baseDeck} totalCards={100} proxyCount={27} />)
    const link = screen.getByRole('link', { name: /open in archidekt/i })
    expect(link).toHaveAttribute('href', 'https://archidekt.com/decks/123')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders precon mod badge when deck_type is "Precon Mod"', () => {
    const preconDeck = { ...baseDeck, deck_type: 'Precon Mod' }
    render(<PersistentHeader deck={preconDeck} totalCards={100} proxyCount={27} />)
    const badge = screen.getByText('Precon mod')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveStyle({ background: 'rgba(239,159,39,0.15)' })
    expect(badge).toHaveStyle({ color: '#EF9F27' })
  })

  it('does not render precon mod badge when deck_type is null', () => {
    render(<PersistentHeader deck={baseDeck} totalCards={100} proxyCount={27} />)
    expect(screen.queryByText('Precon mod')).not.toBeInTheDocument()
  })

  it('does not render precon mod badge when deck_type is a different value', () => {
    const otherDeck = { ...baseDeck, deck_type: 'Custom' }
    render(<PersistentHeader deck={otherDeck} totalCards={100} proxyCount={27} />)
    expect(screen.queryByText('Precon mod')).not.toBeInTheDocument()
  })

  it('has sticky positioning with correct z-index', () => {
    const { container } = render(
      <PersistentHeader deck={baseDeck} totalCards={100} proxyCount={27} />
    )
    const header = container.firstElementChild as HTMLElement
    expect(header.className).toContain('sticky')
    expect(header.className).toContain('top-0')
    expect(header.className).toContain('z-30')
  })

  it('renders commander avatar using CardImage with artCrop', () => {
    render(<PersistentHeader deck={baseDeck} totalCards={100} proxyCount={27} />)
    const img = screen.getByAltText('Yedora, Grave Gardener avatar')
    expect(img).toBeInTheDocument()
  })
})
