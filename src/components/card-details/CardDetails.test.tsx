import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardGroupSection } from '../CardGroupSection'
import { CardDetailsProvider } from './CardDetailsProvider'
import { resetCardDetailsTabMemory } from './CardDetails'
import { parseCategoriesCapped, type StructuredCategories } from '@/lib/categoryUtils'
import type { CardDetails as Details } from '@/lib/card-details/load'
import type { DeckCard } from '../CardGrid'
import type { CardSlotStatus, DeckCardLifecycle } from '@/lib/card-status'

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const rest = { ...props }
    delete rest.blurDataURL
    delete rest.unoptimized
    delete rest.priority
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />
  },
}))

const SOL = {
  id: 1, deck_id: 4, card_name: 'Sol Ring', quantity: 1, categories: '["Ramp"]',
  scryfall_id: 'abcd0000-0000-0000-0000-000000000001', set_code: 'c21', tags: '', is_commander: false,
} as unknown as DeckCard
const SIGNET = {
  id: 2, deck_id: 4, card_name: 'Arcane Signet', quantity: 1, categories: '["Ramp"]',
  scryfall_id: 'abcd0000-0000-0000-0000-000000000002', set_code: 'c21', tags: '', is_commander: false,
} as unknown as DeckCard

function printing(over: Partial<Details['printings'][number]> = {}): Details['printings'][number] {
  return {
    scryfallId: 'abcd0000-0000-0000-0000-000000000001', setCode: 'c21', setName: 'Commander 2021', collectorNumber: '263', rarity: 'uncommon',
    finish: 'nonfoil', priceUsd: 2.1, releasedAt: '2021-04-23', imageSmall: null, imageNormal: null, owned: 1, isSlotPrinting: true, ...over,
  }
}
function baseDetails(): Details {
  return {
    deckId: 4, deckName: "Rocco's Secret Sauce", deckCardId: 1, cardName: 'Sol Ring', oracleId: 'oid-1',
    slot: { scryfallId: SOL.scryfall_id, setCode: 'c21', copyId: null, finish: null },
    facts: { name: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', typeLine: 'Artifact', manaCost: '{1}', manaValue: 1, colourIdentity: '', power: null, toughness: null, loyalty: null },
    tags: [
      { key: 'ramp', displayName: 'Ramp', kind: 'broad' }, { key: 'mana-rock', displayName: 'Mana rock', kind: 'mechanic' },
      { key: 'fast-mana', displayName: 'Fast mana', kind: 'mechanic' }, { key: 'colourless', displayName: 'Colourless', kind: 'mechanic' },
    ],
    printings: [
      printing(),
      printing({ scryfallId: 'abcd0000-0000-0000-0000-0000000000b2', setCode: 'cmr', setName: 'Commander Legends', collectorNumber: '472', finish: 'foil', priceUsd: 4.8, releasedAt: '2020-11-20', isSlotPrinting: false, owned: 0 }),
    ],
    copies: [
      { copyId: 10, isProxy: false, finish: 'nonfoil', condition: 'LP', printingId: SOL.scryfall_id, printing: { setCode: 'c21', collectorNumber: '263' }, where: { kind: 'storage', name: 'Binder 2' }, state: 'open', action: 'sleeve_here' },
      { copyId: 11, isProxy: false, finish: 'foil', condition: 'NM', printingId: 'x', printing: { setCode: 'cmr', collectorNumber: '472' }, where: { kind: 'deck', deckId: 9, deckName: 'Auntie Ool', deckState: 'playable' }, state: 'claimed', action: 'move_here' },
      { copyId: 12, isProxy: true, finish: 'nonfoil', condition: null, printingId: 'y', printing: { setCode: 'c21', collectorNumber: '263' }, where: { kind: 'deck', deckId: 8, deckName: 'The Fairmaker', deckState: 'brewing' }, state: 'proxy_elsewhere', action: null },
    ],
    rulings: [{ publishedAt: '2007-10-01', comment: 'A ruling.' }],
    commanderLegality: 'legal',
    whyAvailable: false, why: null,
  }
}

let details: Details
/** The answer for one part of the details request (the window asks for Overview, collection and rulings separately). */
function detailsPart(url: string) {
  const part = new URL(url, 'http://x').searchParams.get('part')
  const { printings, copies, rulings, ...overview } = details
  if (part === 'collection') return { printings, copies }
  if (part === 'rulings') return { rulings }
  return { ...overview, slotPrintings: printings.filter((p) => p.isSlotPrinting) }
}
let fetchLog: Array<{ url: string; method: string; body: unknown }>
let failWhy = false
let failPatch = false
let detailsFails = false

beforeEach(() => {
  resetCardDetailsTabMemory()
  details = baseDetails()
  fetchLog = []
  failWhy = false
  failPatch = false
  detailsFails = false
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    fetchLog.push({ url: String(url), method, body })
    const u = String(url)
    if (u.includes('/details')) return detailsFails ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, json: async () => detailsPart(u) }
    if (u.endsWith('/why')) return failWhy ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ ok: true }) }
    if (method === 'PATCH') return failPatch ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({}) }
    if (u.includes('/move-here')) return { ok: true, status: 200, json: async () => ({ sourceDeckId: 9, sourceDeckName: 'Auntie Ool', sourceWasPlayable: true, undo: {} }) }
    return { ok: true, status: 200, json: async () => ({ ok: true, moved: [] }) }
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function Harness({ onSave, failSave = false }: { onSave: (id: number, c: StructuredCategories) => void; failSave?: boolean }) {
  const [cards, setCards] = useState<DeckCard[]>([SOL, SIGNET])
  const statusMap = new Map<number, CardSlotStatus>([[1, 'original'], [2, 'available']])
  const lifecycleMap = new Map<number, DeckCardLifecycle>([[1, 'planned'], [2, 'planned']])
  const groups = new Map<string, DeckCard[]>()
  for (const c of cards) {
    const key = parseCategoriesCapped(c.categories).primary_category
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  const save = async (cardId: number, categories: StructuredCategories) => {
    onSave(cardId, categories)
    if (failSave) throw new Error('nope')
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, categories: JSON.stringify([categories.primary_category, ...categories.additional_categories]) } : c)))
  }
  return (
    <CardDetailsProvider deckId={4} cards={cards} statusMap={statusMap} lifecycleMap={lifecycleMap} availableCategories={['Ramp', 'Draw', 'Other']} onSaveCategories={save}>
      {[...groups.entries()].map(([name, groupCards]) => (
        <CardGroupSection
          key={name}
          groupName={name}
          groupCards={groupCards}
          statusMap={statusMap}
          lifecycleMap={lifecycleMap}
          deckId={4}
          physicalCopyMap={new Map()}
          availableCategories={['Ramp', 'Draw', 'Other']}
          onCategoryChange={(id, c) => void save(id, c)}
        />
      ))}
    </CardDetailsProvider>
  )
}
function renderHarness(props: Partial<React.ComponentProps<typeof Harness>> = {}) {
  const onSave = vi.fn()
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness onSave={onSave} {...props} />
    </QueryClientProvider>,
  )
  return { onSave, ...view }
}
async function openWindow() {
  fireEvent.click(screen.getAllByTestId('card-name-button')[0])
  const win = await screen.findByTestId('card-details')
  await within(win).findByTestId('card-details-oracle')
  return win
}
async function goTo(win: HTMLElement, name: RegExp) {
  await userEvent.setup().click(within(win).getByRole('tab', { name }))
}

