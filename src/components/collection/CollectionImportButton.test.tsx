import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CollectionImportButton } from './CollectionImportButton'

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CollectionImportButton />
    </QueryClientProvider>
  )
}

function createFile(content: string, name = 'collection.csv') {
  return new File([content], name, { type: 'text/csv' })
}

const PREVIEW_RESPONSE = {
  fileName: 'collection.csv',
  totalLines: 1,
  rows: [
    {
      sourceIndex: 2,
      sourceLines: [2],
      cardName: 'Sol Ring',
      setCode: 'c21',
      collectorNumber: '263',
      scryfallId: 'abc',
      oracleId: 'def',
      qty: 1,
      finish: 'nonfoil',
      isBasicLand: false,
    },
  ],
  skippedTokens: [],
  unmatched: [],
}

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

describe('CollectionImportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Import CSV button', () => {
    renderWithProviders()
    expect(screen.getByText('Import CSV')).toBeInTheDocument()
  })

  it('opens the ManaBox import dialog when clicked', async () => {
    renderWithProviders()
    fireEvent.click(screen.getByText('Import CSV'))
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/Import collection/i)).toBeInTheDocument()
    })
  })

  it('moves to review after a file is selected', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(PREVIEW_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    renderWithProviders()
    fireEvent.click(screen.getByText('Import CSV'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const file = createFile('Name,Set code,Collector number,Foil,Quantity,Scryfall ID\nSol Ring,c21,263,normal,1,abc')
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [file] } })
    })

    await waitFor(() => {
      expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    })
  })
})
