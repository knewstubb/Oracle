import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ManaBoxDeckImportFlow } from './ManaBoxDeckImportFlow'
import type { ImportIntent } from '../../../docs/oracle/contracts/import-intent.types'

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

const addTick = () => screen.getAllByRole('checkbox', { name: /Add .*to collection/i })[0]
// The tick is a styled span, so "waiting" shows as aria-disabled, not the disabled attribute.
const tickReady = () => expect(addTick()).not.toHaveAttribute('aria-disabled', 'true')

describe('Add to collection tick (review)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('I bought it: ticked by default and Import stays enabled', async () => {
    await open('purchased', OWNED, TWO)
    await waitFor(tickReady)
    expect(addTick()).toBeChecked()
    expect(screen.getByRole('button', { name: /Import deck/i })).toBeEnabled()
  })

  it('built: unticked by default and Import is disabled with the note', async () => {
    await open('built', OWNED, TWO)
    await waitFor(tickReady)
    expect(addTick()).not.toBeChecked()
    expect(screen.getByRole('button', { name: /Import deck/i })).toBeDisabled()
  })

  it('planned: no Add tick is shown (nothing can be added)', async () => {
    await open('planned', OWNED, TWO)
    await waitFor(() => expect(screen.getByRole('button', { name: /Import deck/i })).toBeInTheDocument())
    expect(screen.queryAllByRole('checkbox', { name: /Add .*to collection/i })).toHaveLength(0)
  })

  it('I bought it: unticking Add disables Import until it is ticked again', async () => {
    const { user } = await open('purchased', OWNED, TWO)
    await waitFor(tickReady)
    await user.click(addTick())
    expect(addTick()).not.toBeChecked()
    expect(screen.getByRole('button', { name: /Import deck/i })).toBeDisabled()
    await user.click(addTick())
    expect(screen.getByRole('button', { name: /Import deck/i })).toBeEnabled()
  })

  it('the tick waits while the collection is being checked', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/ownership') ? new Promise<Response>(() => {}) : json(TWO)
    )
    const user = userEvent.setup()
    render(<ManaBoxDeckImportFlow intent="built" onComplete={() => {}} onCancel={() => {}} />, { wrapper: wrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['x'], 'deck.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByText('Emil, Vastlands Roamer')).toBeInTheDocument())
    expect(addTick()).toHaveAttribute('aria-disabled', 'true')
  })

  it('built, nothing owned: the Add tick starts unticked and no flow change is saved', async () => {
    await open('built', NOT_OWNED, TWO)
    await waitFor(tickReady)
    expect(addTick()).not.toBeChecked()
  })
})

describe('Single-copy rows (review)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows no Add checkbox; a card you do not own offers Original / Proxy / Unowned, never Unsleeved', async () => {
    const { user } = await open('built', NOT_OWNED)
    await waitFor(() => expect(screen.queryByText('Checking your collection…')).toBeNull())
    expect(screen.queryAllByRole('checkbox', { name: /to collection/i })).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: /Edit Emil/ }))
    expect(screen.getByRole('button', { name: 'Unowned' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unsleeved' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Proxy' })).not.toBeDisabled()
  })

  it('an owned card keeps the word Unsleeved', async () => {
    const { user } = await open('built', OWNED)
    await waitFor(() => expect(screen.queryByText('Checking your collection…')).toBeNull())
    await user.click(screen.getByRole('button', { name: /Edit Emil/ }))
    expect(screen.getByRole('button', { name: 'Unsleeved' })).toBeInTheDocument()
  })

  it('choosing Proxy on a not-owned card adds it; Import for I bought it stays enabled', async () => {
    const { user } = await open('purchased', NOT_OWNED)
    await waitFor(() => expect(screen.queryByText('Checking your collection…')).toBeNull())
    await user.click(screen.getByRole('button', { name: /Edit Emil/ }))
    await user.click(screen.getByRole('button', { name: 'Unowned' }))
    expect(screen.getByRole('button', { name: /Import deck/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Proxy' }))
    expect(screen.getByRole('button', { name: /Import deck/i })).toBeEnabled()
  })
})

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

describe('Inline choices (review)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('one other deck holds the copy: it is pre-picked and Skip is offered', async () => {
    const { user } = await open('built', HELD([{ id: 7, name: 'Elves' }]))
    await user.click(await screen.findByRole('button', { name: /Edit Emil/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Elves' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Elves' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Skip' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('several decks hold it: none is pre-picked; choosing one and Skip both work', async () => {
    const { user } = await open(
      'built',
      HELD([
        { id: 7, name: 'Elves' },
        { id: 8, name: 'Goblins' },
      ])
    )
    await user.click(await screen.findByRole('button', { name: /Edit Emil/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Goblins' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Elves' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Goblins' }))
    expect(screen.getByRole('button', { name: 'Goblins' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByRole('button', { name: 'Skip' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Goblins' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('owned in another printing: the row shows the usual Add tick and a note when opened', async () => {
    const { user } = await open('built', {
      rows: [
        {
          rowKey: 'emil|nonfoil',
          oracleId: 'emil-oracle',
          free: [{ printingId: 'other-sf', setCode: 'cmm', collectorNumber: '410', finish: 'nonfoil', isProxy: false, count: 1 }],
          held: [],
        },
      ],
    })
    const tick = await screen.findByRole('checkbox', { name: /Add Emil/ })
    expect(tick).not.toBeChecked()
    await user.click(await screen.findByRole('button', { name: /Edit Emil/ }))
    expect(await screen.findByText(/you own/i)).toHaveTextContent(/CMM 410/i)
    await user.click(tick)
    expect(tick).toBeChecked()
  })

  it('the save request carries no Add, move or printing fields', async () => {
    const { user, fetchSpy } = await open('purchased', OWNED, TWO)
    await waitFor(tickReady)
    await user.click(screen.getByRole('button', { name: /Import deck/i }))
    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/api/decks/import') && !String(u).includes('ownership') && !String(u).includes('preview'))).toBe(true)
    )
    const call = fetchSpy.mock.calls.find(
      ([u]) => String(u).includes('/api/decks/import') && !String(u).includes('ownership') && !String(u).includes('preview')
    )!
    const body = String((call[1] as RequestInit).body)
    expect(body).not.toMatch(/"add"|"move"|"printing"/)
  })
})
