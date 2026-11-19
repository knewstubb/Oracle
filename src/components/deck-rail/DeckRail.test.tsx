import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeckRail, type DeckRailProps } from './DeckRail'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const HEALTH = {
  verdict: { headline: 'Ramp is short', subline: '', usingGeneralGuide: false },
  strategy: { state: 'not_set', text: '' },
  sourceLine: 'EDHREC average deck, 12,431 decks',
  checkState: 'full', unclassifiedCount: 0, typeCounts: [], typeCountsLabel: '', computedAt: '2026-11-19T10:00:00Z',
  roles: [
    { role: 'ramp', label: 'Ramp', have: 18, typical: 15, targetSource: 'edhrec_average', state: 'ok', text: '' },
    { role: 'draw', label: 'Draw', have: 8, typical: 10, targetSource: 'edhrec_average', state: 'light', text: '' },
  ],
}
const STATUSES = { cards: [], counts: { total: 100, original: 80, proxy: 5, available: 3, claimed: 10, unowned: 2, generic_land: 0 } }
let health: () => unknown
let statuses: () => Promise<unknown>
beforeEach(() => {
  health = () => json(200, HEALTH)
  statuses = async () => json(200, STATUSES)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/health')) return health()
    if (url.endsWith('/card-statuses')) return statuses()
    return json(404, {})
  }))
})
afterEach(() => vi.unstubAllGlobals())

const yedora = (over: Partial<DeckRailProps> = {}): DeckRailProps => ({
  deck: { id: 7, name: 'Yedora, the Explorer', commander_scryfall_id: 'abc', colour_identity: 'G', deck_type: null, salt_score: 1.2 },
  commanderNames: ['Yedora, Grave Gardener'],
  cards: [
    { card_name: 'Llanowar Elves', mana_cost: '{G}', type_line: 'Creature — Elf', quantity: 1 },
    { card_name: 'Mystery', mana_cost: null, type_line: 'Creature', quantity: 1 },
    { card_name: 'Forest', mana_cost: null, type_line: 'Basic Land — Forest', quantity: 36 },
  ],
  totalCards: 102,
  deckSize: 100,
  totalValue: 131.98,
  strategySlot: <div data-testid="strategy-slot">Strategy block</div>,
  ...over,
})
const renderRail = (props: DeckRailProps) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DeckRail {...props} /></QueryClientProvider>)

