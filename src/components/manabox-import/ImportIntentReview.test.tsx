import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ManaBoxDeckImportFlow } from './ManaBoxDeckImportFlow'
import type { ImportIntent } from '../../../docs/oracle/contracts/import-intent.types'

// The save flag (NEXT_PUBLIC_IMPORT_INTENT_SAVE) is read at render time; tests switch it.
const flag = vi.hoisted(() => ({ on: false }))
vi.mock('./import-copy', async (orig) => {
  const actual = await orig<typeof import('./import-copy')>()
  return {
    ...actual,
    get INTENT_SAVE_ENABLED() {
      return flag.on
    },
  }
})

vi.mock('./use-printing-languages', () => ({
  usePrintingLanguages: () => ({ status: 'done', languages: ['en'] }),
  clearPrintingLanguageCache: () => {},
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: i,
        start: i * estimateSize(),
        end: (i + 1) * estimateSize(),
        size: estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
    measure: () => {},
  }),
}))

const wrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function W({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

const PREVIEW = {
  fileName: 'deck.csv',
  totalLines: 1,
  rows: [
    {
      rowKey: 'emil|nonfoil',
      sourceIndex: 2,
      sourceLines: [2],
      cardName: 'Emil, Vastlands Roamer',
      setCode: 'sos',
      collectorNumber: '146',
      scryfallId: 'emil-sf',
      oracleId: 'emil-oracle',
      qty: 1,
      printingGiven: true,
      availableFinishes: ['nonfoil'],
      copies: [{ index: 0, sourceLine: 2, file: { finish: 'nonfoil' }, owner: {} }],
      isBasicLand: false,
    },
  ],
  skippedTokens: [],
  unmatched: [],
  notices: { unrecognisedCondition: 0, unrecognisedLanguage: 0, unrecognisedFinish: 0 },
}

const TWO = {
  ...PREVIEW,
  rows: [
    {
      ...PREVIEW.rows[0],
      qty: 2,
      copies: [
        { index: 0, sourceLine: 2, file: { finish: 'nonfoil' }, owner: {} },
        { index: 1, sourceLine: 2, file: { finish: 'nonfoil' }, owner: {} },
      ],
    },
  ],
}

const OWNED = {
  rows: [
    {
      rowKey: 'emil|nonfoil',
      oracleId: 'emil-oracle',
      free: [{ printingId: 'emil-sf', setCode: 'sos', collectorNumber: '146', finish: 'nonfoil', isProxy: false, count: 1 }],
      held: [],
    },
  ],
}
const NOT_OWNED = { rows: [{ rowKey: 'emil|nonfoil', oracleId: 'emil-oracle', free: [], held: [] }] }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function open(intent: ImportIntent, ownership: unknown, preview: unknown = PREVIEW) {
  const user = userEvent.setup()
  const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) =>
    String(input).includes('/ownership') ? json(ownership) : json(preview)
  )
  render(<ManaBoxDeckImportFlow intent={intent} onComplete={() => {}} onCancel={() => {}} />, { wrapper: wrapper() })
  await user.upload(screen.getByLabelText('Choose file'), new File(['x'], 'deck.csv', { type: 'text/csv' }))
  await waitFor(() => expect(screen.getByText('Emil, Vastlands Roamer')).toBeInTheDocument())
  return { user, fetchSpy }
}

const HELD = (decks: { id: number; name: string }[]) => ({
  rows: [
    {
      rowKey: 'emil|nonfoil',
      oracleId: 'emil-oracle',
      free: [],
      held: decks.map((d) => ({
        printingId: 'emil-sf',
        setCode: 'sos',
        collectorNumber: '146',
        finish: 'nonfoil',
        isProxy: false,
        count: 1,
        deckId: d.id,
        deckName: d.name,
      })),
    },
  ],
})

