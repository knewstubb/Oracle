import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ManaCost } from './ManaCost'

describe('ManaCost', () => {
  it('renders a mana-font icon for each symbol', () => {
    const { container } = render(<ManaCost cost="{2}{U}{B}" />)
    const icons = container.querySelectorAll('i')
    expect(icons).toHaveLength(3)
    expect(icons[0]).toHaveClass('ms', 'ms-2', 'ms-cost')
    expect(icons[1]).toHaveClass('ms', 'ms-u', 'ms-cost')
    expect(icons[2]).toHaveClass('ms', 'ms-b', 'ms-cost')
  })

  it('uses the mana-font cost class', () => {
    const { container } = render(<ManaCost cost="{1}" />)
    const el = container.querySelector('i')
    expect(el?.className).toContain('ms-cost')
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
