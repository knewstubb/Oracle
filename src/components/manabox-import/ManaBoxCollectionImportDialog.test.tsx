import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ManaBoxCollectionImportDialog } from './ManaBoxCollectionImportDialog'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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
  fileName: 'scan.csv',
  totalLines: 2,
  rows: [
    {
      rowKey: 'abc|nonfoil|en',
      sourceIndex: 2,
      sourceLines: [2],
      cardName: 'Sol Ring',
      setCode: 'c21',
      collectorNumber: '263',
      scryfallId: 'abc',
      oracleId: 'def',
      qty: 1,
      availableFinishes: ['nonfoil', 'foil'],
      copies: [{ index: 0, sourceLine: 2, file: { finish: 'nonfoil', condition: 'near_mint', language: 'en' }, owner: {} }],
      isBasicLand: false,
    },
    {
      rowKey: 'xyz|nonfoil|en',
      sourceIndex: 3,
      sourceLines: [3],
      cardName: 'Island',
      setCode: 'sos',
      collectorNumber: '268',
      scryfallId: 'xyz',
      oracleId: 'uvw',
      qty: 3,
      availableFinishes: ['nonfoil', 'foil'],
      copies: [0, 1, 2].map((index) => ({ index, sourceLine: 3, file: { finish: 'nonfoil', condition: 'near_mint', language: 'en' }, owner: {} })),
      isBasicLand: true,
    },
  ],
  skippedTokens: [],
  unmatched: [],
  notices: { unrecognisedCondition: 0, unrecognisedLanguage: 0, unrecognisedFinish: 0 },
}

describe('ManaBoxCollectionImportDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('opens from the open prop', () => {
    render(<ManaBoxCollectionImportDialog open onOpenChange={() => {}} />, {
      wrapper: createWrapper(),
    })
    expect(screen.getByText(/Import collection/i)).toBeInTheDocument()
    expect(screen.getByText(/ManaBox \.csv/i)).toBeInTheDocument()
  })

  it('moves to review after a file is selected', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(PREVIEW_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    render(<ManaBoxCollectionImportDialog open onOpenChange={() => {}} />, {
      wrapper: createWrapper(),
    })

    const file = new File(['name,header'], 'scan.csv', { type: 'text/csv' })
    const input = screen.getByLabelText('Choose file')
    await user.upload(input, file)

    await waitFor(() => {
      expect(screen.getByText('Sol Ring')).toBeInTheDocument()
      expect(screen.getByText('Island')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /Add 4/i })).toBeInTheDocument()
  })

  it('sends the defaults and the owner edits (no proxy counts) on import', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PREVIEW_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ inserted: 4, skipped: 0, removed: 0, sourceTag: 'manabox', errors: [], unmatched: [], durationMs: 10 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

    render(<ManaBoxCollectionImportDialog open onOpenChange={() => {}} />, {
      wrapper: createWrapper(),
    })

    const file = new File(['name,header'], 'scan.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText('Choose file'), file)

    await waitFor(() => expect(screen.getByText('Sol Ring')).toBeInTheDocument())

    // Open Sol Ring and make its one copy a proxy.
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sol Ring' }))
    const type = screen.getByRole('group', { name: 'Copy 1 type' })
    fireEvent.click(within(type).getByRole('button', { name: 'Proxy' }))

    fireEvent.click(screen.getByRole('button', { name: /Add 4/i }))

    await waitFor(() => {
      expect(screen.getByText(/Collection updated/i)).toBeInTheDocument()
    })

    const importCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('/api/collection/import?mode=manabox'))
    expect(importCall).toBeDefined()
    const body = JSON.parse(importCall![1]!.body as string)
    expect(body.proxyCounts).toBeUndefined()
    expect(body.defaults).toEqual({ finish: 'nonfoil', condition: 'near_mint', language: 'en' })
    expect(body.copyEdits['abc|nonfoil|en']).toEqual({ 0: { type: 'proxy' } })
  })
})
