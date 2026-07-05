import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PriceStaleIndicator } from './PriceStaleIndicator'

describe('PriceStaleIndicator', () => {
  it('renders nothing when isPriceStale is false', () => {
    const { container } = render(
      <PriceStaleIndicator isPriceStale={false} lastPriceRefresh="2024-06-15T03:00:00Z" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the amber banner when isPriceStale is true', () => {
    render(
      <PriceStaleIndicator isPriceStale={true} lastPriceRefresh="2024-06-15T03:00:00Z" />
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/Pricing may be outdated/)).toBeInTheDocument()
  })

  it('displays the last refresh timestamp in readable format', () => {
    render(
      <PriceStaleIndicator isPriceStale={true} lastPriceRefresh="2024-06-15T03:00:00Z" />
    )
    // Should contain "Jun 15 at" with a time
    expect(screen.getByText(/Last refreshed:/)).toBeInTheDocument()
    expect(screen.getByText(/Jun 15 at/)).toBeInTheDocument()
  })

  it('renders without timestamp when lastPriceRefresh is null', () => {
    render(
      <PriceStaleIndicator isPriceStale={true} lastPriceRefresh={null} />
    )
    expect(screen.getByText(/Pricing may be outdated/)).toBeInTheDocument()
    expect(screen.queryByText(/Last refreshed:/)).not.toBeInTheDocument()
  })

  it('handles invalid timestamp gracefully', () => {
    render(
      <PriceStaleIndicator isPriceStale={true} lastPriceRefresh="not-a-date" />
    )
    expect(screen.getByText(/Pricing may be outdated/)).toBeInTheDocument()
    expect(screen.getByText(/Unknown/)).toBeInTheDocument()
  })

  it('has proper accessibility attributes', () => {
    render(
      <PriceStaleIndicator isPriceStale={true} lastPriceRefresh="2024-06-15T03:00:00Z" />
    )
    const banner = screen.getByRole('status')
    expect(banner).toHaveAttribute('aria-label', 'Price data warning')
  })
})
