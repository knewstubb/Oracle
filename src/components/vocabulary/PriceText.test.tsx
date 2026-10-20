import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { PriceText } from './PriceText'

describe('PriceText', () => {
  it('renders known price formatted as $X.XX', () => {
    render(<PriceText amount={12.4} />)
    expect(screen.getByText('$12.40')).toBeInTheDocument()
  })

  it('renders est. prefix for advisor prices', () => {
    render(<PriceText amount={12.4} estimate />)
    expect(screen.getByText('est. $12.40')).toBeInTheDocument()
  })

  it('renders "Price unknown" in detail mode', () => {
    render(<PriceText amount={null} />)
    expect(screen.getByText('Price unknown')).toBeInTheDocument()
  })

  it('renders em-dash with accessible label in dense mode', () => {
    render(<PriceText amount={null} dense />)
    const price = screen.getByLabelText('Price unknown')
    expect(price).toHaveTextContent('—')
  })

  it('never renders $0.00 for null', () => {
    render(<PriceText amount={null} />)
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
  })
})
