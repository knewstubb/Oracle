import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function makeCard(overrides: Partial<DeckCard> = {}): DeckCard {
  return {
    id: 1,
    deck_id: 1,
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

const sampleCards: DeckCard[] = [
  makeCard({ id: 1, card_name: 'Sol Ring', categories: 'Artifacts', set_code: 'c21' }),
  makeCard({ id: 2, card_name: 'Llanowar Elves', categories: 'Creatures', set_code: 'dom' }),
  makeCard({ id: 3, card_name: 'Counterspell', categories: 'Instants', set_code: '2xm' }),
  makeCard({ id: 4, card_name: 'Elvish Mystic', categories: 'Creatures', set_code: 'm14' }),
  makeCard({ id: 5, card_name: 'Forest', categories: 'Lands', set_code: 'und' }),
]

describe('CardGrid', () => {
  it('groups cards by type with group headers showing count', () => {
    render(<CardGrid cards={sampleCards} />, { wrapper: createWrapper() })

    expect(screen.getByText('Creatures (2)')).toBeInTheDocument()
    expect(screen.getByText('Instants (1)')).toBeInTheDocument()
    expect(screen.getByText('Artifacts (1)')).toBeInTheDocument()
    expect(screen.getByText('Lands (1)')).toBeInTheDocument()
  })

  it('renders card images with correct alt text including set code', () => {
    render(<CardGrid cards={sampleCards} />, { wrapper: createWrapper() })

    expect(screen.getByAltText('Sol Ring — C21')).toBeInTheDocument()
    expect(screen.getByAltText('Llanowar Elves — DOM')).toBeInTheDocument()
    expect(screen.getByAltText('Counterspell — 2XM')).toBeInTheDocument()
  })

  it('orders groups by standard MTG type order', () => {
    render(<CardGrid cards={sampleCards} />, { wrapper: createWrapper() })

    const sections = screen.getAllByRole('region')
    const labels = sections.map((s) => s.getAttribute('aria-label'))

    // Creatures before Instants before Artifacts before Lands
    const creaturesIdx = labels.findIndex((l) => l?.startsWith('Creatures'))
    const instantsIdx = labels.findIndex((l) => l?.startsWith('Instants'))
    const artifactsIdx = labels.findIndex((l) => l?.startsWith('Artifacts'))
    const landsIdx = labels.findIndex((l) => l?.startsWith('Lands'))

    expect(creaturesIdx).toBeLessThan(instantsIdx)
    expect(instantsIdx).toBeLessThan(artifactsIdx)
    expect(artifactsIdx).toBeLessThan(landsIdx)
  })

  it('renders loading skeleton when isLoading is true', () => {
    render(<CardGrid cards={[]} isLoading />)

    const loadingList = screen.getByRole('list', { name: 'Loading cards' })
    expect(loadingList).toBeInTheDocument()
  })

  it('has hover animation classes for scale and shadow', () => {
    render(<CardGrid cards={[makeCard()]} />, { wrapper: createWrapper() })

    const listItems = screen.getAllByRole('listitem')
    const cardItem = listItems[0]
    expect(cardItem.className).toContain('hover:scale-[1.02]')
    expect(cardItem.className).toContain('hover:shadow-lg')
  })

  it('respects prefers-reduced-motion', () => {
    render(<CardGrid cards={[makeCard()]} />, { wrapper: createWrapper() })

    const listItems = screen.getAllByRole('listitem')
    const cardItem = listItems[0]
    expect(cardItem.className).toContain('motion-reduce:transition-none')
    expect(cardItem.className).toContain('motion-reduce:hover:scale-100')
  })

  it('sums quantity for group header count', () => {
    const cards = [
      makeCard({ id: 1, card_name: 'Sol Ring', categories: 'Artifacts', quantity: 1 }),
      makeCard({ id: 2, card_name: 'Mana Crypt', categories: 'Artifacts', quantity: 2 }),
    ]
    render(<CardGrid cards={cards} />, { wrapper: createWrapper() })

    expect(screen.getByText('Artifacts (3)')).toBeInTheDocument()
  })

  it('handles cards with no categories gracefully', () => {
    const cards = [makeCard({ id: 1, categories: '' })]
    render(<CardGrid cards={cards} />, { wrapper: createWrapper() })

    expect(screen.getByText('Other (1)')).toBeInTheDocument()
  })
})
