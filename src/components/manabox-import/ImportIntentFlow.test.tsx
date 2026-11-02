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

const SOL = {
  ...PREVIEW.rows[0],
  rowKey: 'sol|nonfoil',
  sourceIndex: 3,
  sourceLines: [3],
  cardName: 'Sol Ring',
  scryfallId: 'sol-sf',
  oracleId: 'sol-oracle',
  copies: [{ index: 0, sourceLine: 3, file: { finish: 'nonfoil' }, owner: {} }],
}
const PREVIEW2 = { ...PREVIEW, rows: [...PREVIEW.rows, SOL] }
const EMIL_FREE = {
  rowKey: 'emil|nonfoil',
  oracleId: 'emil-oracle',
  free: [{ printingId: 'emil-sf', setCode: 'sos', collectorNumber: '146', finish: 'nonfoil', isProxy: false, count: 1 }],
  held: [],
}
const OWN_HALF = { rows: [EMIL_FREE, { rowKey: 'sol|nonfoil', oracleId: 'sol-oracle', free: [], held: [] }] }
const OWN_NONE = {
  rows: [
    { rowKey: 'emil|nonfoil', oracleId: 'emil-oracle', free: [], held: [] },
    { rowKey: 'sol|nonfoil', oracleId: 'sol-oracle', free: [], held: [] },
  ],
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

  it('shows the numbers and the headline; the suggestion is only pre-selected (no reason text)', () => {
    render(
      <ImportIntentChoice
        value="built"
        onChange={() => {}}
        stats={{ purchased: '2 new copies', built: '1 from collection', planned: '2 not in deck' }}
        headline="You own 1 of the 2 cards."
        suggestion={{ value: 'built', reason: 'suggested: you own most of these cards' }}
      />
    )
    expect(screen.getByText('You own 1 of the 2 cards.')).toBeInTheDocument()
    expect(screen.getByText('1 from collection')).toBeInTheDocument()
    expect(screen.queryByText(/suggested/)).toBeNull()
    expect(screen.getByRole('radio', { name: /I built it/ })).toBeChecked()
  })

  it('disabled: every choice is greyed out and says numbers come once the deck has loaded', () => {
    render(<ImportIntentChoice value={null} onChange={() => {}} disabled />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    radios.forEach((r) => expect(r).toBeDisabled())
    expect(screen.getAllByText('Numbers appear once the deck has loaded')).toHaveLength(3)
  })

  it('shows the error only when asked', () => {
    const { rerender } = render(<ImportIntentChoice value={null} onChange={() => {}} />)
    expect(screen.queryByText('Choose one to continue.')).toBeNull()
    rerender(<ImportIntentChoice value={null} onChange={() => {}} showError />)
    expect(screen.getByText('Choose one to continue.')).toBeInTheDocument()
  })
})

function Harness({
  initial,
  precon,
  onIntent,
  onCancel = () => {},
}: {
  initial: ImportIntent | null
  precon?: boolean
  onIntent?: (i: ImportIntent | null) => void
  onCancel?: () => void
}) {
  const [intent, setIntent] = useState<ImportIntent | null>(initial)
  return (
    <ManaBoxDeckImportFlow
      intent={intent}
      precon={precon}
      onIntentChange={(i) => {
        onIntent?.(i)
        setIntent(i)
      }}
      onComplete={() => {}}
      onCancel={onCancel}
    />
  )
}

async function load(ownership: unknown, preview: unknown = PREVIEW2, props: Partial<Parameters<typeof Harness>[0]> = {}) {
  const user = userEvent.setup()
  const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) =>
    String(input).includes('/ownership') ? json(ownership) : json(preview)
  )
  render(<Harness initial={null} {...props} />, { wrapper: wrapper() })
  await user.upload(screen.getByLabelText('Choose file'), new File(['x'], 'deck.csv', { type: 'text/csv' }))
  return { user, fetchSpy }
}

const radio = (name: RegExp) => screen.getByRole('radio', { name })

