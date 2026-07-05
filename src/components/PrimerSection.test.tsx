import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PrimerSection } from './PrimerSection'
import type { Primer } from '@/lib/rating-engine'

const mockPrimer: Primer = {
  coreStrategy:
    'Muldrotha enables repeatable value by replaying permanents from the graveyard each turn. The primary win condition is assembling Animate Dead loops with Gary for infinite drain.',
  mulliganPriorities: [
    'Keep hands with 3+ lands and a ramp spell',
    'Prioritize early self-mill enablers like Stitchers Supplier',
    'Sol Ring or other fast mana improves any hand',
  ],
  keyTips: [
    'Sequence Sakura-Tribe Elder before Muldrotha to replay it',
    'Hold Counterspell for graveyard hate like Rest in Peace',
    'Use Eternal Witness to rebuy non-permanent spells',
    'Deploy Spore Frog early as repeatable fog protection',
  ],
}

describe('PrimerSection', () => {
  it('renders "Core Strategy" heading and paragraph (p element)', () => {
    render(<PrimerSection primer={mockPrimer} />)
    expect(screen.getByText('Core Strategy')).toBeInTheDocument()

    // Core strategy should be rendered as a <p> element
    const coreStrategyText = screen.getByText(/Muldrotha enables repeatable value/)
    expect(coreStrategyText.tagName).toBe('P')
  })

  it('renders "Mulligan Priorities" heading and ul element', () => {
    render(<PrimerSection primer={mockPrimer} />)
    expect(screen.getByText('Mulligan Priorities')).toBeInTheDocument()

    // Each mulligan priority should be a list item
    const mulliganItems = screen.getAllByText(
      /Keep hands with|Prioritize early|Sol Ring or other/
    )
    expect(mulliganItems).toHaveLength(3)

    // Items should be in a <ul>
    const firstItem = screen.getByText('Keep hands with 3+ lands and a ramp spell')
    expect(firstItem.tagName).toBe('LI')
    expect(firstItem.parentElement?.tagName).toBe('UL')
  })

  it('renders "Key Tips" heading and ul element', () => {
    render(<PrimerSection primer={mockPrimer} />)
    expect(screen.getByText('Key Tips')).toBeInTheDocument()

    // Key tips should be list items
    const tipItem = screen.getByText(/Sequence Sakura-Tribe Elder/)
    expect(tipItem.tagName).toBe('LI')
    expect(tipItem.parentElement?.tagName).toBe('UL')
  })

  it('each list has the correct number of items', () => {
    render(<PrimerSection primer={mockPrimer} />)

    // There should be 3 mulligan priorities + 4 key tips = 7 total list items
    const allListItems = screen.getAllByRole('listitem')
    expect(allListItems).toHaveLength(7)

    // Verify counts by content
    expect(screen.getByText('Keep hands with 3+ lands and a ramp spell')).toBeInTheDocument()
    expect(screen.getByText('Prioritize early self-mill enablers like Stitchers Supplier')).toBeInTheDocument()
    expect(screen.getByText('Sol Ring or other fast mana improves any hand')).toBeInTheDocument()
    expect(screen.getByText('Sequence Sakura-Tribe Elder before Muldrotha to replay it')).toBeInTheDocument()
    expect(screen.getByText('Hold Counterspell for graveyard hate like Rest in Peace')).toBeInTheDocument()
    expect(screen.getByText('Use Eternal Witness to rebuy non-permanent spells')).toBeInTheDocument()
    expect(screen.getByText('Deploy Spore Frog early as repeatable fog protection')).toBeInTheDocument()
  })
})
