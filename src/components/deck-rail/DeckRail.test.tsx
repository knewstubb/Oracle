import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeckRail, type DeckRailProps } from './DeckRail'
import { buildDeckHealth } from '@/lib/deck-health'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
// Real-shaped numbers for Yedora, the Explorer (audit section g), built by the shared health code.
const HEALTH = buildDeckHealth([
  { cardName: 'Forest', quantity: 37, typeLine: 'Basic Land — Forest', oracleText: null, inMainDeck: true },
  ...Array.from({ length: 18 }, (_, i) => ({ cardName: `Rock ${i}`, quantity: 1, typeLine: 'Artifact', oracleText: '{T}: Add {G}.', inMainDeck: true })),
  ...Array.from({ length: 6 }, (_, i) => ({ cardName: `Brain ${i}`, quantity: 1, typeLine: 'Sorcery', oracleText: 'Draw two cards.', inMainDeck: true })),
  ...Array.from({ length: 6 }, (_, i) => ({ cardName: `Kill ${i}`, quantity: 1, typeLine: 'Instant', oracleText: 'Destroy target creature.', inMainDeck: true })),
  ...Array.from({ length: 34 }, (_, i) => ({ cardName: `Beater ${i}`, quantity: 1, typeLine: 'Creature — Elf', oracleText: 'Trample', inMainDeck: true })),
])
const STATUSES = {
  cards: [{ cardName: 'Sol Ring', allocationStatus: 'unowned' }, { cardName: 'Mana Crypt', allocationStatus: 'unowned' }],
  counts: { total: 100, size: 100, sleeved: 85, original: 80, proxy: 5, available: 3, claimed: 10, unowned: 2, generic_land: 0, generic_unsleeved: 0 },
}
let health: () => unknown
let statuses: () => Promise<unknown>
let legality: () => unknown
beforeEach(() => {
  health = () => json(200, HEALTH)
  statuses = async () => json(200, STATUSES)
  legality = () => json(200, { format: 'commander', isLegal: true, issues: [] })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/health')) return health()
    if (url.endsWith('/card-statuses')) return statuses()
    if (url.endsWith('/legality')) return legality()
    return json(404, {})
  }))
})
afterEach(() => vi.unstubAllGlobals())