describe("What's this deck? (after the deck loads)", () => {
  beforeEach(() => vi.restoreAllMocks())

  it('reads the file without an intent, then asks with real numbers and a suggestion', async () => {
    const { fetchSpy } = await load(OWN_HALF)
    await waitFor(() => expect(screen.getByText(/You own 1 of the 2 cards/)).toBeInTheDocument())
    expect(screen.getByText(/2 cards · 2 different cards/)).toBeInTheDocument()
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/preview'))).toBe(true)
    expect(radio(/I built it/)).toBeChecked()
    expect(screen.queryByText(/\(suggested/)).toBeNull()
    expect(radio(/I built it/)).toHaveAccessibleName(/1 from collection/)
    expect(radio(/I bought it/)).toHaveAccessibleName(/2 new copies/)
    expect(radio(/I'm planning it/)).toHaveAccessibleName(/2 not in deck/)
    // The review list is not shown yet.
    expect(screen.queryByRole('button', { name: /Import deck/i })).toBeNull()
  })

  it('before a file is chosen the choices are shown but disabled, and Continue is disabled', () => {
    vi.spyOn(global, 'fetch')
    render(<Harness initial={null} />, { wrapper: wrapper() })
    expect(screen.getByLabelText('Choose file')).toBeInTheDocument()
    expect(screen.getByText("What's this deck?")).toBeInTheDocument()
    screen.getAllByRole('radio').forEach((r) => {
      expect(r).toBeDisabled()
      expect(r).not.toBeChecked()
    })
    expect(screen.getAllByText('Numbers appear once the deck has loaded')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('while the file is read the spinner shows above the still-disabled choices; then they enable', async () => {
    let finishPreview: (r: Response) => void = () => {}
    vi.spyOn(global, 'fetch').mockImplementation((input) =>
      String(input).includes('/ownership')
        ? Promise.resolve(json(OWN_HALF))
        : new Promise<Response>((resolve) => {
            finishPreview = resolve
          })
    )
    const user = userEvent.setup()
    render(<Harness initial={null} />, { wrapper: wrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['x'], 'deck.csv', { type: 'text/csv' }))
    expect(await screen.findByText('Processing deck list…')).toBeInTheDocument()
    const spinner = screen.getByText('Processing deck list…')
    const question = screen.getByText("What's this deck?")
    expect(spinner.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    finishPreview(json(PREVIEW2))
    await waitFor(() => expect(radio(/I built it/)).toBeChecked())
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeEnabled())
    expect(screen.queryByText('Processing deck list…')).toBeNull()
    expect(screen.queryByText('Numbers appear once the deck has loaded')).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it("suggests I'm planning it when you own few of the cards", async () => {
    await load(OWN_NONE)
    await waitFor(() => expect(radio(/I'm planning it/)).toBeChecked())
    expect(radio(/I bought it/)).toBeEnabled()
  })

  it('Continue uses the suggestion; Back on the review returns to the question', async () => {
    const onIntent = vi.fn()
    const { user } = await load(OWN_HALF, PREVIEW2, { onIntent })
    await waitFor(() => expect(radio(/I built it/)).toBeChecked())
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onIntent).toHaveBeenLastCalledWith('built')
    await waitFor(() => expect(screen.getByRole('button', { name: /Import deck/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(onIntent).toHaveBeenLastCalledWith(null)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Import deck/i })).toBeNull()
  })

  it('Continue uses the option the owner picks instead', async () => {
    const onIntent = vi.fn()
    const { user } = await load(OWN_HALF, PREVIEW2, { onIntent })
    await waitFor(() => expect(radio(/I built it/)).toBeChecked())
    await user.click(radio(/I bought it/))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onIntent).toHaveBeenLastCalledWith('purchased')
  })

  it('Cancel on the question cancels the import', async () => {
    const onCancel = vi.fn()
    const { user } = await load(OWN_HALF, PREVIEW2, { onCancel })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('a precon suggests I bought it but built and planned stay open', async () => {
    const onIntent = vi.fn()
    const { user } = await load(OWN_HALF, PREVIEW2, { precon: true, onIntent })
    await waitFor(() => expect(radio(/I bought it/)).toBeChecked())
    expect(radio(/I built it/)).toBeEnabled()
    expect(radio(/I'm planning it/)).toBeEnabled()
    await user.click(radio(/I'm planning it/))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onIntent).toHaveBeenLastCalledWith('planned')
  })
})

describe('ManaBoxDeckImportFlow with an intent', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('built: checks the collection (read-only POST), uses the owned copy, and keeps Import disabled (save flag off)', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/ownership') ? json({ rows: [EMIL_FREE] }) : json(PREVIEW)
    )
    render(<Harness initial="built" />, { wrapper: wrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['x'], 'deck.csv', { type: 'text/csv' }))
    const origin = await screen.findByRole('button', { name: 'Card origin for Emil, Vastlands Roamer' })
    await waitFor(() => expect(origin).toHaveTextContent('From collection'))
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

  it('purchased: every card New, so Import is enabled', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/ownership') ? json({ rows: [EMIL_FREE] }) : json(PREVIEW)
    )
    render(<Harness initial="purchased" />, { wrapper: wrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['x'], 'deck.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByText('Emil, Vastlands Roamer')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: /Import deck/i })).toBeEnabled())
  })
})
