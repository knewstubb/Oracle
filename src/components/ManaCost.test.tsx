import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ManaCost } from './ManaCost'

describe('ManaCost', () => {
  it('renders the mana cost string', () => {
    render(<ManaCost cost="{2}{U}{B}" />)
    expect(screen.getByText('{2}{U}{B}')).toBeInTheDocument()
  })

  it('has monospace font class', () => {
    render(<ManaCost cost="{1}" />)
    const el = screen.getByText('{1}')
    expect(el.className).toContain('font-mono')
  })

  it('has accessible label', () => {
    render(<ManaCost cost="{3}{G}" />)
    expect(screen.getByLabelText('Mana cost: {3}{G}')).toBeInTheDocument()
  })

  it('renders nothing when cost is empty', () => {
    const { container } = render(<ManaCost cost="" />)
    expect(container.innerHTML).toBe('')
  })
})
