import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CollectionValueBanner } from './CollectionValueBanner'

interface ValueResponse {
  totalMarketValue?: number
  totalPurchaseValue?: number
  gainLoss?: number
  cardCount?: number
  unpricedCardCount?: number
  topCards?: Array<{ cardName: string; copies: number; pricePerCopy: number | null; totalValue: number | null }>
}

function renderBanner(value: ValueResponse) {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(value) } as Response)
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CollectionValueBanner />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CollectionValueBanner', () => {
  it('shows the total and how many cards have no price yet', async () => {
    renderBanner({
      totalMarketValue: 412,
      totalPurchaseValue: 0,
      gainLoss: 0,
      cardCount: 25,
      unpricedCardCount: 20,
      topCards: [],
    })

    expect(await screen.findByText('$412.00')).toBeInTheDocument()
    expect(screen.getByText('(20 cards have no price yet)')).toBeInTheDocument()
  })

  it('labels the value as a Scryfall estimate', async () => {
    renderBanner({ totalMarketValue: 10, cardCount: 1, unpricedCardCount: 0, topCards: [] })
    expect(await screen.findByText(/Scryfall estimate/)).toBeInTheDocument()
  })

  it('shows a plain total with no note when every owned card has a known price', async () => {
    renderBanner({ totalMarketValue: 0, cardCount: 3, unpricedCardCount: 0, topCards: [] })

    expect(await screen.findByText('$0.00')).toBeInTheDocument()
    expect(screen.queryByText(/no price yet/)).not.toBeInTheDocument()
  })

  it('uses singular wording for one unpriced card', async () => {
    renderBanner({ totalMarketValue: 5, cardCount: 1, unpricedCardCount: 1, topCards: [] })
    expect(await screen.findByText('(1 card has no price yet)')).toBeInTheDocument()
  })

  it('shows an em dash for an unpriced most-valuable card', async () => {
    renderBanner({
      totalMarketValue: 0,
      cardCount: 1,
      unpricedCardCount: 1,
      topCards: [{ cardName: 'Mana Crypt', copies: 1, pricePerCopy: null, totalValue: null }],
    })
    expect(await screen.findByText('Mana Crypt · —')).toBeInTheDocument()
  })

  it('renders nothing when the collection has no cards', async () => {
    const { container } = renderBanner({
      totalMarketValue: 0,
      cardCount: 0,
      unpricedCardCount: 0,
      topCards: [],
    })

    // Let the query resolve, then confirm the banner stays absent.
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })
})
