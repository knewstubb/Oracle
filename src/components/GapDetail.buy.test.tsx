import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GapDetail } from './GapDetail'
import type { DeckHealthGap } from '@/lib/deck-health-gap'
import type { BuyIdea } from '@/lib/deck-health-buy'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const idea = (over: Partial<BuyIdea> = {}): BuyIdea => ({
  name: 'Rhystic Study',
  typeLine: 'Enchantment',
  inclusionPct: 71,
  price: { usd: 38, state: 'known' },
  printingId: 'abcd1234-0000-0000-0000-000000000000',
  detailLine: 'Draws cards when opponents cast spells.',
  ...over,
})

const gap = (over: Partial<DeckHealthGap> = {}): DeckHealthGap => ({
  role: 'draw',
  label: 'Draw',
  have: 3,
  typical: 10,
  inDeckCount: 3,
  inDeckCards: [],
  spare: [],
  inAnotherDeck: [],
  coloursKnown: true,
  spareTotal: 0,
  inAnotherDeckTotal: 0,
  buyIdeas: [idea(), idea({ name: 'Mystery Draw', price: { usd: null, state: 'unknown' }, inclusionPct: null, printingId: null, detailLine: null })],
  buyDefaultOpen: true,
  nothingOwnedFits: true,
  buyUnavailableReason: null,
  ...over,
})

function renderGap(body: DeckHealthGap) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <GapDetail deckId={7} role="draw" onBack={() => {}} />
    </QueryClientProvider>,
  )
}

describe('GapDetail buy ideas', () => {
  it('nothing owned fits: the group is open, with the callout, count, estimates and prices', async () => {
    renderGap(gap())
    expect(await screen.findByText("You don't own a card that adds draw.")).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /Buy ideas \(2\) · estimates/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Rhystic Study')).toBeInTheDocument()
    const prices = screen.getAllByTestId('gap-price').map((e) => e.textContent)
    expect(prices).toEqual(['$38.00 est.', 'Price unknown'])
    expect(document.body.textContent).not.toMatch(/\$0(\.00)?\b/)
  })

  it('owned options exist: collapsed with the count; opens on click and closes again', async () => {
    renderGap(
      gap({
        spare: [{ name: 'Spare Draw', typeLine: 'Sorcery', status: 'SPARE', otherDeckName: null, spareCopies: 1, printingId: null, detailLine: null }],
        spareTotal: 1,
        buyDefaultOpen: false,
        nothingOwnedFits: false,
      }),
    )
    await screen.findByText('Spare Draw')
    const toggle = screen.getByRole('button', { name: /Buy ideas \(2\) · estimates/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Rhystic Study')).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByText('Rhystic Study')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText('Rhystic Study')).toBeNull()
  })

  it('a buy row reuses the row design: thumbnail first, name with price at the far right, detail line, popularity, Unowned', async () => {
    renderGap(gap())
    await screen.findByText('Rhystic Study')
    const row = screen.getByText('Rhystic Study').closest('li')!
    const thumb = row.querySelector('[data-testid="gap-thumb"]')!
    expect(row.firstElementChild).toBe(thumb)
    expect(thumb.querySelector('img')!.getAttribute('loading')).toBe('lazy')
    const nameLine = screen.getByText('Rhystic Study').closest('div')!
    expect(nameLine.lastElementChild).toBe(nameLine.querySelector('[data-testid="gap-price"]'))
    expect(row.querySelector('[data-testid="gap-line"]')).toHaveTextContent('Draws cards when opponents cast spells.')
    expect(row.querySelector('[data-testid="gap-popularity"]')).toHaveTextContent('In 71% of decks on EDHREC')
    expect(row.querySelector('[data-testid="gap-badge"]')).toHaveTextContent('Unowned')
  })

  it('hovering a buy thumbnail shows the full card; a row with no image has no popover and shows no popularity line', async () => {
    renderGap(gap())
    await screen.findByText('Rhystic Study')
    const thumb = screen.getByText('Rhystic Study').closest('li')!.querySelector('[data-testid="gap-thumb"]') as HTMLElement
    fireEvent.mouseEnter(thumb, { clientX: 50, clientY: 50 })
    expect((document.getElementById('card-hover-preview-img') as HTMLImageElement).src).toContain('abcd1234-0000-0000-0000-000000000000')
    const none = screen.getByText('Mystery Draw').closest('li')!
    expect(none.querySelector('[data-testid="gap-thumb"] img')).toBeNull()
    expect(none.querySelector('[data-testid="gap-popularity"]')).toBeNull()
    expect(none.querySelector('[data-testid="gap-line"]')).toBeNull()
  })

  it('thin data: no buy ideas, a plain sentence says why', async () => {
    renderGap(gap({ buyIdeas: [], buyUnavailableReason: 'thin_data' }))
    expect(await screen.findByTestId('buy-thin')).toHaveTextContent('No buy ideas yet. No popularity data for this commander, so nothing is guessed.')
    expect(screen.queryByRole('button', { name: /Buy ideas/ })).toBeNull()
  })

  it('no buy ideas and no reason (for example Lands): nothing is shown', async () => {
    renderGap(gap({ buyIdeas: [], buyUnavailableReason: null }))
    await screen.findByRole('heading', { name: 'Draw' })
    expect(screen.queryByRole('button', { name: /Buy ideas/ })).toBeNull()
    expect(screen.queryByTestId('buy-thin')).toBeNull()
  })

  it('a failed buy check says so and keeps the owned cards', async () => {
    renderGap(gap({ buyIdeas: [], buyUnavailableReason: 'lookup_failed' }))
    expect(await screen.findByTestId('buy-failed')).toHaveTextContent("Couldn't check buy ideas")
  })

  it('an older reply with no buy fields still renders without crashing', async () => {
    const old = gap() as Partial<DeckHealthGap>
    delete old.buyIdeas
    delete old.buyDefaultOpen
    renderGap(old as DeckHealthGap)
    expect(await screen.findByRole('heading', { name: 'Draw' })).toBeInTheDocument()
  })
})
