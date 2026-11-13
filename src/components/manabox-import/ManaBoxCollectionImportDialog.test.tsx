import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ManaBoxCollectionImportDialog } from './ManaBoxCollectionImportDialog'

const toastSuccess = vi.hoisted(() => vi.fn())
vi.mock('./destinations-client', () => ({
  fetchImportDestinations: vi.fn().mockResolvedValue({ unsorted: { locationId: 1 }, storage: [], decks: [] }),
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))

vi.mock('./use-printing-languages', () => ({
  usePrintingLanguages: () => ({ status: 'done', languages: ['en', 'ja', 'de'] }),
  clearPrintingLanguageCache: () => {},
}))

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
    expect(screen.getByText(/Import cards/i)).toBeInTheDocument()
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

    expect(screen.getByRole('button', { name: /Import cards/i })).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: 'Import cards' }))

    await waitFor(() => {
      expect(screen.getByText(/copies added/)).toBeInTheDocument()
    })

    const importCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('/api/collection/import?mode=manabox'))
    expect(importCall).toBeDefined()
    const body = JSON.parse(importCall![1]!.body as string)
    expect(body.proxyCounts).toBeUndefined()
    expect(body.defaults).toEqual({ finish: 'nonfoil', condition: 'near_mint', language: 'en' })
    expect(body.copyEdits['abc|nonfoil|en']).toEqual({ 0: { type: 'proxy' } })
  })
  it('shows "N cards (M copies)" in the header and copies in the footer', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(PREVIEW_RESPONSE), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    render(<ManaBoxCollectionImportDialog open onOpenChange={() => {}} />, { wrapper: createWrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['name,header\nx'], 'scan.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByText('Sol Ring')).toBeInTheDocument())
    expect(screen.getByText(/2 cards \(4 copies\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import cards' })).toBeInTheDocument()
  })

  it('does not close when the user clicks outside the dialog', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<ManaBoxCollectionImportDialog open onOpenChange={onOpenChange} />, { wrapper: createWrapper() })
    await user.click(document.body)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByText('Import cards')).toBeInTheDocument()
  })

  it('reads streamed progress and shows a result plus a toast', async () => {
    const user = userEvent.setup()
    const lines = [
      { type: 'progress', phase: 'resolving', done: 2, total: 4 },
      { type: 'progress', phase: 'writing', done: 0, total: 4 },
      { type: 'complete', summary: { inserted: 4, skipped: 0, removed: 0, sourceTag: 'manabox', errors: [], unmatched: [], durationMs: 5 } },
    ].map((e) => JSON.stringify(e) + '\n').join('')
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PREVIEW_RESPONSE), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(new Response(lines, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }))
    render(<ManaBoxCollectionImportDialog open onOpenChange={() => {}} />, { wrapper: createWrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['name,header\nx'], 'scan.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByText('Sol Ring')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Import cards' }))
    await waitFor(() => expect(screen.getByText(/copies added/)).toBeInTheDocument())
    expect(screen.getByText(/4 copies added/)).toBeInTheDocument()
    expect(toastSuccess).toHaveBeenCalledWith('Added 4 copies to your collection')
  })
  it('keeps the same fixed modal size in every stage', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(PREVIEW_RESPONSE), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    render(<ManaBoxCollectionImportDialog open onOpenChange={() => {}} />, { wrapper: createWrapper() })
    const size = () => document.querySelector('[data-slot="dialog-content"]')!.className
    const idle = size()
    expect(idle).toContain('h-[calc(100dvh-4rem)]')
    await user.upload(screen.getByLabelText('Choose file'), new File(['name,header\nx'], 'scan.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByText('Sol Ring')).toBeInTheDocument())
    expect(size()).toBe(idle)
  })

  it('cannot be cancelled or closed while the save runs, and Add only sends once', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const spy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PREVIEW_RESPONSE), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockImplementation(() => new Promise<Response>(() => {}))
    render(<ManaBoxCollectionImportDialog open onOpenChange={onOpenChange} />, { wrapper: createWrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['name,header\nx'], 'scan.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByText('Sol Ring')).toBeInTheDocument())
    const add = screen.getByRole('button', { name: 'Import cards' })
    fireEvent.click(add)
    fireEvent.click(add)
    await waitFor(() => expect(screen.getByText('Adding to your collection…')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Cancel import' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(document.body)
    const x = screen.queryByRole('button', { name: /close/i })
    if (x) await user.click(x)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByText('Adding to your collection…')).toBeInTheDocument()
    expect(screen.queryByText('Sol Ring')).not.toBeInTheDocument()
    expect(spy.mock.calls.filter(([url]) => String(url).includes('/api/collection/import?mode=manabox'))).toHaveLength(1)
  })

  const previewThenReview = async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(PREVIEW_RESPONSE), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    const onOpenChange = vi.fn()
    render(<ManaBoxCollectionImportDialog open onOpenChange={onOpenChange} />, { wrapper: createWrapper() })
    await user.upload(screen.getByLabelText('Choose file'), new File(['name,header\nx'], 'scan.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByText('Sol Ring')).toBeInTheDocument())
    return { user, onOpenChange }
  }

  it('ignores Escape on the upload screen and on the review list', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(PREVIEW_RESPONSE), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    render(<ManaBoxCollectionImportDialog open onOpenChange={onOpenChange} />, { wrapper: createWrapper() })
    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    await user.upload(screen.getByLabelText('Choose file'), new File(['name,header\nx'], 'scan.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByText('Sol Ring')).toBeInTheDocument())
    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByText('Sol Ring')).toBeInTheDocument()
  })

  it('asks "Discard edits?" in the app, not a browser box, when X is pressed after an edit', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const { user, onOpenChange } = await previewThenReview()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sol Ring' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Copy 1 type' })).getByRole('button', { name: 'Proxy' }))
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(await screen.findByText('Discard edits?')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByText('Discard edits?')).not.toBeInTheDocument())
    expect(screen.getByText('Sol Ring')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /close/i }))
    await user.click(await screen.findByRole('button', { name: 'Discard edits' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('asks "Discard edits?" when Escape is pressed after an edit, same as X', async () => {
    const { user, onOpenChange } = await previewThenReview()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sol Ring' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Copy 1 type' })).getByRole('button', { name: 'Proxy' }))
    await user.keyboard('{Escape}')
    expect(await screen.findByText('Discard edits?')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    await user.click(screen.getByRole('button', { name: 'Discard edits' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps the result open until the owner closes it', async () => {
    const lines = [
      { type: 'complete', summary: { inserted: 4, skipped: 0, removed: 0, sourceTag: 'manabox', errors: [], unmatched: [], durationMs: 5 } },
    ].map((e) => JSON.stringify(e) + '\n').join('')
    const { onOpenChange } = await previewThenReview()
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(lines, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Import cards' }))
    await waitFor(() => expect(screen.getByText(/copies added/)).toBeInTheDocument())
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.getByText(/copies added/)).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('shows the collection icon beside the title', () => {
    render(<ManaBoxCollectionImportDialog open onOpenChange={() => {}} />, { wrapper: createWrapper() })
    expect(document.querySelector('[data-import-icon="collection"]')).toBeInTheDocument()
  })

  it('opens and closes a row by clicking the row itself', async () => {
    await previewThenReview()
    const row = () => document.querySelector('[data-row-key]')!
    fireEvent.click(screen.getByText('Sol Ring'))
    expect(screen.getByRole('button', { name: 'Collapse Sol Ring' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Sol Ring'))
    expect(screen.getByRole('button', { name: 'Edit Sol Ring' })).toBeInTheDocument()
    expect(row()).toBeTruthy()
  })

  describe('Put these cards in', () => {
    const PLACES = {
      unsorted: { locationId: 1 },
      storage: [{ locationId: 5, name: 'Valuable binder', copyCount: 3 }],
      decks: [],
    }

    async function reviewWithPlaces() {
      const { fetchImportDestinations } = await import('./destinations-client')
      vi.mocked(fetchImportDestinations).mockResolvedValue(PLACES)
      return previewThenReview()
    }

    it('starts at Unsorted and sends it when nothing is changed', async () => {
      await reviewWithPlaces()
      expect(await screen.findByRole('combobox', { name: /Put these cards in/ })).toHaveTextContent('Unsorted')
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ inserted: 4, skipped: 0, removed: 0, sourceTag: 'manabox', errors: [], unmatched: [], durationMs: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      fireEvent.click(screen.getByRole('button', { name: 'Import cards' }))
      await waitFor(() => expect(screen.getByText(/copies added/)).toBeInTheDocument())
      const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('mode=manabox'))
      expect(JSON.parse(call![1]!.body as string).destination).toEqual({ kind: 'unsorted' })
    })

    it('sends a chosen binder, shows where they went, and counts the change as unsaved', async () => {
      const { user, onOpenChange } = await reviewWithPlaces()
      const picker = await screen.findByRole('combobox', { name: /Put these cards in/ })
      await waitFor(() => expect(picker).not.toBeDisabled())
      fireEvent.click(picker)
      fireEvent.click(screen.getByRole('option', { name: /Valuable binder/ }))
      expect(screen.getByText(/4 copies · to Valuable binder/)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /close/i }))
      expect(await screen.findByText('Discard edits?')).toBeInTheDocument()
      expect(onOpenChange).not.toHaveBeenCalledWith(false)
      await user.click(screen.getByRole('button', { name: 'Keep editing' }))

      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            inserted: 4,
            skipped: 0,
            removed: 0,
            sourceTag: 'manabox',
            errors: [],
            unmatched: [],
            durationMs: 1,
            placement: { destination: { kind: 'storage', id: 5, name: 'Valuable binder' }, total: 4, placedInStorage: 4 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      fireEvent.click(screen.getByRole('button', { name: 'Import cards' }))
      await waitFor(() => expect(screen.getByText('4 put in Valuable binder')).toBeInTheDocument())
      const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('mode=manabox'))
      expect(JSON.parse(call![1]!.body as string).destination).toEqual({ kind: 'storage', locationId: 5 })
    })
  })
})