describe('DeckRail', () => {
  it('shows every section in spec order', async () => {
    renderRail(yedora())
    const aside = screen.getByRole('complementary', { name: 'Deck summary' })
    expect(screen.getByRole('heading', { level: 1, name: 'Yedora, the Explorer' })).toBeInTheDocument()
    const headings = within(aside).getAllByRole('heading').map((h) => h.textContent)
    expect(headings).toEqual(['Yedora, the Explorer', 'Commander', 'Cards', 'Deck health', 'Mana curve', 'Colour needs against sources'])
    const slot = screen.getByTestId('strategy-slot')
    expect(screen.getByRole('heading', { name: 'Commander' }).compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(slot.compareDocumentPosition(screen.getByRole('heading', { name: 'Cards' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(await screen.findByText('Commander · Green')).toBeInTheDocument()
    expect(screen.getByText('$131.98')).toBeInTheDocument()
  })

  it('shows 102 / 100 and "2 over" with a word', () => {
    renderRail(yedora())
    expect(screen.getByTestId('rail-count')).toHaveTextContent('102 / 100')
    expect(screen.getByText('2 over')).toBeInTheDocument()
  })

  it('shows no over text at 100', () => {
    renderRail(yedora({ totalCards: 100 }))
    expect(screen.getByTestId('rail-count')).toHaveTextContent('100 / 100')
    expect(screen.queryByText(/over/)).toBeNull()
  })

  it('says Checking… while statuses load, never zeros', async () => {
    let release: (v: unknown) => void = () => {}
    statuses = () => new Promise((r) => { release = r })
    renderRail(yedora())
    const section = screen.getByRole('heading', { name: 'Cards' }).closest('section')!
    expect(within(section).getByText('Checking…')).toBeInTheDocument()
    expect(within(section).queryByText('Original')).toBeNull()
    release(json(200, STATUSES))
    expect(await within(section).findByText('Original')).toBeInTheDocument()
    expect(within(section).getByText('In other decks')).toBeInTheDocument()
    expect(within(section).getByText('85 in deck')).toBeInTheDocument()
  })

  it("says Couldn't check with Try again when statuses fail", async () => {
    statuses = async () => json(500, {})
    renderRail(yedora())
    expect(await screen.findByText("Couldn't check", { selector: 'span' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0)
  })

  it('shows health as have / target with Met or Short and the source note', async () => {
    renderRail(yedora())
    const ramp = await screen.findByRole('button', { name: /^Ramp\s*18/ })
    expect(ramp).toHaveTextContent('18 / 15')
    expect(ramp).toHaveTextContent('Met')
    expect(screen.getByRole('button', { name: /^Draw\s*8/ })).toHaveTextContent('Short')
    expect(screen.getByText('EDHREC average deck, 12,431 decks')).toBeInTheDocument()
  })

  it('opens the existing health details from a row', async () => {
    const user = userEvent.setup()
    renderRail(yedora())
    await user.click(await screen.findByRole('button', { name: /^Draw\s*8/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('prints every curve value in a text alternative and names cards without a cost', () => {
    renderRail(yedora())
    const chart = screen.getByRole('img', { name: /Mana curve/ })
    expect(chart).toHaveAccessibleName('Mana curve. cost 0: 0, cost 1: 1, cost 2: 0, cost 3: 0, cost 4: 0, cost 5: 0, cost 6: 0, cost 7+: 0.')
    expect(screen.getByText('1 card has no cost on file')).toBeInTheDocument()
  })

  it('shows symbols and sources per colour', () => {
    renderRail(yedora())
    expect(screen.getByText('36 of 36')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('Counts basic lands and well-known dual lands only.')).toBeInTheDocument()
  })

  it('says Colourless deck when there is no colour identity', () => {
    renderRail(yedora({ deck: { ...yedora().deck, colour_identity: '' } }))
    expect(screen.getByText('Colourless deck')).toBeInTheDocument()
  })

  it('shows a Choose a commander slot when none is chosen, and the rest still works', async () => {
    renderRail(yedora({ commanderNames: [], deck: { ...yedora().deck, commander_scryfall_id: null } }))
    expect(screen.getByText('Choose a commander')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mana curve' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Original')).toBeInTheDocument())
  })

  it('shows only the art crop of the commander, and both arts for a partner pair', () => {
    const { unmount } = renderRail(yedora())
    const img = screen.getByAltText('Yedora, Grave Gardener card art') as HTMLImageElement
    expect(img.src).toContain('/art_crop/front/a/b/abc.jpg')
    expect(img.src).not.toContain('/normal/')
    expect(img.className).toMatch(/\brounded-lg\b/)
    expect(img.parentElement!.parentElement!.className).toMatch(/\brounded-lg\b/)
    unmount()
    renderRail(yedora({ commanderNames: ['Tymna', 'Thrasios'], secondCommanderScryfallId: 'xyz' }))
    expect((screen.getByAltText('Tymna card art') as HTMLImageElement).src).toContain('/art_crop/front/a/b/abc.jpg')
    expect((screen.getByAltText('Thrasios card art') as HTMLImageElement).src).toContain('/art_crop/front/x/y/xyz.jpg')
  })
  it('falls back to the No image box when the art fails to load', () => {
    renderRail(yedora())
    fireEvent.error(screen.getByAltText('Yedora, Grave Gardener card art'))
    expect(screen.getByRole('img', { name: 'Yedora, Grave Gardener card art' })).toHaveTextContent('No image')
    expect(screen.getByRole('img', { name: 'Yedora, Grave Gardener card art' }).className).toMatch(/\brounded-lg\b/)
  })
  it('toggles the narrow-layout summary button', async () => {
    const user = userEvent.setup()
    renderRail(yedora())
    const toggle = screen.getByRole('button', { name: /Show deck summary/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: /Hide deck summary/ })).toHaveAttribute('aria-expanded', 'true')
  })
})
