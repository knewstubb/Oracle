import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeaknessSection } from './WeaknessSection'
import type { Weakness } from '@/lib/rating-engine'

const mockWeaknesses: Weakness[] = [
  {
    description: 'Heavy graveyard dependency with few protection cards',
    severity: 'Critical',
    hateCards: ['Rest in Peace', 'Leyline of the Void', 'Bojuka Bog'],
  },
  {
    description: 'Commander is expensive and deck is slow without fast mana',
    severity: 'Moderate',
    hateCards: ['Null Rod'],
  },
  {
    description: 'Vulnerable to flyers without dedicated removal',
    severity: 'Minor',
    hateCards: [],
  },
]

describe('WeaknessSection', () => {
  it('empty state renders "No weaknesses identified"', () => {
    render(<WeaknessSection weaknesses={[]} />)
    expect(screen.getByText('No weaknesses identified')).toBeInTheDocument()
  })

  it('groups weaknesses by severity', () => {
    render(<WeaknessSection weaknesses={mockWeaknesses} />)

    // Should render the Critical, Moderate, and Minor groups
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByText('Moderate')).toBeInTheDocument()
    expect(screen.getByText('Minor')).toBeInTheDocument()
  })

  it('shows severity icons and labels', () => {
    render(<WeaknessSection weaknesses={mockWeaknesses} />)

    // Icons are rendered with aria-hidden
    expect(screen.getByText('⚠️')).toBeInTheDocument()
    expect(screen.getByText('⚡')).toBeInTheDocument()
    expect(screen.getByText('ℹ️')).toBeInTheDocument()

    // Labels are in badge elements
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByText('Moderate')).toBeInTheDocument()
    expect(screen.getByText('Minor')).toBeInTheDocument()
  })

  it('shows hate cards as badges', () => {
    render(<WeaknessSection weaknesses={mockWeaknesses} />)

    expect(screen.getByText('Rest in Peace')).toBeInTheDocument()
    expect(screen.getByText('Leyline of the Void')).toBeInTheDocument()
    expect(screen.getByText('Bojuka Bog')).toBeInTheDocument()
    expect(screen.getByText('Null Rod')).toBeInTheDocument()
  })

  it('Critical appears before Moderate before Minor', () => {
    render(<WeaknessSection weaknesses={mockWeaknesses} />)

    const descriptions = screen.getAllByRole('listitem')
    // Critical weakness is first
    expect(descriptions[0]).toHaveTextContent('Heavy graveyard dependency')
    // Moderate weakness is second
    expect(descriptions[1]).toHaveTextContent('Commander is expensive')
    // Minor weakness is last
    expect(descriptions[2]).toHaveTextContent('Vulnerable to flyers')
  })
})
