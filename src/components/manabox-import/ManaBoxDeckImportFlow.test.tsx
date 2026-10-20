import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ManaBoxDeckImportFlow } from './ManaBoxDeckImportFlow'

const push = vi.fn()

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
      sourceIndex: 2,
      sourceLines: [2],
      cardName: 'Emil, Vastlands Roamer',
      setCode: 'sos',
      collectorNumber: '146',
      scryfallId: 'emil-sf',
      oracleId: 'emil-oracle',
      qty: 1,
      finish: 'nonfoil',
      isBasicLand: false,
    },
    {
      sourceIndex: 3,
      sourceLines: [3],
      cardName: 'Pull from the Grave',
      setCode: 'sos',
      collectorNumber: '95',
      scryfallId: 'pull-sf',
      oracleId: 'pull-oracle',
      qty: 2,
      finish: 'nonfoil',
      isBasicLand: false,
    },
    {
      sourceIndex: 4,
      sourceLines: [4],
      cardName: 'Swamp',
      setCode: 'sos',
      collectorNumber: '276',
      scryfallId: 'swamp-sf',
      oracleId: 'swamp-oracle',
      qty: 2,
      finish: 'nonfoil',
      isBasicLand: true,
    },
  ],
  skippedTokens: [{ sourceIndex: 5, rawLine: 'Drake (TFDN) 8', cardName: 'Drake' }],
  unmatched: [],
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
    expect(screen.getByText(/ManaBox \.csv or \.txt/i)).toBeInTheDocument()
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

  it('sends row splits and generic-basics flag on import', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PREVIEW_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deckId: 12345, allocationSummary: { assigned: 3, shortfall: 0, errors: [], unmatched: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

    render(<ManaBoxDeckImportFlow onComplete={onComplete} onCancel={() => {}} />, {
      wrapper: createWrapper(),
    })

    const file = new File(['name,header'], 'Strix draft.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText('Choose file'), file)

    await waitFor(() => expect(screen.getByText('Pull from the Grave')).toBeInTheDocument())

    // The stepper is always visible on 2+ copy rows: make 1 of the 2 copies a proxy
    const proxyStepper = within(screen.getByRole('group', { name: /Pull from the Grave are proxies/ }))
    fireEvent.click(proxyStepper.getByRole('button', { name: 'More proxies' }))

    fireEvent.click(screen.getByRole('button', { name: /Import/i }))

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled()
    })

    const importCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url) === '/api/decks/import')
    expect(importCall).toBeDefined()
    const body = JSON.parse(importCall![1]!.body as string)
    expect(body.convertBasicLandsToGeneric).toBe(true)
    const pull = body.deck.cards.find((c: { cardName: string }) => c.cardName === 'Pull from the Grave')
    expect(pull.rowSplit.proxyCount).toBe(1)
    expect(pull.rowSplit.originalCount).toBe(1)
  })
})
