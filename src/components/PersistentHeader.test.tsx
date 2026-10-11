import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersistentHeader } from './PersistentHeader'

// Mock next/image to render a plain img tag for testing
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

const baseDeck = {
  id: 123,
  name: 'Yedora the Explorer',
  commander_name: 'Yedora, Grave Gardener',
  commander_scryfall_id: 'abc123-def456',
  colour_identity: 'G',
  card_count: 100,
  deck_type: null as string | null,
  bracket: '3' as string | null,
}

function renderHeader(props: React.ComponentProps<typeof PersistentHeader>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PersistentHeader {...props} />
    </QueryClientProvider>
  )
}

describe('PersistentHeader', () => {
  beforeEach(() => {
    // The header renders BuildSelector, which loads build data. Stub the
    // request so the test stays offline and the selector fails silently.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ currentBuildId: null, detectedBuild: null, availableBuilds: [] }),
        })
      )
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the deck name', () => {
    renderHeader({ deck: baseDeck, totalCards: 100, proxyCount: 27 })
    expect(screen.getByText('Yedora the Explorer')).toBeInTheDocument()
  })

  it('renders card count and proxy count in stats line', () => {
    renderHeader({ deck: baseDeck, totalCards: 100, proxyCount: 27 })
    expect(screen.getByText('100 cards · 27 proxies')).toBeInTheDocument()
    expect(screen.getByText('· Bracket 3')).toBeInTheDocument()
  })

  it('renders bracket number when present', () => {
    renderHeader({ deck: baseDeck, totalCards: 100, proxyCount: 0 })
    expect(screen.getByText('100 cards · 0 proxies')).toBeInTheDocument()
    expect(screen.getByText('· Bracket 3')).toBeInTheDocument()
  })

  it('omits bracket text when bracket is null', () => {
    const deckNoBracket = { ...baseDeck, bracket: null }
    renderHeader({ deck: deckNoBracket, totalCards: 100, proxyCount: 27 })
    expect(screen.getByText('100 cards · 27 proxies')).toBeInTheDocument()
    expect(screen.queryByText(/Bracket/)).not.toBeInTheDocument()
  })

  it('renders precon mod badge when deck_type is "Precon Mod"', () => {
    const preconDeck = { ...baseDeck, deck_type: 'Precon Mod' }
    renderHeader({ deck: preconDeck, totalCards: 100, proxyCount: 27 })
    const badge = screen.getByText('Precon mod')
    expect(badge).toBeInTheDocument()
    expect(badge.style.background).toBe('var(--signal-warning-bg)')
    expect(badge.style.color).toBe('var(--signal-warning)')
  })

  it('does not render precon mod badge when deck_type is null', () => {
    renderHeader({ deck: baseDeck, totalCards: 100, proxyCount: 27 })
    expect(screen.queryByText('Precon mod')).not.toBeInTheDocument()
  })

  it('does not render precon mod badge when deck_type is a different value', () => {
    const otherDeck = { ...baseDeck, deck_type: 'Custom' }
    renderHeader({ deck: otherDeck, totalCards: 100, proxyCount: 27 })
    expect(screen.queryByText('Precon mod')).not.toBeInTheDocument()
  })

  it('has sticky positioning with correct z-index', () => {
    const { container } = renderHeader({ deck: baseDeck, totalCards: 100, proxyCount: 27 })
    const header = container.firstElementChild as HTMLElement
    expect(header.className).toContain('sticky')
    expect(header.className).toContain('top-0')
    expect(header.className).toContain('z-30')
  })

  it('renders commander avatar using CardImage with artCrop', () => {
    renderHeader({ deck: baseDeck, totalCards: 100, proxyCount: 27 })
    const img = screen.getByAltText('Yedora, Grave Gardener avatar')
    expect(img).toBeInTheDocument()
  })
})
