import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeckStats } from './DeckStats'
import type { DeckCard } from './CardGrid'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />
  },
}))

function makeCard(overrides: Partial<DeckCard> = {}): DeckCard {
  return {
    id: 1,
    deck_id: 1,
    card_name: 'Sol Ring',
    scryfall_id: 'abc12345',
    set_code: 'c21',
    quantity: 1,
    categories: 'Artifacts',
    tags: '',
    is_commander: false,
    ...overrides,
  }
}

const sampleCards: DeckCard[] = [
  makeCard({ id: 1, card_name: 'Sol Ring', categories: 'Artifacts', quantity: 1 }),
  makeCard({ id: 2, card_name: 'Llanowar Elves', categories: 'Creatures', quantity: 1 }),
  makeCard({ id: 3, card_name: 'Elvish Mystic', categories: 'Creatures', quantity: 1 }),
  makeCard({ id: 4, card_name: 'Counterspell', categories: 'Instants', quantity: 1, tags: 'Proxy' }),
  makeCard({ id: 5, card_name: 'Forest', categories: 'Lands', quantity: 4 }),
]

describe('DeckStats', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('displays total card count', () => {
    render(<DeckStats cards={sampleCards} />)
    // Total: 1 + 1 + 1 + 1 + 4 = 8
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('Total Cards')).toBeInTheDocument()
  })

  it('displays proxy count from tags', () => {
    render(<DeckStats cards={sampleCards} />)
    expect(screen.getByText('Proxies')).toBeInTheDocument()
    // Only Counterspell has "Proxy" tag — find the proxy count next to the label
    const proxiesLabel = screen.getByText('Proxies')
    const proxiesSection = proxiesLabel.closest('div')!
    const proxyValue = proxiesSection.querySelector('.text-proxy')!
    expect(proxyValue.textContent).toBe('1')
  })

  it('shows card count by type with horizontal bars', () => {
    render(<DeckStats cards={sampleCards} />)

    const typeList = screen.getByRole('list', { name: 'Card count by type' })
    expect(typeList).toBeInTheDocument()

    // Check type labels exist
    expect(screen.getByText('Lands')).toBeInTheDocument()
    expect(screen.getByText('Creatures')).toBeInTheDocument()
    expect(screen.getByText('Artifacts')).toBeInTheDocument()
    expect(screen.getByText('Instants')).toBeInTheDocument()
  })

  it('shows mana curve placeholder', () => {
    render(<DeckStats cards={sampleCards} />)
    expect(screen.getByText('Mana Curve')).toBeInTheDocument()
    expect(screen.getByText('Mana curve data not available yet.')).toBeInTheDocument()
  })

  it('collapses and expands sidebar', () => {
    render(<DeckStats cards={sampleCards} />)

    const toggleBtn = screen.getByRole('button', { name: 'Collapse stats sidebar' })
    expect(toggleBtn).toBeInTheDocument()

    fireEvent.click(toggleBtn)

    // After collapse, the expand button should appear
    expect(screen.getByRole('button', { name: 'Expand stats sidebar' })).toBeInTheDocument()
    // Stats content should be hidden
    expect(screen.queryByText('Total Cards')).not.toBeInTheDocument()
  })

  it('persists collapse state in localStorage', () => {
    render(<DeckStats cards={sampleCards} />)

    const toggleBtn = screen.getByRole('button', { name: 'Collapse stats sidebar' })
    fireEvent.click(toggleBtn)

    expect(localStorage.getItem('deck-stats-collapsed')).toBe('true')

    // Click expand
    const expandBtn = screen.getByRole('button', { name: 'Expand stats sidebar' })
    fireEvent.click(expandBtn)

    expect(localStorage.getItem('deck-stats-collapsed')).toBe('false')
  })

  it('reads initial collapse state from localStorage', () => {
    localStorage.setItem('deck-stats-collapsed', 'true')
    render(<DeckStats cards={sampleCards} />)

    // Should start collapsed
    expect(screen.getByRole('button', { name: 'Expand stats sidebar' })).toBeInTheDocument()
    expect(screen.queryByText('Total Cards')).not.toBeInTheDocument()
  })

  it('handles zero proxy count', () => {
    const cards = [makeCard({ id: 1, tags: '' })]
    render(<DeckStats cards={cards} />)
    const proxiesLabel = screen.getByText('Proxies')
    const proxiesSection = proxiesLabel.closest('div')!
    const proxyValue = proxiesSection.querySelector('.text-proxy')!
    expect(proxyValue.textContent).toBe('0')
  })
})
