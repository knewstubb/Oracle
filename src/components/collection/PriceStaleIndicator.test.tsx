import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
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

describe('PriceStaleIndicator refresh (D-042)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('refreshes Scryfall prices (not the removed Card Kingdom route)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, updated: 4, failed: 0, total: 4 }),
      } as Response)
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<PriceStaleIndicator isPriceStale={true} lastPriceRefresh={null} />)
    await userEvent.click(screen.getByRole('button', { name: /Refresh Prices/i }))

    expect(fetchMock).toHaveBeenCalledWith('/api/collection/refresh-prices', { method: 'POST' })
    expect(fetchMock).not.toHaveBeenCalledWith('/api/collection/prices/refresh', expect.anything())
    expect(await screen.findByText(/Prices updated — 4 Scryfall estimates refreshed/)).toBeInTheDocument()
  })

  it('reports failures truthfully instead of claiming success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: false, updated: 8, failed: 2, total: 10 }),
        } as Response)
      )
    )

    render(<PriceStaleIndicator isPriceStale={true} lastPriceRefresh={null} />)
    await userEvent.click(screen.getByRole('button', { name: /Refresh Prices/i }))

    expect(await screen.findByText(/Updated 8 of 10 prices — 2 could not be priced/)).toBeInTheDocument()
  })

  it('does not claim success when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response))
    )

    render(<PriceStaleIndicator isPriceStale={true} lastPriceRefresh={null} />)
    await userEvent.click(screen.getByRole('button', { name: /Refresh Prices/i }))

    expect(await screen.findByText(/Could not refresh prices/)).toBeInTheDocument()
  })
})