const ISLAND = {
  rowKey: 'island|nonfoil',
  sourceIndex: 3,
  sourceLines: [3],
  cardName: 'Island',
  setCode: null,
  collectorNumber: null,
  scryfallId: null,
  oracleId: 'island-oracle',
  qty: 2,
  printingGiven: false,
  availableFinishes: null,
  copies: [
    { index: 0, sourceLine: 3, file: {}, owner: {} },
    { index: 1, sourceLine: 3, file: {}, owner: {} },
  ],
  isBasicLand: true,
}
const WITH_ISLAND = { ...PREVIEW, rows: [...PREVIEW.rows, ISLAND] }

const MAYBE = {
  ...PREVIEW,
  rows: [
    ...PREVIEW.rows,
    {
      ...PREVIEW.rows[0],
      rowKey: 'arcane|nonfoil',
      sourceIndex: 4,
      sourceLines: [4],
      cardName: 'Arcane Signet',
      scryfallId: 'arcane-sf',
      oracleId: 'arcane-oracle',
      board: 'maybeboard',
      copies: [{ index: 0, sourceLine: 4, file: { finish: 'nonfoil' }, owner: {} }],
    },
  ],
}

const EMIL = 'Emil, Vastlands Roamer'
const group = (name: string) => screen.getByRole('group', { name })
const btn = (groupName: string, name: string) => within(group(groupName)).getByRole('button', { name })
const trigger = (label: string) => screen.getByRole('button', { name: label })
/** The closed value of a quiet dropdown (its text, without the ▾). */
const shown = (label: string) => trigger(label).textContent?.replace('▾', '').trim()
const item = (option: string) => screen.findByRole('menuitem', { name: new RegExp(`^(✓ )?${option}`) })
async function pick(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(trigger(label))
  await user.click(await item(option))
}
const ORIGIN = `Card origin for ${EMIL}`
const TYPE = `Type for ${EMIL}`
const importBtn = () => screen.getByRole('button', { name: /Import deck/i })
const ready = () => expect(trigger(ORIGIN)).toBeInTheDocument()
const saveCall = (fetchSpy: { mock: { calls: unknown[][] } }) =>
  fetchSpy.mock.calls.find(
    ([u]) => String(u).includes('/api/decks/import') && !String(u).includes('ownership') && !String(u).includes('preview')
  )

beforeEach(() => {
  vi.restoreAllMocks()
  flag.on = false
})

