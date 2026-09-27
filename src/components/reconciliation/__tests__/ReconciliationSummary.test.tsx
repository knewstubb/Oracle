import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReconciliationSummary } from '../ReconciliationSummary'
import type { ReconciliationView } from '@/types/import-reconciliation'

const mockView: ReconciliationView = {
  batchId: 'batch-1',
  counts: {
    unresolvedTotal: 2,
    unresolvedOwned: 1,
    unresolvedUnowned: 1,
    rowsTotal: 2,
  },
  decks: [
    { deckId: 1, deckName: 'mURZAnary tactics', isActive: true, conflictPrintingCount: 2 },
  ],
  rows: [
    {
      cardName: 'Sol Ring',
      printingId: 'sol-ring-printing',
      oracleId: 'oracle-sol-ring',
      setCode: '2xm',
      setName: 'Double Masters',
      collectorNumber: '270',
      finish: 'nonfoil',
      imageUriSmall: 'https://example.com/sol-ring-small.jpg',
      imageUriNormal: null,
      imageUriLarge: null,
      owned: 1,
      availableSupply: 0,
      ownedAnyPrinting: 1,
      freeProxies: 0,
      claimedBy: [{ deckId: 2, deckName: 'Big Butt' }],
      ownership: 'owned',
      printingMismatch: false,
      overAllocated: true,
      resolved: false,
      instances: [
        {
          claimId: 101,
          deckCardsId: 1001,
          deckId: 1,
          deckName: 'mURZAnary tactics',
          state: 'sleeved',
          selectedPrintingId: null,
          effectivePrintingId: 'sol-ring-printing',
          wishlisted: true,
          slotState: 'sleeved_owned',
          canSleeve: true,
          alternateAvailable: false,
          alreadyClaimed: false,
          overAllocated: false,
          competingDemand: 1,
          resolved: true,
          claimedBy: [],
        },
      ],
      alternatePrintings: [],
    },
  ],
}

const batchResult = {
  decksProcessed: 1,
  results: [
    {
      deckId: 1,
      deckName: 'mURZAnary tactics',
      totalCards: 100,
      matched: 99,
      unresolved: 2,
      unresolvedCards: ['Sol Ring'],
      errors: [],
      lifecycle: 'active' as const,
    },
  ],
  totalMatched: 99,
  totalUnresolved: 2,
  contentions: [],
  durationMs: 0,
}

describe('ReconciliationSummary', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockView),
        })
      ) as unknown as typeof fetch
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and displays the reconciliation view', async () => {
    render(<ReconciliationSummary batchResult={batchResult} batchId="batch-1" onFinish={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Reconcile imported decks')).toBeInTheDocument()
    })

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Decks2', 'Owned1', 'Unowned1'])
    expect(screen.getByText('Sol Ring')).toBeInTheDocument()
  })

  it('shows a load error instead of the all-reconciled state when the API fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'get_import_reconciliation is unavailable' }),
    } as Response)

    render(<ReconciliationSummary batchResult={batchResult} batchId="batch-1" onFinish={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Unable to load reconciliation data.')).toBeInTheDocument()
    })

    expect(screen.getByText(/get_import_reconciliation is unavailable/)).toBeInTheDocument()
    expect(screen.queryByText('All imported cards are reconciled.')).not.toBeInTheDocument()
  })
})