const yedora = (over: Partial<DeckRailProps> = {}): DeckRailProps => ({
  deck: { id: 7, name: 'Yedora, the Explorer', commander_scryfall_id: 'abc', colour_identity: 'G', deck_type: null },
  commanders: [{ name: 'Yedora, Grave Gardener', colourIdentity: 'G' }],
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
    expect(headings).toEqual(['Yedora, the Explorer', 'Command zone', 'Cards', 'Deck health', 'Mana curve', 'Colour needs against sources'])
    const slot = screen.getByTestId('strategy-slot')
    expect(screen.getByRole('heading', { name: 'Command zone' }).compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(slot.compareDocumentPosition(screen.getByRole('heading', { name: 'Cards' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Green' })).toBeInTheDocument()
    expect(screen.queryByText(/Commander · /)).toBeNull()
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
    release(json(200, STATUSES))
    await waitFor(() => expect(within(section).queryByText('Checking…')).toBeNull())
    // The old five ownership rows are replaced by one legend; the old words are gone.
    for (const gone of ['Available', 'Generic', 'Claimed', '85 in deck']) expect(within(section).queryByText(gone)).toBeNull()
    expect(within(section).getByText('Open')).toBeInTheDocument()
    expect(within(section).queryByText(/in deck$/)).toBeNull()
  })

  it("says Couldn't check with Try again when statuses fail", async () => {
    statuses = async () => json(500, {})
    renderRail(yedora())
    expect(await screen.findByText("Couldn't check", { selector: 'span' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0)
  })

  it('shows six health rows with Light, Ok or Heavy, a plain Game Plan total, and the notes', async () => {
    renderRail(yedora())
    const rows = await screen.findByTestId('health-rows')
    const items = within(rows).getAllByRole('button')
    expect(items.map((b) => b.getAttribute('data-kind'))).toEqual(['lands', 'ramp', 'card_advantage', 'targeted_removal', 'board_wipes', 'game_plan'])
    const row = (name: RegExp) => screen.getByRole('button', { name })
    expect(row(/^Lands: 37 cards, ok/)).toHaveTextContent('Ok')
    expect(row(/^Ramp: 18 cards, heavy, 6 above/)).toHaveTextContent('Heavy')
    expect(row(/^Ramp: 18 cards/)).toHaveTextContent('Range 10 to 12 · 6 above')
    expect(row(/^Card Advantage: 6 cards, light, 4 below/)).toHaveTextContent('Light')
    expect(row(/^Targeted Removal: 6 cards, light/)).toHaveTextContent('Range 10 to 12 · 4 below')
    expect(row(/^Board Wipes \/ Mass Disruption: 0 cards, light, 3 below/)).toHaveTextContent('Range 3 to 6 · 3 below')
    const gp = row(/^Game Plan & Win Conditions: 34 cards\. A total, no range and no verdict/)
    expect(gp).toHaveTextContent('Total')
    expect(gp).toHaveTextContent('No range. Everything not counted above.')
    expect(gp).not.toHaveTextContent(/Light|Ok|Heavy/)
    expect(screen.getByRole('button', { name: /1 of 5 in range/ })).toBeInTheDocument()
    expect(screen.getByText('Mana sources 55: 37 lands, 18 ramp cards. An estimate.')).toBeInTheDocument()
    expect(screen.getByText('Ranges are the Command Zone template. Select a row for details.')).toBeInTheDocument()
    expect(screen.queryByText(/Well covered|short|Met\b/i)).toBeNull()
  })
  it('shows the six rows even at 0 cards', async () => {
    health = () => json(200, buildDeckHealth([]))
    renderRail(yedora())
    const rows = await screen.findByTestId('health-rows')
    expect(within(rows).getAllByRole('button')).toHaveLength(6)
    expect(screen.getByRole('button', { name: /^Board Wipes \/ Mass Disruption: 0 cards, light/ })).toBeInTheDocument()
  })
  it('shows the double-faced line and the uncategorised and overlap notes only when they apply', async () => {
    health = () =>
      json(
        200,
        buildDeckHealth([
          { cardName: 'Forest', quantity: 36, typeLine: 'Basic Land — Forest', oracleText: null, inMainDeck: true },
          { cardName: 'Smash // Sanctuary', quantity: 2, typeLine: 'Sorcery // Land', oracleText: 'Draw a card.', inMainDeck: true },
          { cardName: 'Ghost', quantity: 1, typeLine: 'Creature', oracleText: null, inMainDeck: true },
          { cardName: 'Damn', quantity: 1, typeLine: 'Sorcery', oracleText: 'Destroy target creature. Overload {2}{W}{W}', inMainDeck: true },
        ]),
      )
    renderRail(yedora())
    const lands = await screen.findByRole('button', { name: /^Lands: 36 cards/ })
    expect(lands).toHaveTextContent('+ 2 double-faced')
    expect(screen.getByText(/Mana sources 38: 36 lands, 2 double-faced/)).toBeInTheDocument()
    expect(screen.getByText('1 card has no card text yet, so Oracle could not place it. It is counted in Game Plan & Win Conditions.')).toBeInTheDocument()
    expect(screen.getByText(/1 card counts in more than one row, so the rows add to/)).toBeInTheDocument()
  })
  it('opens the details panel from a row: range, source, first six cards, "and N more", the reference, and back to the overview', async () => {
    const user = userEvent.setup()
    renderRail(yedora())
    await user.click(await screen.findByRole('button', { name: /^Ramp: 18 cards/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Ramp' })).toBeInTheDocument()
    expect(within(dialog).getByText('You have 18 cards, 6 above the maximum of 12.')).toBeInTheDocument()
    expect(within(dialog).getByText('Range: 10 to 12')).toBeInTheDocument()
    expect(within(dialog).getByText('Default. The Command Zone template.')).toBeInTheDocument()
    expect(within(dialog).getByText('and 12 more')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Deck health' }))
    expect(within(dialog).getByRole('heading', { name: 'Deck health' })).toBeInTheDocument()
    expect(within(dialog).getAllByRole('button', { name: /Open details\.$/ })).toHaveLength(6)
    expect(within(dialog).getByText('For reference only: the average EDHREC deck for this commander')).toBeInTheDocument()
  })
  it('a Light row opens the existing "cards that fill it" list inside its details', async () => {
    const user = userEvent.setup()
    renderRail(yedora())
    await user.click(await screen.findByRole('button', { name: /^Card Advantage: 6 cards/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('region', { name: 'Cards that could fill it' })).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes('/health/gap?role=draw'))).toBe(true)
  })
  it('the Game Plan row opens a total with the quiet template note and no range', async () => {
    const user = userEvent.setup()
    renderRail(yedora())
    await user.click(await screen.findByRole('button', { name: /^Game Plan & Win Conditions: 34 cards/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/It is a total, so it has no range and no verdict/)).toBeInTheDocument()
    expect(within(dialog).getByText('The Command Zone template suggests about 25 to 30 here. That is a guide only.')).toBeInTheDocument()
    expect(within(dialog).queryByText(/^Range:/)).toBeNull()
  })
  it('Escape closes the panel and focus returns to the row that opened it', async () => {
    const user = userEvent.setup()
    renderRail(yedora())
    const lands = await screen.findByRole('button', { name: /^Lands: 37 cards/ })
    await user.click(lands)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(lands).toHaveFocus())
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
    renderRail(yedora({ commanders: [], deck: { ...yedora().deck, commander_scryfall_id: null } }))
    expect(screen.getByText('Choose a commander')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mana curve' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Checking…')).toBeNull())
  })

  it('shows only the art crop of the commander, and both arts for a partner pair', () => {
    const { unmount } = renderRail(yedora())
    const img = screen.getByAltText('Yedora, Grave Gardener card art') as HTMLImageElement
    expect(img.src).toContain('/art_crop/front/a/b/abc.jpg')
    expect(img.src).not.toContain('/normal/')
    // Full-width header art: no rounding of its own, the card clips the top corners.
    expect(img.className).not.toMatch(/\brounded/)
    const card = screen.getByTestId('rail-card')
    expect(card.className).toMatch(/\boverflow-hidden\b/)
    expect(card.className).toMatch(/\brounded-lg\b/)
    expect(screen.getByTestId('rail-art').parentElement).toBe(card)
    unmount()
    renderRail(yedora({ commanders: [{ name: 'Tymna', colourIdentity: 'WB', role: null }, { name: 'Thrasios', colourIdentity: 'GU', role: 'partner' }], secondCommanderScryfallId: 'xyz' }))
    expect((screen.getByAltText('Tymna card art') as HTMLImageElement).src).toContain('/art_crop/front/a/b/abc.jpg')
    expect((screen.getByAltText('Thrasios card art') as HTMLImageElement).src).toContain('/art_crop/front/x/y/xyz.jpg')
  })
  it('falls back to the No image box when the art fails to load', () => {
    renderRail(yedora())
    fireEvent.error(screen.getByAltText('Yedora, Grave Gardener card art'))
    expect(screen.getByRole('img', { name: 'Yedora, Grave Gardener card art' })).toHaveTextContent('No image')
  })
  it('has no green status colour in any rail component', () => {
    const dir = join(process.cwd(), 'src/components/deck-rail')
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
    expect(files.length).toBeGreaterThan(5)
    for (const f of files) expect(readFileSync(join(dir, f), 'utf8'), f).not.toContain('signal-success')
  })
  it('puts a shared section label style on every rail section', () => {
    renderRail(yedora())
    for (const name of ['Command zone', 'Cards', 'Deck health', 'Mana curve', 'Colour needs against sources']) {
      expect(screen.getByRole('heading', { name }).className).toMatch(/text-\[11px\].*uppercase/)
    }
    expect(screen.queryByText(/Salt/)).toBeNull() // salt now lives in the Strategy block
  })
  it('toggles the narrow-layout summary button', async () => {
    const user = userEvent.setup()
    renderRail(yedora())
    const toggle = screen.getByRole('button', { name: /Show deck summary/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: /Hide deck summary/ })).toHaveAttribute('aria-expanded', 'true')
  })
  it('partner deck: role chip, one row per commander with its own symbols, and a Combined identity row', () => {
    renderRail(
      yedora({
        commanders: [
          { name: 'Miara, Thorn of the Glade', colourIdentity: 'B', role: null },
          { name: 'Numa, Joraga Chieftain', colourIdentity: 'G', role: 'partner' },
        ],
        deck: { ...yedora().deck, colour_identity: 'BG' },
      }),
    )
    const section = screen.getByRole('heading', { name: 'Command zone' }).closest('section')!
    expect(within(section).getByTestId('role-chip')).toHaveTextContent('Partners')
    const rows = within(section).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByRole('img', { name: 'Black' })).toBeInTheDocument()
    expect(within(rows[1]).getByRole('img', { name: 'Green' })).toBeInTheDocument()
    const combined = within(section).getByTestId('combined-identity')
    expect(within(combined).getByRole('img', { name: 'Black' })).toBeInTheDocument()
    expect(within(combined).getByRole('img', { name: 'Green' })).toBeInTheDocument()
  })
  it('a Background second commander gets the Background chip; a single commander has no chip and no combined row', () => {
    const { unmount } = renderRail(yedora({ commanders: [{ name: 'A', colourIdentity: 'W' }, { name: 'B', colourIdentity: 'R', role: 'background' }] }))
    expect(screen.getByTestId('role-chip')).toHaveTextContent('Background')
    unmount()
    renderRail(yedora())
    expect(screen.queryByTestId('role-chip')).toBeNull()
    expect(screen.queryByTestId('combined-identity')).toBeNull()
  })
  it('the companion appears only under Outside the 100, with Maybeboard and Tokens counts', async () => {
    renderRail(
      yedora({
        allCards: [
          { card_name: 'Lurrus of the Dream-Den', command_zone_role: 'companion', categories: '["Sideboard"]', has_copy: false },
          { card_name: 'Opt', categories: '["Maybeboard"]' },
          { card_name: 'Goblin token', categories: '["Tokens"]' },
        ],
      }),
    )
    const outside = await screen.findByTestId('rail-outside')
    expect(outside).toHaveTextContent('Outside the 100')
    expect(outside).toHaveTextContent('CompanionLurrus of the Dream-Den· not sleeved')
    expect(outside).toHaveTextContent('Maybeboard1')
    expect(outside).toHaveTextContent('Tokens1')
    expect(screen.getByRole('heading', { name: 'Command zone' }).closest('section')).not.toHaveTextContent('Lurrus')
  })
  it('shows no Outside the 100 block when nothing is outside', () => {
    renderRail(yedora())
    expect(screen.queryByTestId('rail-outside')).toBeNull()
  })
  it('legend groups: zero-count groups and items are hidden, and the empty group shows the missing slots', async () => {
    statuses = async () => json(200, { cards: [], counts: { size: 84, sleeved: 84, original: 83, proxy: 1 } })
    renderRail(yedora({ totalCards: 84 }))
    const legend = await screen.findByTestId('rail-legend')
    expect(within(legend).getByText('Original')).toBeInTheDocument()
    expect(legend.querySelector('[data-legend-group="notSleeved"]')).toBeNull()
    expect(legend.querySelector('[data-legend-group="empty"]')).toHaveTextContent('16Empty slots')
    expect(screen.queryByTestId('rail-to-buy')).toBeNull()
  })
  it('shows the To buy line with count and price for unowned cards', async () => {
    renderRail(yedora({ allCards: [{ card_name: 'Sol Ring', price_usd: 2 }, { card_name: 'Mana Crypt', price_usd: 100.5 }] }))
    const line = await screen.findByTestId('rail-to-buy')
    expect(line).toHaveTextContent('To buy: 2 unowned cards · $102.50')
  })
  it('ladder, Legal at 100: neutral check, subline with the count, and the status with an exact count', async () => {
    renderRail(yedora({ totalCards: 100 }))
    expect(await screen.findByText('Legal for Commander')).toBeInTheDocument()
    expect(screen.getByText('100 cards · singleton · colour identity · no banned cards')).toBeInTheDocument()
    const status = await screen.findByTestId('rail-build-status')
    expect(status).toHaveTextContent('Assembling · 85 of 100 sleeved')
    expect(screen.queryByText('Playable needs a legal list first.')).toBeNull()
  })
  it('ladder, Legal at 84: says "Legal so far" and never claims 100 cards', async () => {
    renderRail(yedora({ totalCards: 84 }))
    expect(await screen.findByText('Legal so far')).toBeInTheDocument()
    expect(screen.getByText('Nothing found illegal. 84 of 100 cards.')).toBeInTheDocument()
    expect(screen.queryByText(/100 cards ·/)).toBeNull()
  })
  it('ladder, Not legal: banner with bullets, and "Playable needs a legal list first." under an Assembling status', async () => {
    legality = () => json(200, { format: 'commander', isLegal: false, issues: [{ cardName: 'Mana Crypt', reason: 'banned', details: 'Banned' }] })
    renderRail(yedora({ totalCards: 100 }))
    expect(await screen.findByText('Not legal yet')).toBeInTheDocument()
    expect(screen.getByText('1 banned card: Mana Crypt')).toBeInTheDocument()
    expect(await screen.findByText('Playable needs a legal list first.')).toBeInTheDocument()
  })
  it('the Playable line is not shown when the status is already Playable, even if Not legal', async () => {
    legality = () => json(200, { format: 'commander', isLegal: false, issues: [{ cardName: 'Mana Crypt', reason: 'banned', details: 'Banned' }] })
    statuses = async () => json(200, { cards: [], counts: { size: 100, sleeved: 100, original: 100 } })
    renderRail(yedora({ totalCards: 100 }))
    await screen.findByText('Not legal yet')
    expect(await screen.findByText(/Playable · 100 of 100 sleeved/)).toBeInTheDocument()
    expect(screen.queryByText('Playable needs a legal list first.')).toBeNull()
  })
  it('legality and card statuses are each fetched once', async () => {
    renderRail(yedora({ totalCards: 100 }))
    await screen.findByTestId('rail-build-status')
    const urls = vi.mocked(fetch).mock.calls.map(([u]) => String(u))
    expect(urls.filter((u) => u.endsWith('/legality'))).toHaveLength(1)
    expect(urls.filter((u) => u.endsWith('/card-statuses'))).toHaveLength(1)
  })
  it('does not repeat the deck size: "100" appears once in the Cards headline', async () => {
    renderRail(yedora({ totalCards: 100 }))
    await screen.findByTestId('rail-build-status')
    expect(screen.getByTestId('rail-count')).toHaveTextContent('100 / 100')
    expect(screen.getByTestId('rail-count').parentElement).toHaveTextContent('100 / 100 Planned')
    expect(screen.queryByText(/in deck/)).toBeNull()
  })
})