describe('Review list: Card origin and Type', () => {
  it('the list header says Card origin and Type, and there is no Add tick', async () => {
    await open('purchased', OWNED)
    expect(screen.getByText('Card origin')).toBeInTheDocument()
    expect(screen.queryByText('Card source')).toBeNull()
    expect(screen.getAllByText('Type').length).toBeGreaterThan(0)
    expect(screen.queryByRole('checkbox', { name: /to collection/i })).toBeNull()
  })

  it('purchased: every card starts New copy / Original and Import is enabled', async () => {
    await open('purchased', NOT_OWNED, TWO)
    await waitFor(ready)
    expect(shown(ORIGIN)).toBe('New copy')
    expect(shown(TYPE)).toBe('Original')
    expect(importBtn()).toBeEnabled()
  })

  it('the dropdowns are native buttons that open a menu with no description under each option', async () => {
    const { user } = await open('purchased', OWNED)
    await waitFor(ready)
    await user.click(trigger(ORIGIN))
    expect(await item('Collection')).not.toHaveTextContent('Uses a copy you own')
    expect(await item('New copy')).not.toHaveTextContent('Adds one to your collection')
    expect(await item('Unowned|Planned')).not.toHaveTextContent('Just on the list, no copy')
  })

  it('picking from the Card origin and Type menus changes the value', async () => {
    const { user } = await open('purchased', OWNED)
    await waitFor(ready)
    await pick(user, ORIGIN, 'Collection')
    await waitFor(() => expect(shown(ORIGIN)).toBe('Collection'))
    await pick(user, ORIGIN, 'New copy')
    await waitFor(() => expect(shown(ORIGIN)).toBe('New copy'))
    await pick(user, TYPE, 'Proxy')
    await waitFor(() => expect(shown(TYPE)).toBe('Proxy'))
    const proxyChip = screen.getByTestId('proxy-chip')
    expect(proxyChip.textContent).toBe('')
    expect(proxyChip).toHaveAttribute('aria-label', '1 proxy copy')
    expect(proxyChip.previousElementSibling).toHaveTextContent('SOS 146')
  })

  it('the controls wait while the collection is being checked', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/ownership') ? new Promise<Response>(() => {}) : json(PREVIEW)
    )
    const user = userEvent.setup()
    render(<ManaBoxDeckImportFlow intent="built" onComplete={() => {}} onCancel={() => {}} />, { wrapper: wrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['x'], 'deck.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByText(EMIL)).toBeInTheDocument())
    await user.click(trigger(ORIGIN))
    const collection = await item('Collection')
    expect(collection).toHaveAttribute('aria-disabled', 'true')
    expect(collection).toHaveTextContent('Checking your collection…')
  })

  it('a card you do not own: From collection is disabled and shows the reason', async () => {
    const { user } = await open('purchased', NOT_OWNED)
    await waitFor(ready)
    await user.click(trigger(ORIGIN))
    const collection = await item('Collection')
    expect(collection).toHaveAttribute('aria-disabled', 'true')
    expect(collection).toHaveTextContent('None left in your collection')
  })

  it('built, owned: starts From collection / Original; Proxy is disabled when only an original is owned', async () => {
    const { user } = await open('built', OWNED)
    await waitFor(ready)
    expect(shown(ORIGIN)).toBe('Collection')
    expect(shown(TYPE)).toBe('Original')
    await user.click(trigger(TYPE))
    const proxy = await item('Proxy')
    expect(proxy).toHaveAttribute('aria-disabled', 'true')
    expect(proxy).toHaveTextContent('A copy from your collection keeps its own type')
  })

  it('built, nothing owned: starts Unowned and Type waits for a card origin', async () => {
    const { user } = await open('built', NOT_OWNED)
    await waitFor(ready)
    expect(shown(ORIGIN)).toBe('Unowned')
    await user.click(trigger(TYPE))
    const original = await item('Original')
    expect(original).toHaveAttribute('aria-disabled', 'true')
    expect(original).toHaveTextContent('Choose a card origin first')
  })

  it('an owned card that is not used reads "Planned", not "Unowned"', async () => {
    const { user } = await open('built', OWNED)
    await waitFor(ready)
    await pick(user, ORIGIN, 'Planned')
    await waitFor(() => expect(shown(ORIGIN)).toBe('Planned'))
  })

  it('the row dropdown sets every copy; New copy -> Proxy is kept per copy', async () => {
    const { user } = await open('purchased', OWNED, TWO)
    await waitFor(ready)
    await pick(user, ORIGIN, 'Planned')
    expect(shown(ORIGIN)).toBe('Planned')
    await user.click(screen.getByRole('button', { name: `Edit ${EMIL}` }))
    expect(shown(`Copy 1 card origin for ${EMIL}`)).toBe('Planned')
    expect(shown(`Copy 2 card origin for ${EMIL}`)).toBe('Planned')
    await pick(user, `Copy 2 card origin for ${EMIL}`, 'New copy')
    await pick(user, `Copy 2 type for ${EMIL}`, 'Proxy')
    await waitFor(() => expect(shown(`Copy 2 type for ${EMIL}`)).toBe('Proxy'))
    expect(screen.getByTestId('proxy-chip').textContent).toBe('')
    expect(shown(`Copy 1 card origin for ${EMIL}`)).toBe('Planned')
  })

  it('the bulk bar keeps segmented Card origin and Type toggles', async () => {
    const { user } = await open('purchased', OWNED, TWO)
    await waitFor(ready)
    await user.click(screen.getByRole('checkbox', { name: 'Select all shown' }))
    const bulk = 'Set card origin for selected'
    expect(within(group(bulk)).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'No copy',
      'Collection',
      'New copy',
    ])
    await user.click(btn(bulk, 'Collection'))
    await waitFor(() => expect(shown(ORIGIN)).toBe('Collection'))
    await user.click(btn(bulk, 'New copy'))
    await user.click(btn('Set type for selected', 'Proxy'))
    expect(shown(ORIGIN)).toBe('New copy')
    expect(shown(TYPE)).toBe('Proxy')
  })
})

