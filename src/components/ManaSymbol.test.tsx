import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ManaSymbol } from './ManaSymbol'

describe('ManaSymbol', () => {
  it('renders the mana-font class with the token fill and a colour name', () => {
    render(<ManaSymbol colour="G" />)
    const el = screen.getByRole('img', { name: 'Green' })
    expect(el.className).toContain('ms ms-g ms-cost')
    expect(el.style.color).toBe('var(--mana-green)')
  })
  it('hides from assistive tech when the label is off', () => {
    const { container } = render(<ManaSymbol colour="C" label={false} />)
    expect(container.querySelector('i')).toHaveAttribute('aria-hidden', 'true')
  })
})
