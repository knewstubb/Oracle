import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ManaBoxDeckImportFlow } from './ManaBoxDeckImportFlow'

const push = vi.fn()

vi.mock('./use-printing-languages', () => ({
  usePrintingLanguages: () => ({ status: 'done', languages: ['en', 'ja', 'de'] }),
  clearPrintingLanguageCache: () => {},
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const PREVIEW_RESPONSE = {
  fileName: 'Strix draft.csv',
  totalLines: 65,
  rows: [
    {
      rowKey: 'emil-sf|nonfoil',
      sourceIndex: 2,
      sourceLines: [2],
      cardName: 'Emil, Vastlands Roamer',
      setCode: 'sos',
      collectorNumber: '146',
      scryfallId: 'emil-sf',
      oracleId: 'emil-oracle',
      qty: 1,
      availableFinishes: ['nonfoil', 'foil'],
      copies: Array.from({ length: 1 }, (_, index) => ({ index, sourceLine: 2, file: { finish: 'nonfoil' }, owner: {} })),
      isBasicLand: false,
    },
    {
      rowKey: 'pull-sf|nonfoil',
      sourceIndex: 3,
      sourceLines: [3],
      cardName: 'Pull from the Grave',
      setCode: 'sos',
      collectorNumber: '95',
      scryfallId: 'pull-sf',
      oracleId: 'pull-oracle',
      qty: 2,
      availableFinishes: ['nonfoil', 'foil'],
      copies: Array.from({ length: 2 }, (_, index) => ({ index, sourceLine: 3, file: { finish: 'nonfoil' }, owner: {} })),
      isBasicLand: false,
    },
    {
      rowKey: 'swamp-sf|nonfoil',
      sourceIndex: 4,
      sourceLines: [4],
      cardName: 'Swamp',
      setCode: 'sos',
      collectorNumber: '276',
      scryfallId: 'swamp-sf',
      oracleId: 'swamp-oracle',
      qty: 2,
      availableFinishes: ['nonfoil', 'foil'],
      copies: Array.from({ length: 2 }, (_, index) => ({ index, sourceLine: 4, file: { finish: 'nonfoil' }, owner: {} })),
      isBasicLand: true,
    },
  ],
  skippedTokens: [{ sourceIndex: 5, rawLine: 'Drake (TFDN) 8', cardName: 'Drake' }],
  unmatched: [],
  notices: { unrecognisedCondition: 0, unrecognisedLanguage: 0, unrecognisedFinish: 0 },
}

describe('ManaBoxDeckImportFlow', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
    vi.spyOn(Object.getPrototypeOf(window.sessionStorage), 'setItem').mockImplementation(() => {})
  })

  it('shows the file picker initially', () => {
    render(<ManaBoxDeckImportFlow onComplete={() => {}} onCancel={() => {}} />, {
      wrapper: createWrapper(),
    })
    expect(screen.getByText(/\.csv or \.txt/i)).toBeInTheDocument()
  })

  it('moves to review and shows controls for deck rows', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(PREVIEW_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    render(<ManaBoxDeckImportFlow onComplete={() => {}} onCancel={() => {}} />, {
      wrapper: createWrapper(),
    })

    const file = new File(['name,header'], 'Strix draft.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText('Choose file'), file)

    await waitFor(() => {
      expect(screen.getByText('Emil, Vastlands Roamer')).toBeInTheDocument()
      expect(screen.getByText('Pull from the Grave')).toBeInTheDocument()
    })

    expect(screen.getByText(/1 token skipped/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Import/i })).toBeInTheDocument()
  })

  it('sends per-copy file values, edits, defaults and the generic-basics flag', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url === '/api/decks/import/preview') return json(PREVIEW_RESPONSE)
      if (url === '/api/decks/import') {
        return json({ deckId: 12345, allocationSummary: { assigned: 3, shortfall: 0, errors: [], unmatched: [] } })
      }
      return json({ decks: [] })
    })

    render(<ManaBoxDeckImportFlow onComplete={onComplete} onCancel={() => {}} />, {
      wrapper: createWrapper(),
    })

    const file = new File(['name,header'], 'Strix draft.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText('Choose file'), file)

    await waitFor(() => expect(screen.getByText('Pull from the Grave')).toBeInTheDocument())

    // Open the two-copy row and make copy 2 a proxy.
    fireEvent.click(screen.getByRole('button', { name: 'Edit Pull from the Grave' }))
    const copy2 = within(screen.getByRole('group', { name: 'Copy 2 of 2' }))
    fireEvent.click(copy2.getByRole('button', { name: 'Proxy' }))

    fireEvent.click(screen.getByRole('button', { name: /Import/i }))

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled()
    })

    const importCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url) === '/api/decks/import')
    expect(importCall).toBeDefined()
    const body = JSON.parse(importCall![1]!.body as string)
    expect(body.convertBasicLandsToGeneric).toBeUndefined()
    const pull = body.deck.cards.find((c: { cardName: string }) => c.cardName === 'Pull from the Grave')
    expect(pull.rowKey).toBe('pull-sf|nonfoil')
    expect(pull.copies).toHaveLength(2)
    expect(pull.copies[0].file).toEqual({ finish: 'nonfoil' })
    expect(pull.rowSplit).toBeUndefined()
    expect(body.defaults).toEqual({ finish: 'nonfoil', condition: 'near_mint', language: 'en' })
    expect(body.copyEdits['pull-sf|nonfoil']).toEqual({ 1: { type: 'proxy' } })
  })

  it('has no commander picker on the result screen; Close only closes, Open deck is the one way to the deck', async () => {
    const onFinish = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/preview')) return json(PREVIEW_RESPONSE)
      if (url === '/api/decks/import') return json({ deckId: 77, allocationSummary: { assigned: 3, shortfall: 0, errors: [], unmatched: [] } })
      return json({})
    })
    render(<ManaBoxDeckImportFlow onFinish={onFinish} onClose={onClose} onCancel={() => {}} />, { wrapper: createWrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['name,header'], 'd.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByText('Pull from the Grave')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Import deck/i }))
    expect(await screen.findByText(/No commander yet/)).toBeInTheDocument()
    expect(screen.queryByText('Choose a commander')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onFinish).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Open deck/i }))
    expect(onFinish).toHaveBeenCalledWith(77)
  })
})
