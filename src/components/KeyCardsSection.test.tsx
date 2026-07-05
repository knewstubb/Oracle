import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KeyCardsSection } from './KeyCardsSection'
import type { KeyCard } from '@/lib/rating-engine'

const mockKeyCards: KeyCard[] = [
  {
    cardName: 'Muldrotha, the Gravetide',
    reason: 'Commander that enables recursion of all permanent types from graveyard',
    priorityTier: 'commander',
  },
  {
    cardName: 'Animate Dead',
    reason: 'Key combo piece for infinite recursion loops',
    priorityTier: 'combo',
  },
  {
    cardName: 'Eternal Witness',
    reason: 'Multi-role card providing recursion and value across multiple categories',
    priorityTier: 'multi-category',
  },
  {
    cardName: 'Sakura-Tribe Elder',
    reason: 'Efficient ramp that synergizes with graveyard strategy',
    priorityTier: 'synergy',
  },
]

describe('KeyCardsSection', () => {
  it('renders numbered list items', () => {
    render(<KeyCardsSection keyCards={mockKeyCards} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('shows card names and reasons', () => {
    render(<KeyCardsSection keyCards={mockKeyCards} />)
    expect(screen.getByText('Muldrotha, the Gravetide')).toBeInTheDocument()
    expect(
      screen.getByText('Commander that enables recursion of all permanent types from graveyard')
    ).toBeInTheDocument()
    expect(screen.getByText('Animate Dead')).toBeInTheDocument()
    expect(
      screen.getByText('Key combo piece for infinite recursion loops')
    ).toBeInTheDocument()
  })

  it('shows tier badges', () => {
    render(<KeyCardsSection keyCards={mockKeyCards} />)
    expect(screen.getByText('Commander')).toBeInTheDocument()
    expect(screen.getByText('Combo')).toBeInTheDocument()
    expect(screen.getByText('Multi-Role')).toBeInTheDocument()
    expect(screen.getByText('Synergy')).toBeInTheDocument()
  })

  it('preserves order (commander first)', () => {
    render(<KeyCardsSection keyCards={mockKeyCards} />)
    const listItems = screen.getAllByRole('listitem')
    expect(listItems).toHaveLength(4)

    // Commander card should be first (number 1)
    expect(listItems[0]).toHaveTextContent('Muldrotha, the Gravetide')
    expect(listItems[0]).toHaveTextContent('Commander')

    // Combo card should be second
    expect(listItems[1]).toHaveTextContent('Animate Dead')
    expect(listItems[1]).toHaveTextContent('Combo')

    // Multi-category card should be third
    expect(listItems[2]).toHaveTextContent('Eternal Witness')

    // Synergy card should be last
    expect(listItems[3]).toHaveTextContent('Sakura-Tribe Elder')
  })
})
