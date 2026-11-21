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
let settings: () => unknown
beforeEach(() => {
  health = () => json(200, HEALTH)
  statuses = async () => json(200, STATUSES)
  settings = () => json(200, { available: true, mode: 'default', overrides: {}, categories: [] })
  legality = () => json(200, { format: 'commander', isLegal: true, issues: [] })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/health')) return health()
    if (url.endsWith('/health-settings')) return settings()
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
    expect(headings).toEqual(['Yedora, the Explorer', 'Cards', 'Deck health', 'Mana'])
    const slot = screen.getByTestId('strategy-slot')
    expect(screen.getByTestId('rail-commander').compareDocumentPosition(screen.getByRole('heading', { name: 'Cards' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Cards' }).compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Green' })).toBeInTheDocument()
    expect(screen.queryByText(/Commander · /)).toBeNull()
    expect(screen.getByText('$131.98')).toBeInTheDocument()
  })

  it('102 cards: amber count, Not legal and "2 cards over"', async () => {
    renderRail(yedora())
    expect(await screen.findByText('2 cards over')).toBeInTheDocument()
    expect(screen.getByTestId('rail-legal-chip')).toHaveTextContent('Not legal')
    expect(screen.getByTestId('rail-count')).toHaveTextContent('102')
    expect(screen.getByTestId('rail-count').getAttribute('style')).toMatch(/warn-amber/)
  })
  it('100 cards: no amber, no over text, Legal for Commander', async () => {
    renderRail(yedora({ totalCards: 100 }))
    expect(await screen.findByText('Legal for Commander')).toBeInTheDocument()
    expect(screen.getByTestId('rail-count')).toHaveTextContent('100')
    expect(screen.getByTestId('rail-count').getAttribute('style')).toBeNull()
    expect(screen.queryByText(/over/)).toBeNull()
  })
  it('84 cards: "16 cards short"', async () => {
    renderRail(yedora({ totalCards: 84 }))
    expect(await screen.findByText('16 cards short')).toBeInTheDocument()
  })
  it('85 of 100 sleeved: Assembling and "15 cards not sleeved" with 85 / 100', async () => {
    renderRail(yedora({ totalCards: 100 }))
    expect(await screen.findByText('15 cards not sleeved')).toBeInTheDocument()
    expect(screen.getByText('85 / 100')).toBeInTheDocument()
    expect(screen.getByTestId('rail-status-chip')).toHaveTextContent('Assembling')
  })
  it('all 100 sleeved and legal: Playable and no checklist', async () => {
    statuses = async () => json(200, { cards: [], counts: { size: 100, sleeved: 100, original: 100 } })
    renderRail(yedora({ totalCards: 100 }))
    await waitFor(() => expect(screen.getByTestId('rail-status-chip')).toHaveTextContent('Playable'))
    expect(screen.queryByTestId('rail-problems')).toBeNull()
  })
  it('an off-colour card at 100 shows Not legal and the colour identity line', async () => {
    statuses = async () => json(200, { cards: [], counts: { size: 100, sleeved: 100, original: 100 } })
    settings = () => json(200, { available: true, mode: 'default', overrides: {}, categories: [] })
  legality = () => json(200, { format: 'commander', isLegal: false, issues: [{ cardName: 'Opt', reason: 'color_identity', details: '' }] })
    renderRail(yedora({ totalCards: 100 }))
    expect(await screen.findByText('1 card outside colour identity')).toBeInTheDocument()
    expect(screen.getByTestId('rail-status-chip')).toHaveTextContent('Assembling')
    expect(screen.getByTestId('rail-legal-chip')).toHaveTextContent('Not legal')
  })
  it('says Checking… while statuses load, never zeros', async () => {
    let release: (v: unknown) => void = () => {}
    statuses = () => new Promise((r) => { release = r })
    renderRail(yedora())
    const section = screen.getByRole('heading', { name: 'Cards' }).closest('section')!
    expect(within(section).getByText('Checking…')).toBeInTheDocument()
    release(json(200, STATUSES))
    await waitFor(() => expect(within(section).queryByText('Checking…')).toBeNull())
    expect(within(section).getByTestId('rail-status-chip')).toBeInTheDocument()
  })
  it("says Couldn't check with Try again when statuses fail", async () => {
    statuses = async () => json(500, {})
    renderRail(yedora())
    expect(await screen.findByText("Couldn't check", { selector: 'span' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0)
  })

  it('shows six health tiles, problems first, with the count, the target and an arrow only on problem tiles', async () => {
    renderRail(yedora())
    const rows = await screen.findByTestId('health-rows')
    const items = within(rows).getAllByRole('button')
    expect(items.map((b) => b.getAttribute('data-kind'))).toEqual(['card_advantage', 'targeted_removal', 'board_wipes', 'ramp', 'lands', 'game_plan'])
    // The numbers are the buildDeckHealth numbers.
    for (const src of HEALTH.rows) {
      const el = items.find((b) => b.getAttribute('data-kind') === src.kind)!
      expect(within(el).getByTestId('health-have')).toHaveTextContent(String(src.have))
      if (src.range) expect(within(el).getByTestId('health-target')).toHaveTextContent(`/ ${src.range.min}\u2013${src.range.max}`)
    }
    const tile = (name: RegExp) => screen.getByRole('button', { name })
    expect(tile(/^Lands: 37 cards\. Target 35\u201338\. On target/)).toHaveAttribute('data-status', 'on')
    const ramp = tile(/^Ramp: 18 cards\. Target 10\u201312\. 6 above/)
    expect(ramp).toHaveAttribute('data-status', 'over')
    expect(within(ramp).getByTestId('health-arrow-up')).toBeInTheDocument()
    const wipes = tile(/^Board Wipes: 0 cards\. Target 3\u20136\. 3 below/)
    expect(within(wipes).getByTestId('health-arrow-down')).toBeInTheDocument()
    const gp = tile(/^Game Plan: 34 cards\. A total, no target/)
    expect(gp).toHaveTextContent('Total')
    expect(within(gp).queryByTestId('health-arrow-up')).toBeNull()
    expect(within(gp).queryByTestId('health-arrow-down')).toBeNull()
    expect(screen.getByTestId('health-verdict')).toHaveTextContent('Light on card advantage, removal and board wipes, heavy on ramp')
    expect(screen.getByText('Mana sources 55: 37 lands, 18 ramp cards. An estimate.')).toBeInTheDocument()
  })
  it('has no Ok, Light or Heavy words on any tile and no Confirm or Decline in the rail', async () => {
    renderRail(yedora())
    const rows = await screen.findByTestId('health-rows')
    expect(rows.textContent).not.toMatch(/\b(Ok|Light|Heavy)\b/)
    for (const b of within(rows).getAllByRole('button')) expect(b.getAttribute('aria-label')).not.toMatch(/\b(ok|light|heavy)\b/i)
    expect(screen.queryByRole('button', { name: /confirm|decline/i })).toBeNull()
  })
  it('says On target in every category with no amber when every row is in range', async () => {
    health = () =>
      json(
        200,
        buildDeckHealth([
          { cardName: 'Forest', quantity: 36, typeLine: 'Basic Land — Forest', oracleText: null, inMainDeck: true },
          ...Array.from({ length: 10 }, (_, i) => ({ cardName: `Rock ${i}`, quantity: 1, typeLine: 'Artifact', oracleText: '{T}: Add {G}.', inMainDeck: true })),
          ...Array.from({ length: 10 }, (_, i) => ({ cardName: `Brain ${i}`, quantity: 1, typeLine: 'Sorcery', oracleText: 'Draw two cards.', inMainDeck: true })),
          ...Array.from({ length: 10 }, (_, i) => ({ cardName: `Kill ${i}`, quantity: 1, typeLine: 'Instant', oracleText: 'Destroy target creature.', inMainDeck: true })),
          ...Array.from({ length: 3 }, (_, i) => ({ cardName: `Wipe ${i}`, quantity: 1, typeLine: 'Sorcery', oracleText: 'Destroy all creatures.', inMainDeck: true })),
        ]),
      )
    renderRail(yedora())
    expect(await screen.findByTestId('health-verdict')).toHaveTextContent('On target in every category')
    expect(screen.queryByTestId('health-arrow-up')).toBeNull()
    expect(screen.queryByTestId('health-arrow-down')).toBeNull()
  })
  it('the EDHREC reference line is not in the rail any more (it moved to the Deck health tab)', async () => {
    renderRail(yedora())
    await screen.findByTestId('health-rows')
    expect(screen.queryByTestId('health-reference')).toBeNull()
    expect(screen.queryByText(/EDHREC average for reference/)).toBeNull()
  })
  it('shows custom categories with No target and no verdict when the deck is in Custom mode', async () => {
    settings = () => json(200, { available: true, mode: 'custom', overrides: {}, categories: [{ id: 1, name: 'Mana Rocks', min: 2, max: 4, proposed: null }, { id: 2, name: 'Tutors', min: null, max: null, proposed: { min: 3, max: 5 } }] })
    renderRail(yedora({ cards: [{ card_name: 'Sol Ring', quantity: 1, categories: 'Mana Rocks' }, { card_name: 'Mind Stone', quantity: 1, categories: 'Mana Rocks' }, { card_name: 'Demonic Tutor', quantity: 1, categories: 'Tutors' }] }))
    const rows = await screen.findByTestId('health-rows')
    await waitFor(() => expect(within(rows).getByRole('group', { name: /^Mana Rocks: 2 cards/ })).toHaveAttribute('data-status', 'on'))
    const tutors = within(rows).getByRole('group', { name: /^Tutors: 1 card\. No target/ })
    expect(tutors).toHaveTextContent('No target')
    expect(screen.getByTestId('health-verdict')).toHaveTextContent('On target everywhere a target is set')
    expect(screen.queryByRole('button', { name: /confirm|decline/i })).toBeNull()
  })
  it('shows the six rows even at 0 cards', async () => {
    health = () => json(200, buildDeckHealth([]))
    renderRail(yedora())
    const rows = await screen.findByTestId('health-rows')
    expect(within(rows).getAllByRole('button')).toHaveLength(6)
    expect(screen.getByRole('button', { name: /^Board Wipes: 0 cards\. Target 3\u20136/ })).toBeInTheDocument()
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
    expect(within(dialog).getAllByRole('button', { name: /Open details\.$/ }).length).toBeGreaterThanOrEqual(6)
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
    await user.click(await screen.findByRole('button', { name: /^Game Plan: 34 cards/ }))
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
  it('prints every curve value in a text alternative, drops the empty 0 column, and names cards without a cost', () => {
    renderRail(yedora())
    const chart = screen.getByRole('img', { name: /Mana curve/ })
    expect(chart).toHaveAccessibleName('Mana curve. cost 1: 1, cost 2: 0, cost 3: 0, cost 4: 0, cost 5: 0, cost 6: 0, cost 7+: 0.')
    expect(screen.getAllByTestId('curve-column')).toHaveLength(7)
    expect(screen.getByText('1 card has no cost on file')).toBeInTheDocument()
    expect(screen.getByText('Stacked by card colour · lands excluded')).toBeInTheDocument()
    expect(screen.getByTestId('avg-mv')).toHaveTextContent('Avg MV ≈ 1.0')
  })
  it('mono-colour deck: one line, no per-colour bars', () => {
    renderRail(yedora())
    expect(screen.getByTestId('mana-verdict')).toHaveTextContent('Mono-colour: nothing to balance')
    expect(screen.getByText("Every pip is green, so there's no split to check.")).toBeInTheDocument()
    expect(screen.queryByTestId('under-chip')).toBeNull()
    expect(screen.getByText("Lands counted: basics and well-known duals only. Rocks and utility lands aren't included.")).toBeInTheDocument()
  })
  it('two-colour deck: pips and sources on one percent scale, and the amber chip at a 5-point gap only', () => {
    const cards = [
      { card_name: 'Elf', mana_cost: '{G}', type_line: 'Creature', quantity: 55 },
      { card_name: 'Mage', mana_cost: '{W}', type_line: 'Creature', quantity: 45 },
      { card_name: 'Forest', mana_cost: null, type_line: 'Basic Land — Forest', quantity: 50 },
      { card_name: 'Plains', mana_cost: null, type_line: 'Basic Land — Plains', quantity: 50 },
    ]
    const { unmount } = renderRail(yedora({ cards, deck: { ...yedora().deck, colour_identity: 'GW' } }))
    expect(screen.getByTestId('mana-verdict')).toHaveTextContent('Green is under-supplied')
    expect(screen.getByTestId('under-chip')).toHaveTextContent('\u22125 pts')
    unmount()
    renderRail(yedora({ cards: cards.map((c) => (c.card_name === 'Elf' ? { ...c, quantity: 54 } : c.card_name === 'Mage' ? { ...c, quantity: 46 } : c)), deck: { ...yedora().deck, colour_identity: 'GW' } }))
    expect(screen.queryByTestId('under-chip')).toBeNull()
    expect(screen.getByTestId('mana-verdict')).toHaveTextContent('Balanced across 2 colours')
  })
  it('says Colourless deck when there is no colour identity', () => {
    renderRail(yedora({ deck: { ...yedora().deck, colour_identity: '' } }))
    expect(screen.getByText('Colourless deck')).toBeInTheDocument()
  })

  it('shows a Choose a commander slot when none is chosen, and the rest still works', async () => {
    renderRail(yedora({ commanders: [], deck: { ...yedora().deck, commander_scryfall_id: null } }))
    expect(screen.getByText('Choose a commander')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mana' })).toBeInTheDocument()
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
    for (const name of ['Deck health', 'Mana']) {
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
  it('partner deck: one row per commander with its own symbols, no role chip and no combined row', () => {
    renderRail(
      yedora({
        commanders: [
          { name: 'Miara, Thorn of the Glade', colourIdentity: 'B', role: null },
          { name: 'Numa, Joraga Chieftain', colourIdentity: 'G', role: 'partner' },
        ],
        deck: { ...yedora().deck, colour_identity: 'BG' },
      }),
    )
    const section = screen.getByTestId('rail-commander')
    const rows = within(section).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByRole('img', { name: 'Black' })).toBeInTheDocument()
    expect(within(rows[1]).getByRole('img', { name: 'Green' })).toBeInTheDocument()
    expect(screen.queryByTestId('role-chip')).toBeNull()
    expect(screen.queryByTestId('combined-identity')).toBeNull()
  })
  it('a Background second commander is a labelled line under the commander', () => {
    renderRail(yedora({ commanders: [{ name: 'A', colourIdentity: 'W' }, { name: 'B', colourIdentity: 'R', role: 'background' }] }))
    const section = screen.getByTestId('rail-commander')
    expect(within(section).getAllByRole('listitem')).toHaveLength(1)
    expect(section).toHaveTextContent('BackgroundB')
  })
  it('the companion is a labelled line under the commanders', () => {
    renderRail(yedora({ allCards: [{ card_name: 'Lurrus of the Dream-Den', command_zone_role: 'companion' }, { card_name: 'Opt' }] }))
    expect(screen.getByTestId('rail-commander')).toHaveTextContent('CompanionLurrus of the Dream-Den')
  })
  it('legality and card statuses are each fetched once', async () => {
    renderRail(yedora({ totalCards: 100 }))
    await screen.findByTestId('rail-status-chip')
    const urls = vi.mocked(fetch).mock.calls.map(([u]) => String(u))
    expect(urls.filter((u) => u.endsWith('/legality'))).toHaveLength(1)
    expect(urls.filter((u) => u.endsWith('/card-statuses'))).toHaveLength(1)
  })
})
