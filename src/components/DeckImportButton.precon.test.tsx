import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeckImportButton } from './DeckImportButton'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), info: vi.fn() } }))
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({ index: i, key: i, start: i * estimateSize(), end: (i + 1) * estimateSize(), size: estimateSize() })),
    getTotalSize: () => count * estimateSize(),
    measure: () => {},
  }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

const PRECON = {
  id: '11111111-2222-3333-4444-555555555555',
  name: 'Eldrazi Unbound',
  set_code: 'c24',
  set_name: 'Commander 2024',
  commander_name: 'Ulalek',
  color_identity: 'C',
  release_date: '2024-01-01',
  card_count: 2,
  commander_image: null,
}

function open() {
  render(<DeckImportButton />, { wrapper })
  fireEvent.click(screen.getByRole('button', { name: /import deck/i }))
}

beforeEach(() => vi.restoreAllMocks())

describe('DeckImportButton first-screen order', () => {
  it('shows the source tabs first and the deck-intent choice below them', async () => {
    open()
    const tabs = await screen.findByRole('button', { name: 'URL' })
    const question = screen.getByText("What's this deck?")
    expect(tabs.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Precon keeps the intent choice, preset to "I bought it" and locked, and does not offer the others', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(json({ precons: [], setup: false }))
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Precon' }))
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios).toHaveLength(3)
    expect(radios[0].checked).toBe(true)
    expect(radios[0].disabled).toBe(false)
    expect(radios[1].disabled && radios[2].disabled).toBe(true)
    expect(screen.queryByText(/always something you bought/)).toBeNull()
    expect(screen.getByText("What's this deck?")).toBeInTheDocument()
  })
})

describe('Precon tab', () => {
  it('says "Precons not set up yet" when the list is not set up', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(json({ precons: [], setup: false }))
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Precon' }))
    expect(await screen.findByText('Precons not set up yet')).toBeInTheDocument()
  })

  it('opens a chosen precon in the review as a CSV, no intent needed', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.startsWith('/api/precons?')) return json({ precons: [PRECON], setup: true })
      if (url.startsWith('/api/precons/'))
        return json({
          precon: {
            ...PRECON,
            cards: [
              { name: 'Ulalek', set_code: 'c24', number: '1', foil: false, count: 1, commander: true },
              { name: 'Sol Ring', set_code: 'c24', number: '2', foil: false, count: 1, commander: false },
            ],
          },
        })
      if (url.includes('/preview')) {
        void init
        return json({ fileName: 'x', totalLines: 0, rows: [], unmatched: [], skippedTokens: [] })
      }
      return json({})
    })
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Precon' }))
    fireEvent.click(await screen.findByText('Eldrazi Unbound'))
    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(([u]) => String(u).includes('/preview'))
      expect(call).toBeDefined()
      const body = JSON.parse(call![1]!.body as string)
      expect(body.fileName).toBe('Eldrazi Unbound.csv')
      expect(body.csvContent).toContain('Sol Ring')
      expect(body.csvContent).toContain('Collector number')
    })
  })
})
