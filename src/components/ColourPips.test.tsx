import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ColourPips } from './ColourPips'

describe('ColourPips', () => {
  it('renders a mana icon for each colour in WUBRG order', () => {
    const { container } = render(<ColourPips colours={['R', 'W', 'G']} />)
    const icons = container.querySelectorAll('img')
    expect(icons).toHaveLength(3)
    // WUBRG order: W first, then R, then G
    expect(icons[0]).toHaveAttribute('alt', 'W mana')
    expect(icons[1]).toHaveAttribute('alt', 'R mana')
    expect(icons[2]).toHaveAttribute('alt', 'G mana')
    expect(icons[0]).toHaveAttribute('src', 'https://svgs.scryfall.io/card-symbols/W.svg')
  })

  it('has aria-label listing colour names', () => {
    render(<ColourPips colours={['U', 'B']} />)
    const wrapper = screen.getByRole('img', { name: 'Blue, Black' })
    expect(wrapper).toHaveAttribute('aria-label', 'Blue, Black')
  })

  it('shows "Colourless" aria-label when no colours', () => {
    render(<ColourPips colours={[]} />)
    const wrapper = screen.getByRole('img', { name: 'Colourless' })
    expect(wrapper).toHaveAttribute('aria-label', 'Colourless')
  })

  it('renders all five colours in WUBRG order', () => {
    const { container } = render(<ColourPips colours={['G', 'U', 'R', 'B', 'W']} />)
    const icons = container.querySelectorAll('img')
    expect(icons).toHaveLength(5)
    expect(Array.from(icons).map((icon) => icon.getAttribute('alt'))).toEqual([
      'W mana',
      'U mana',
      'B mana',
      'R mana',
      'G mana',
    ])
  })
})
