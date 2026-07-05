import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProxyBadge } from './ProxyBadge'

describe('ProxyBadge', () => {
  it('renders "Proxy" text', () => {
    render(<ProxyBadge />)
    expect(screen.getByText('Proxy')).toBeInTheDocument()
  })

  it('uses purple background color (#e158ff)', () => {
    render(<ProxyBadge />)
    const badge = screen.getByText('Proxy')
    expect(badge).toHaveStyle({ backgroundColor: '#e158ff' })
  })
})