describe('Review list: planned decks', () => {
  it('show a plain Owned / Unowned status, with no dropdowns, no Type column and no bulk toggles', async () => {
    const { user } = await open('planned', OWNED)
    await waitFor(() => expect(screen.getByText('Owned')).toBeInTheDocument())
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.queryByText('Card origin')).toBeNull()
    expect(screen.queryByText('Type')).toBeNull()
    expect(screen.queryByRole('button', { name: ORIGIN })).toBeNull()
    expect(screen.queryByRole('button', { name: TYPE })).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: 'Select all shown' }))
    expect(screen.queryByRole('group', { name: 'Set card origin for selected' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Set type for selected' })).toBeNull()
  })

  it('a card you do not own shows Unowned', async () => {
    await open('planned', NOT_OWNED)
    await waitFor(() => expect(screen.getByText('Unowned')).toBeInTheDocument())
  })
})

describe('Review list: generic basics and maybeboard', () => {
  const G = 'Card origin for Island'

  it('generic basics get a Generic land / Unowned dropdown (purchased starts Generic land)', async () => {
    const { user } = await open('purchased', NOT_OWNED, WITH_ISLAND)
    expect(shown(G)).toBe('Generic land')
    await user.click(trigger(G))
    expect(await item('Generic land')).not.toHaveTextContent('Any basic, sleeved, not tracked')
    await user.click(await item('Unowned'))
    await waitFor(() => expect(shown(G)).toBe('Unowned'))
    // Other cards never offer Generic land.
    await user.click(trigger(ORIGIN))
    expect(screen.queryByRole('menuitem', { name: /Generic land/ })).toBeNull()
  })

  it('planned: generic basics show "Basic land" status', async () => {
    await open('planned', NOT_OWNED, WITH_ISLAND)
    expect(await screen.findByText('Basic land')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: G })).toBeNull()
  })

  it('maybeboard rows say they are not added or sleeved', async () => {
    await open('built', NOT_OWNED, MAYBE)
    expect(await screen.findByText('Not added or sleeved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Card origin for Arcane Signet' })).toBeNull()
  })
})

