import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardGrid, type DeckCard } from './CardGrid'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />
  },
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

function makeCard(overrides: Partial<DeckCard> = {}): DeckCard {
  return {
    id: 1,
    deck_id: 42,
    card_name: 'Sol Ring',
    scryfall_id: 'abc12345-6789-0000-0000-000000000000',
    set_code: 'c21',
    quantity: 1,
    categories: 'Artifacts',
    tags: '',
    is_commander: false,
    ...overrides,
  }
}

describe('Dead Weight UI — CardGrid', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Overlay on flagged cards', () => {
    it('renders dead weight badge overlay for flagged cards', () => {
      const cards = [
        makeCard({
          id: 1,
          card_name: 'Rampant Growth',
          categories: 'Ramp',
          dead_weight_flag: 'redundant',
          dead_weight_reason: 'Lowest synergy in oversized Ramp category',
        }),
      ]

      render(<CardGrid cards={cards} deckId={42} />, {
        wrapper: createWrapper(),
      })

      const badge = screen.getByText('Redundant')
      expect(badge).toBeInTheDocument()
      expect(badge.className).toContain('bg-amber-100')
    })

    it('renders off_strategy badge with red styling on CardGrid', () => {
      const cards = [
        makeCard({
          id: 2,
          card_name: 'Fog',
          categories: 'Instants',
          dead_weight_flag: 'off_strategy',
          dead_weight_reason: 'Low synergy, no combo role',
        }),
      ]

      render(<CardGrid cards={cards} deckId={42} />, {
        wrapper: createWrapper(),
      })

      const badge = screen.getByText('Off Strategy')
      expect(badge).toBeInTheDocument()
      expect(badge.className).toContain('bg-red-100')
      expect(badge.className).toContain('text-red-800')
    })

    it('renders purple badge for bracket_mismatch on CardGrid', () => {
      const cards = [
        makeCard({
          id: 3,
          card_name: 'Mana Crypt',
          categories: 'Artifacts',
          dead_weight_flag: 'bracket_mismatch',
          dead_weight_reason: 'Exceeds declared bracket',
        }),
      ]

      render(<CardGrid cards={cards} deckId={42} />, {
        wrapper: createWrapper(),
      })

      const badge = screen.getByText('Bracket')
      expect(badge).toBeInTheDocument()
      expect(badge.className).toContain('bg-purple-100')
    })

    it('renders orange badge for format_violation on CardGrid', () => {
      const cards = [
        makeCard({
          id: 4,
          card_name: 'Rhystic Study',
          categories: 'Enchantments',
          dead_weight_flag: 'format_violation',
          dead_weight_reason: 'Rare card violates restriction',
        }),
      ]

      render(<CardGrid cards={cards} deckId={42} />, {
        wrapper: createWrapper(),
      })

      const badge = screen.getByText('Format')
      expect(badge).toBeInTheDocument()
      expect(badge.className).toContain('bg-orange-100')
    })

    it('does not render overlay on cards without dead_weight_flag', () => {
      const cards = [
        makeCard({
          id: 5,
          card_name: 'Sol Ring',
          categories: 'Artifacts',
          dead_weight_flag: null,
        }),
      ]

      render(<CardGrid cards={cards} deckId={42} />, {
        wrapper: createWrapper(),
      })

      expect(screen.queryByText('Redundant')).not.toBeInTheDocument()
      expect(screen.queryByText('Off Strategy')).not.toBeInTheDocument()
      expect(screen.queryByText('Bracket')).not.toBeInTheDocument()
      expect(screen.queryByText('Format')).not.toBeInTheDocument()
    })
  })

  describe('CardGrid popover and dismiss', () => {
    it('clicking badge shows popover with reason and dismiss button', async () => {
      const cards = [
        makeCard({
          id: 1,
          card_name: 'Rampant Growth',
          categories: 'Ramp',
          dead_weight_flag: 'off_strategy',
          dead_weight_reason: 'Synergy below 30% and not in any combo',
        }),
      ]

      render(<CardGrid cards={cards} deckId={42} />, {
        wrapper: createWrapper(),
      })

      const badge = screen.getByText('Off Strategy')
      fireEvent.click(badge)

      await waitFor(() => {
        expect(
          screen.getByText('Synergy below 30% and not in any combo')
        ).toBeInTheDocument()
      })

      expect(
        screen.getByRole('button', { name: /Dismiss/i })
      ).toBeInTheDocument()
    })

    it('dismiss calls API and removes indicator', async () => {
      const cards = [
        makeCard({
          id: 1,
          card_name: 'Fog',
          categories: 'Instants',
          dead_weight_flag: 'off_strategy',
          dead_weight_reason: 'Low synergy',
        }),
      ]

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      render(<CardGrid cards={cards} deckId={42} />, {
        wrapper: createWrapper(),
      })

      // Open popover
      const badge = screen.getByText('Off Strategy')
      fireEvent.click(badge)

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Dismiss/i })
        ).toBeInTheDocument()
      })

      // Click dismiss
      fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/decks/42/dead-weight/dismiss',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_name: 'Fog' }),
          })
        )
      })
    })
  })
})
