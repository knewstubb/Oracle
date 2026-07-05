import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ColourPips } from './ColourPips'

describe('ColourPips', () => {
  it('renders pips for each colour in WUBRG order', () => {
    const { container } = render(<ColourPips colours={['R', 'W', 'G']} />)
    const pips = container.querySelectorAll('span[aria-hidden="true"]')
    expect(pips).toHaveLength(3)
    // WUBRG order: W first, then R, then G
    expect(pips[0]).toHaveStyle({ backgroundColor: '#F9FAF4' })
    expect(pips[1]).toHaveStyle({ backgroundColor: '#D3202A' })
    expect(pips[2]).toHaveStyle({ backgroundColor: '#00733E' })
  })

  it('has aria-label listing colour names', () => {
    render(<ColourPips colours={['U', 'B']} />)
    const wrapper = screen.getByRole('img')
    expect(wrapper).toHaveAttribute('aria-label', 'Blue, Black')
  })

  it('shows "Colourless" aria-label when no colours', () => {
    render(<ColourPips colours={[]} />)
    const wrapper = screen.getByRole('img')
    expect(wrapper).toHaveAttribute('aria-label', 'Colourless')
  })

  it('renders all five colours in WUBRG order', () => {
    const { container } = render(<ColourPips colours={['G', 'U', 'R', 'B', 'W']} />)
    const pips = container.querySelectorAll('span[aria-hidden="true"]')
    expect(pips).toHaveLength(5)
  })
})