describe('Review footer: what blocks Import', () => {
  it('a short copy blocks Import, shows no note on the row, and clears once set to New copy', async () => {
    const { user } = await open('built', OWNED, TWO)
    expect(await screen.findByText('1 card needs a source.')).toBeInTheDocument()
    expect(importBtn()).toBeDisabled()
    await user.click(screen.getByRole('button', { name: `Edit ${EMIL}` }))
    expect(screen.queryByText(/pick None or New/)).toBeNull()
    expect(shown(`Copy 2 card origin for ${EMIL}`)).toBe('Collection')
    await pick(user, `Copy 2 card origin for ${EMIL}`, 'New copy')
    await waitFor(() => expect(screen.queryByText(/needs a source/)).toBeNull())
  })

  it('flag off: built decks are blocked with the coming-soon note', async () => {
    await open('built', OWNED)
    await waitFor(ready)
    expect(screen.getByText(/Saving built and planned decks is coming soon/)).toBeInTheDocument()
    expect(importBtn()).toBeDisabled()
  })

  it('flag off: a purchased deck with a non-New card is blocked until every card is New copy', async () => {
    const { user } = await open('purchased', OWNED)
    await waitFor(ready)
    expect(importBtn()).toBeEnabled()
    await pick(user, ORIGIN, 'Collection')
    expect(screen.getByText(/Set every card to New copy to import now/)).toBeInTheDocument()
    expect(importBtn()).toBeDisabled()
    await pick(user, ORIGIN, 'New copy')
    expect(importBtn()).toBeEnabled()
  })

  it('a copy held only by another deck shows Select source, then names the deck once picked', async () => {
    const { user } = await open('built', HELD([{ id: 7, name: 'Elves' }]))
    await waitFor(ready)
    expect(screen.queryByText(/Also in Elves/)).toBeNull()
    expect(shown(ORIGIN)).toBe('Select source')
    await user.click(trigger(ORIGIN))
    expect(await item('Elves')).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^(✓ )?From collection/ })).toBeNull()
    await user.click(await item('Elves'))
    await waitFor(() => expect(shown(ORIGIN)).toBe('Elves'))
  })

  it('planned decks show no ownership tags', async () => {
    await open('planned', HELD([{ id: 7, name: 'Elves' }]))
    expect(await screen.findByText('Owned')).toBeInTheDocument()
    expect(screen.queryByText(/Also in Elves/)).toBeNull()
  })

  it('flag on: one holder deck still needs a source; picking it is saved as an explicit pick', async () => {
    flag.on = true
    const { user, fetchSpy } = await open('built', HELD([{ id: 7, name: 'Elves' }]))
    await waitFor(ready)
    expect(importBtn()).toBeDisabled()
    await pick(user, ORIGIN, 'Elves')
    await waitFor(() => expect(importBtn()).toBeEnabled())
    await user.click(importBtn())
    await waitFor(() => expect(saveCall(fetchSpy)).toBeDefined())
    const body = JSON.parse(String((saveCall(fetchSpy)![1] as RequestInit).body))
    expect(body.copyEdits).toEqual({ 'emil|nonfoil': { 0: { source: 'collection', pick: { kind: 'deck', deckId: 7 } } } })
    expect(body.ignoreBasics).toBe(false)
  })

  it('flag on: several holder decks need a source; choosing one clears it', async () => {
    flag.on = true
    const { user } = await open('built', HELD([{ id: 7, name: 'Elves' }, { id: 8, name: 'Goblins' }]))
    expect(await screen.findByText('1 card needs a source.')).toBeInTheDocument()
    expect(shown(ORIGIN)).toBe('Select source')
    expect(importBtn()).toBeDisabled()
    await pick(user, ORIGIN, 'Goblins')
    await waitFor(() => expect(importBtn()).toBeEnabled())
    expect(shown(ORIGIN)).toBe('Goblins')
  })

  it('flag on: a purchased deck with a From collection card can import, and the save carries intent and source', async () => {
    flag.on = true
    const { user, fetchSpy } = await open('purchased', OWNED)
    await waitFor(ready)
    await pick(user, ORIGIN, 'Collection')
    expect(screen.queryByText(/Set every card to New/)).toBeNull()
    expect(importBtn()).toBeEnabled()
    await user.click(importBtn())
    await waitFor(() => expect(saveCall(fetchSpy)).toBeDefined())
    const body = JSON.parse(String((saveCall(fetchSpy)![1] as RequestInit).body))
    expect(body.intent).toBe('purchased')
    expect(body.copyEdits).toEqual({ 'emil|nonfoil': { 0: { source: 'collection', pick: { kind: 'spare' } } } })
  })

  it('flag off: the save request carries no source, Add, move or printing fields', async () => {
    const { user, fetchSpy } = await open('purchased', OWNED, TWO)
    await waitFor(ready)
    await pick(user, TYPE, 'Proxy')
    await user.click(importBtn())
    await waitFor(() => expect(saveCall(fetchSpy)).toBeDefined())
    const body = String((saveCall(fetchSpy)![1] as RequestInit).body)
    expect(body).not.toMatch(/"source"|"add"|"move"|"printing"|"intent"/)
  })
})
