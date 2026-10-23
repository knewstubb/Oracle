import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ManaBoxDeckImportFlow } from './ManaBoxDeckImportFlow'
import { ImportIntentChoice } from './ImportIntentChoice'
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

function wrapper() {
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('ImportIntentChoice', () => {
  it('starts with nothing selected and reports the choice', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ImportIntentChoice value={null} onChange={onChange} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(radios.some((r) => (r as HTMLInputElement).checked)).toBe(false)
    await user.click(radios[1])
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('shows the error only when asked', () => {
    const { rerender } = render(<ImportIntentChoice value={null} onChange={() => {}} />)
    expect(screen.queryByText('Choose one to continue.')).toBeNull()
    rerender(<ImportIntentChoice value={null} onChange={() => {}} showError />)
    expect(screen.getByText('Choose one to continue.')).toBeInTheDocument()
  })
})

function Harness({ initial }: { initial: ImportIntent | null }) {
  const [intent, setIntent] = useState<ImportIntent | null>(initial)
  return (
    <>
      <button onClick={() => setIntent('built')}>pick built</button>
      <ManaBoxDeckImportFlow intent={intent} onComplete={() => {}} onCancel={() => {}} />
    </>
  )
}

describe('ManaBoxDeckImportFlow with an intent', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('holds a file until an intent is chosen, then reads it', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/ownership') ? json({ rows: [] }) : json(PREVIEW)
    )
    render(<Harness initial={null} />, { wrapper: wrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['x'], 'deck.csv', { type: 'text/csv' }))
    expect(screen.getByText(/Choose one below/)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    await user.click(screen.getByText('pick built'))
    await waitFor(() => expect(screen.getByText('Emil, Vastlands Roamer')).toBeInTheDocument())
  })

  it('built: checks the collection (read-only POST), tags rows, and keeps Import disabled', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/ownership')
        ? json({
            rows: [
              {
                rowKey: 'emil|nonfoil',
                oracleId: 'emil-oracle',
                free: [{ printingId: 'emil-sf', setCode: 'sos', collectorNumber: '146', finish: 'nonfoil', isProxy: false, count: 1 }],
                held: [],
              },
            ],
          })
        : json(PREVIEW)
    )
    render(<Harness initial="built" />, { wrapper: wrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['x'], 'deck.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByText('Owned copy')).toBeInTheDocument())
    expect(screen.getByText(/to sleeve from your collection/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Import deck/i })).toBeDisabled()
    const ownershipCall = fetchSpy.mock.calls.find(([u]) => String(u).includes('/ownership'))!
    expect((ownershipCall[1] as RequestInit).method).toBe('POST')
  })

  it('built: shows a plain failure line with Try again when the check fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/ownership') ? json({ error: 'x' }, 500) : json(PREVIEW)
    )
    const user = userEvent.setup()
    render(<Harness initial="built" />, { wrapper: wrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['x'], 'deck.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByText(/Couldn't check your collection/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('purchased: no ownership check and Import is enabled', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => json(PREVIEW))
    render(<Harness initial="purchased" />, { wrapper: wrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['x'], 'deck.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByText('Emil, Vastlands Roamer')).toBeInTheDocument())
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/ownership'))).toBe(false)
    expect(screen.getByRole('button', { name: /Import deck/i })).toBeEnabled()
  })
})
