import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConflictAlert } from './ConflictAlert'

describe('ConflictAlert', () => {
  it('renders the card name and affected deck name in the message', () => {
    render(
      <ConflictAlert affectedDeckName="World Breaker" cardName="Sol Ring" />
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    expect(screen.getByText('World Breaker')).toBeInTheDocument()
  })

  it('renders with role="alert" for accessibility', () => {
    render(
      <ConflictAlert affectedDeckName="Ice Queen" cardName="Rhystic Study" />
    )

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
  })

  it('displays the correct message format', () => {
    render(
      <ConflictAlert affectedDeckName="Arti-facts" cardName="Arcane Signet" />
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(
      'Adding Arcane Signet would move the original from Arti-facts, creating a proxy there.'
    )
  })

  it('renders the AlertTriangle icon with aria-hidden', () => {
    const { container } = render(
      <ConflictAlert affectedDeckName="Deck A" cardName="Card B" />
    )

    // lucide-react renders an SVG element
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies amber warning styling classes', () => {
    render(
      <ConflictAlert affectedDeckName="Deck A" cardName="Card B" />
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('border-amber-200', 'bg-amber-50')
  })
})