describe('card details modal (deck context)', () => {
  it('opens from the card name with the shell, header, rail and Overview', async () => {
    renderHarness()
    expect(screen.queryByTestId('card-details')).not.toBeInTheDocument()
    const win = await openWindow()
    expect(screen.getByRole('dialog', { name: 'Sol Ring' })).toBeInTheDocument()
    expect(within(win).getByRole('button', { name: 'Close card details' })).toBeInTheDocument()
    expect(within(win).getByText(/Artifact · Uncommon · Rocco's Secret Sauce/)).toBeInTheDocument()
    expect(within(win).getByTestId('card-details-rail-printing')).toHaveTextContent('C21 · #263')
    expect(within(win).getByText('Legal')).toBeInTheDocument()
    // the three type chip groups are gone, and so are roles
    expect(within(win).queryByText(/Universal roles/)).not.toBeInTheDocument()
    expect(within(win).queryByText('Supertypes')).not.toBeInTheDocument()
    // The counts come with the sections the tabs load after the Overview.
    await waitFor(() => expect(within(win).getByRole('tab', { name: /Printings/ })).toHaveTextContent('2'))
    await waitFor(() => expect(within(win).getByRole('tab', { name: /Copies/ })).toHaveTextContent('3'))
    await waitFor(() => expect(within(win).getByRole('tab', { name: /Rulings/ })).toHaveTextContent('1'))
  })
  it('opens from the card menu item "Card details"', async () => {
    const user = userEvent.setup()
    renderHarness()
    await user.click(screen.getAllByRole('button', { name: 'More actions' })[0])
    await user.click(screen.getByRole('button', { name: 'Card details' }))
    expect(await screen.findByTestId('card-details')).toBeInTheDocument()
  })
  it('shows 3 Tags and "+N more" that expands; says so when there are none', async () => {
    const user = userEvent.setup()
    renderHarness()
    const win = await openWindow()
    expect(within(win).getByRole('heading', { name: 'Tags' })).toBeInTheDocument()
    expect(within(win).getAllByRole('listitem').filter((li) => li.closest('[aria-label="Tags"]') && !li.querySelector('button'))).toHaveLength(3)
    await user.click(within(win).getByRole('button', { name: '+1 more' }))
    expect(within(win).getByText('Colourless')).toBeInTheDocument()
  })
  it('tells the owner when a card has no Tags yet', async () => {
    details.tags = []
    renderHarness()
    const win = await openWindow()
    expect(within(win).getByText('No Tags for this card yet.')).toBeInTheDocument()
  })
  it('tabs work by arrow keys and the last tab is remembered', async () => {
    const user = userEvent.setup()
    const first = renderHarness()
    const win = await openWindow()
    const overview = within(win).getByRole('tab', { name: /Overview/ })
    expect(overview).toHaveAttribute('aria-selected', 'true')
    overview.focus()
    await user.keyboard('{ArrowRight}')
    expect(within(win).getByRole('tab', { name: /Printings/ })).toHaveAttribute('aria-selected', 'true')
    expect(within(win).getByRole('tabpanel')).toBeInTheDocument()
    first.unmount()
    renderHarness()
    fireEvent.click(screen.getAllByTestId('card-name-button')[0])
    const again = await screen.findByTestId('card-details')
    await waitFor(() => expect(within(again).getByRole('tab', { name: /Printings/ })).toHaveAttribute('aria-selected', 'true'))
  })
  it('closes with Escape and puts the focus on Close when it opens', async () => {
    const user = userEvent.setup()
    renderHarness()
    fireEvent.click(screen.getAllByTestId('card-name-button')[0])
    await screen.findByTestId('card-details')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close card details' })).toHaveFocus())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('card-details')).not.toBeInTheDocument())
  })
  it('on a phone it is a full-height sheet', async () => {
    renderHarness()
    const win = await openWindow()
    expect(win.className).toContain('max-sm:h-dvh')
    expect(win.className).toContain('max-sm:rounded-none')
    expect(win.className).toContain('sm:h-[min(600px')
  })
  it('a click on the checkbox or quantity does not open it', async () => {
    renderHarness()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Arcane Signet' }))
    fireEvent.click(screen.getAllByText('1')[0])
    expect(screen.queryByTestId('card-details')).not.toBeInTheDocument()
  })
  it('says so and stays usable when the lookup fails', { timeout: 10_000 }, async () => {
    detailsFails = true
    renderHarness()
    fireEvent.click(screen.getAllByTestId('card-name-button')[0])
    const win = await screen.findByTestId('card-details')
    expect(await within(win).findByText(/Couldn't load details for Sol Ring/, undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(within(win).getByRole('button', { name: 'Close card details' })).toBeInTheDocument()
  })

  describe('category', () => {
    it('a category change saves through the list save path, with Saved and Undo', async () => {
      const user = userEvent.setup()
      const { onSave } = renderHarness()
      const win = await openWindow()
      await user.selectOptions(within(win).getByRole('combobox', { name: 'Category' }), 'Draw')
      await waitFor(() => expect(onSave).toHaveBeenCalledWith(1, { primary_category: 'Draw', additional_categories: [] }))
      expect(await within(win).findByText('Saved')).toBeInTheDocument()
      expect(document.getElementById('category-draw')).not.toBeNull()
      await user.click(within(win).getByRole('button', { name: 'Undo' }))
      await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(1, { primary_category: 'Ramp', additional_categories: [] }))
    })
    it('shows an error and keeps the old category when the save fails', async () => {
      const user = userEvent.setup()
      renderHarness({ failSave: true })
      const win = await openWindow()
      await user.selectOptions(within(win).getByRole('combobox', { name: 'Category' }), 'Draw')
      expect(await within(win).findByText(/Couldn't save the category\. Nothing was changed\./)).toBeInTheDocument()
      expect(within(win).getByRole('combobox', { name: 'Category' })).toHaveValue('Ramp')
    })
    it('adds a second category, refuses a duplicate or reserved name, and removes one', async () => {
      const user = userEvent.setup()
      const { onSave } = renderHarness()
      const win = await openWindow()
      await user.click(within(win).getByRole('button', { name: 'Add to another category' }))
      await user.type(within(win).getByLabelText(/Or add a new name/), 'ramp')
      await user.click(within(win).getByRole('button', { name: 'Add' }))
      expect(await within(win).findByRole('alert')).toHaveTextContent('already in that category')
      await user.clear(within(win).getByLabelText(/Or add a new name/))
      await user.type(within(win).getByLabelText(/Or add a new name/), 'Maybeboard')
      await user.click(within(win).getByRole('button', { name: 'Add' }))
      expect(await within(win).findByRole('alert')).toHaveTextContent('reserved')
      expect(onSave).not.toHaveBeenCalled()
      await user.selectOptions(within(win).getByRole('combobox', { name: 'Add a category from this deck' }), 'Draw')
      await waitFor(() => expect(onSave).toHaveBeenCalledWith(1, { primary_category: 'Ramp', additional_categories: ['Draw'] }))
      await user.click(await within(win).findByRole('button', { name: 'Remove Draw' }))
      await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(1, { primary_category: 'Ramp', additional_categories: [] }))
    })
    it('at five categories it says so and offers no way to add a sixth', async () => {
      SOL.categories = JSON.stringify(['Ramp', 'A', 'B', 'C', 'D'])
      try {
        renderHarness()
        const win = await openWindow()
        expect(within(win).getByTestId('card-details-category-full')).toHaveTextContent('A card can be in 5 categories. Remove one to add another.')
        expect(within(win).queryByRole('button', { name: 'Add to another category' })).not.toBeInTheDocument()
      } finally {
        SOL.categories = '["Ramp"]'
      }
    })
  })

  describe("Why it's here", () => {
    it('is hidden while the column is missing', async () => {
      renderHarness()
      const win = await openWindow()
      expect(within(win).queryByText(/Why it's here/)).not.toBeInTheDocument()
      expect(within(win).queryByRole('textbox')).not.toBeInTheDocument()
    })
    it('autosaves on blur and offers a retry when the save fails', async () => {
      const user = userEvent.setup()
      details.whyAvailable = true
      details.why = 'Old reason'
      renderHarness()
      const win = await openWindow()
      const box = within(win).getByRole('textbox', { name: /Why it's here/ })
      expect(box).toHaveValue('Old reason')
      failWhy = true
      await user.clear(box)
      await user.type(box, 'Fast mana')
      await user.tab()
      expect(await within(win).findByText(/Couldn't save\. Your text is still here\./)).toBeInTheDocument()
      expect(box).toHaveValue('Fast mana')
      failWhy = false
      await user.click(within(win).getByRole('button', { name: 'Try again' }))
      await waitFor(() => expect(within(win).getByText(/Saved at/)).toBeInTheDocument())
      const put = fetchLog.filter((f) => f.url.endsWith('/why') && f.method === 'PUT')
      expect(put[put.length - 1].body).toEqual({ why: 'Fast mana' })
    })
    it('links to the Copies tab when the slot is Planned', async () => {
      const user = userEvent.setup()
      renderHarness()
      const win = await openWindow()
      await user.click(within(win).getByRole('button', { name: 'Sleeve a copy in the Copies tab' }))
      expect(within(win).getByRole('tab', { name: /Copies/ })).toHaveAttribute('aria-selected', 'true')
    })
  })

  describe('Printings', () => {
    it('picking a printing changes only the slot (slotOnly) and never touches a copy', async () => {
      const user = userEvent.setup()
      renderHarness()
      const win = await openWindow()
      await goTo(win, /Printings/)
      const radio = await within(win).findByRole('radio', { name: /Commander Legends 472 · foil/ })
      await user.click(radio)
      await waitFor(() => expect(fetchLog.some((f) => f.method === 'PATCH')).toBe(true))
      const patch = fetchLog.find((f) => f.method === 'PATCH')!
      expect(patch.url).toBe('/api/decks/4/cards/1')
      expect(patch.body).toEqual({ scryfall_id: 'abcd0000-0000-0000-0000-0000000000b2', set_code: 'cmr', finish: 'foil', slotOnly: true })
      expect(fetchLog.some((f) => /assign|move-here|reassign/.test(f.url))).toBe(false)
    })
    it('disables every radio with a note when the slot has a copy', async () => {
      details.slot.copyId = 11
      renderHarness()
      const win = await openWindow()
      await goTo(win, /Printings/)
      const radios = await within(win).findAllByRole('radio')
      expect(radios.length).toBe(2)
      radios.forEach((r) => expect(r).toBeDisabled())
      expect(within(win).getByTestId('card-details-printing-note')).toHaveTextContent(/follows that copy/)
      expect(fetchLog.some((f) => f.method === 'PATCH')).toBe(false)
    })
    it('shows an error and changes nothing when the save fails', async () => {
      const user = userEvent.setup()
      failPatch = true
      renderHarness()
      const win = await openWindow()
      await goTo(win, /Printings/)
      await user.click(await within(win).findByRole('radio', { name: /Commander Legends 472/ }))
      expect(await within(win).findByText(/Couldn't change the printing\. Nothing was changed\./)).toBeInTheDocument()
    })
    it('filters to what you own', async () => {
      const user = userEvent.setup()
      renderHarness()
      const win = await openWindow()
      await goTo(win, /Printings/)
      expect(await within(win).findAllByTestId('card-details-printing-row')).toHaveLength(2)
      await user.click(within(win).getByRole('button', { name: 'You own 1' }))
      expect(within(win).getAllByTestId('card-details-printing-row')).toHaveLength(1)
    })
    it('hovering a row shows that printing in the rail after a short pause', async () => {
      renderHarness()
      const win = await openWindow()
      await goTo(win, /Printings/)
      const rows = await within(win).findAllByTestId('card-details-printing-row')
      fireEvent.mouseEnter(rows[1])
      await waitFor(() => expect(within(within(win).getByTestId('card-details-rail')).getByAltText('Sol Ring').getAttribute('src')).toContain('b2'))
    })
  })

  describe('Copies', () => {
    it('shows the Planned note, the actions and no action for a proxy elsewhere', async () => {
      renderHarness()
      const win = await openWindow()
      await goTo(win, /Copies/)
      expect(await within(win).findByTestId('card-details-planned-note')).toHaveTextContent('This slot has no copy yet')
      const rows = within(win).getAllByTestId('card-details-copy-row')
      expect(rows).toHaveLength(3)
      expect(within(rows[0]).getByRole('button', { name: 'Sleeve here' })).toBeInTheDocument()
      expect(within(rows[0]).getByText('Open')).toBeInTheDocument()
      expect(within(rows[1]).getByText('In Auntie Ool · Playable')).toBeInTheDocument()
      expect(within(rows[2]).queryByRole('button')).not.toBeInTheDocument()
    })
    it('sleeves an Open copy through the existing route', async () => {
      const user = userEvent.setup()
      renderHarness()
      const win = await openWindow()
      await goTo(win, /Copies/)
      await user.click(await within(win).findByRole('button', { name: 'Sleeve here' }))
      await waitFor(() => expect(fetchLog.some((f) => f.url === '/api/allocation/assign-free-copy')).toBe(true))
      expect(fetchLog.find((f) => f.url === '/api/allocation/assign-free-copy')!.body).toEqual({ copyId: 10, targetDeckId: 4, cardName: 'Sol Ring' })
    })
    it('warns on the row before moving a copy out of a Playable deck, and moves only after Confirm', async () => {
      const user = userEvent.setup()
      renderHarness()
      const win = await openWindow()
      await goTo(win, /Copies/)
      await user.click(await within(win).findByRole('button', { name: 'Move here' }))
      expect(await within(win).findByTestId('card-details-move-warning')).toHaveTextContent('Auntie Ool is Playable, so it will become Assembling.')
      expect(fetchLog.some((f) => f.url.includes('/move-here'))).toBe(false)
      await user.click(within(win).getByRole('button', { name: /Confirm Move here/ }))
      await waitFor(() => expect(fetchLog.some((f) => f.url === '/api/decks/4/move-here' && f.method === 'POST')).toBe(true))
      expect(fetchLog.find((f) => f.url === '/api/decks/4/move-here')!.body).toEqual({ copyId: 11, cardName: 'Sol Ring', expectedSourceDeckId: 9 })
    })
    it('Cancel on the warning moves nothing', async () => {
      const user = userEvent.setup()
      renderHarness()
      const win = await openWindow()
      await goTo(win, /Copies/)
      await user.click(await within(win).findByRole('button', { name: 'Move here' }))
      await user.click(within(win).getByRole('button', { name: 'Cancel' }))
      expect(within(win).queryByTestId('card-details-move-warning')).not.toBeInTheDocument()
      expect(fetchLog.some((f) => f.url.includes('/move-here'))).toBe(false)
    })
    it('a source deck that is not Playable moves on one click', async () => {
      const user = userEvent.setup()
      if (details.copies[1].where.kind === 'deck') details.copies[1].where.deckState = 'assembling'
      renderHarness()
      const win = await openWindow()
      await goTo(win, /Copies/)
      await user.click(await within(win).findByRole('button', { name: 'Move here' }))
      await waitFor(() => expect(fetchLog.some((f) => f.url === '/api/decks/4/move-here')).toBe(true))
    })
  })

  describe('Rulings', () => {
    it('lists date and text', async () => {
      renderHarness()
      const win = await openWindow()
      await goTo(win, /Rulings/)
      expect(await within(win).findByText('A ruling.')).toBeInTheDocument()
      expect(within(win).getByText('1 Oct 2007')).toBeInTheDocument()
    })
    it('shows the empty state', async () => {
      details.rulings = []
      renderHarness()
      const win = await openWindow()
      await goTo(win, /Rulings/)
      expect(await within(win).findByText('No rulings for this card.')).toBeInTheDocument()
    })
  })
})

/** Hold back every answer whose URL contains `part` until `release()` is called. */
function holdBack(part: string) {
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  const inner = globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<unknown>
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes(part)) {
      fetchLog.push({ url: String(url), method: 'GET', body: undefined })
      await gate
      const u = String(url)
      return { ok: true, status: 200, json: async () => detailsPart(u) }
    }
    return inner(url, init)
  }))
  return release
}
describe('card details speed (deck context)', () => {
  it('shows the window at once with what the deck list knows, then fills in', async () => {
    Object.assign(SOL, { mana_cost: '{1}', type_line: 'Artifact', rarity: 'uncommon' })
    try {
      const release = holdBack('part=overview')
      renderHarness()
      fireEvent.click(screen.getAllByTestId('card-name-button')[0])
      // No answer has arrived yet.
      const win = screen.getByTestId('card-details')
      expect(screen.getByRole('dialog', { name: 'Sol Ring' })).toBeInTheDocument()
      expect(within(win).getByText('Artifact · Uncommon')).toBeInTheDocument()
      expect(within(win).getByTestId('card-details-loading')).toBeInTheDocument()
      expect(within(win).getAllByRole('tab')).toHaveLength(4)
      expect(within(win).queryByTestId('card-details-oracle')).not.toBeInTheDocument()
      release()
      await within(win).findByTestId('card-details-oracle')
      expect(within(win).getByText(/Artifact · Uncommon · Rocco's Secret Sauce/)).toBeInTheDocument()
    } finally {
      for (const k of ['mana_cost', 'type_line', 'rarity']) delete (SOL as unknown as Record<string, unknown>)[k]
    }
  })
  it('loads Printings and Copies after the Overview and shows a placeholder in their tab until they arrive', async () => {
    const release = holdBack('part=collection')
    renderHarness()
    const win = await openWindow()
    await waitFor(() => expect(within(win).getByRole('tab', { name: /Rulings/ })).toHaveTextContent('1'))
    // Overview and Rulings are in; Printings and Copies are still on their way, with no count shown.
    expect(within(win).getByRole('tab', { name: /Printings/ })).not.toHaveTextContent(/\d/)
    expect(within(win).getByRole('tab', { name: /Copies/ })).not.toHaveTextContent(/\d/)
    await goTo(win, /Printings/)
    expect(within(win).getByTestId('card-details-loading')).toBeInTheDocument()
    expect(within(win).queryAllByTestId('card-details-printing-row')).toHaveLength(0)
    release()
    await waitFor(() => expect(within(win).getAllByTestId('card-details-printing-row')).toHaveLength(2))
    expect(within(win).getByRole('tab', { name: /Printings/ })).toHaveTextContent('2')
  })
  it('asks for each part once, however many tabs are visited, and not for everything at once', async () => {
    renderHarness()
    const win = await openWindow()
    await waitFor(() => expect(within(win).getByRole('tab', { name: /Copies/ })).toHaveTextContent('3'))
    await goTo(win, /Printings/)
    await goTo(win, /Copies/)
    await goTo(win, /Rulings/)
    await goTo(win, /Overview/)
    const asked = fetchLog.filter((l) => l.url.includes('/details')).map((l) => l.url)
    expect(asked).toHaveLength(3)
    expect(new Set(asked).size).toBe(3)
    expect(asked[0]).toContain('part=overview')
    expect(asked.some((u) => u.includes('part=collection&oracleId=oid-1'))).toBe(true)
    expect(asked.some((u) => u.includes('part=rulings&oracleId=oid-1'))).toBe(true)
  })
  it('reads the Overview once when the name is hovered before it is clicked', async () => {
    renderHarness()
    const name = screen.getAllByTestId('card-name-button')[0]
    fireEvent.mouseEnter(name)
    await waitFor(() => expect(fetchLog.filter((l) => l.url.includes('part=overview'))).toHaveLength(1))
    const win = await openWindow()
    await waitFor(() => expect(within(win).getByRole('tab', { name: /Rulings/ })).toHaveTextContent('1'))
    expect(fetchLog.filter((l) => l.url.includes('part=overview'))).toHaveLength(1)
  })
  it('keeps a failed section in its own tab and leaves the Overview alone', async () => {
    const inner = globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<unknown>
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) =>
      String(url).includes('part=collection') ? { ok: false, status: 500, json: async () => ({}) } : inner(url, init)))
    renderHarness()
    const win = await openWindow()
    expect(within(win).getByTestId('card-details-oracle')).toBeInTheDocument()
    await goTo(win, /Copies/)
    expect(await within(win).findByText(/Couldn.t load details for Sol Ring/)).toBeInTheDocument()
  })
})
