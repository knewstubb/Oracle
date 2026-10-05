import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

    const nav = screen.getByRole('navigation', { name: 'Reconciliation lists' })
    expect(within(nav).getByText('All owned')).toBeInTheDocument()
    expect(within(nav).getByText('All unowned')).toBeInTheDocument()
    expect(within(nav).getByText('mURZAnary tactics')).toBeInTheDocument()
    expect(screen.getByText('Sol Ring')).toBeInTheDocument()
  })

  it('opens a list of cards when a list on the left is clicked', async () => {
    const user = userEvent.setup()
    render(<ReconciliationSummary batchResult={batchResult} batchId="batch-1" onFinish={vi.fn()} />)

    const nav = await screen.findByRole('navigation', { name: 'Reconciliation lists' })
    await user.click(within(nav).getByText('All unowned'))

    expect(screen.getByRole('heading', { name: 'All unowned' })).toBeInTheDocument()
    expect(screen.queryByText('Sol Ring')).not.toBeInTheDocument()

    await user.click(within(nav).getByText('All owned'))
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

  it('keeps a card in place after choosing Proxy so the choice can be changed', async () => {
    const user = userEvent.setup()
    const second = { ...mockView.rows[0], cardName: 'Zealous Conscripts', printingId: 'z-printing', resolved: false,
      instances: [{ ...mockView.rows[0].instances[0], claimId: 202, state: 'planned' as const, resolved: false }] }
    const first = { ...mockView.rows[0], resolved: false,
      instances: [{ ...mockView.rows[0].instances[0], claimId: 101, state: 'planned' as const, resolved: false }] }
    const before = { ...mockView, rows: [first, second] }
    // The server sorts resolved cards last.
    const after = {
      ...mockView,
      rows: [
        second,
        { ...first, resolved: true, instances: [{ ...first.instances[0], state: 'proxy' as const, resolved: true }] },
      ],
    }

    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(before) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, view: after }) } as Response)

    render(<ReconciliationSummary batchResult={batchResult} batchId="batch-1" onFinish={vi.fn()} />)
    await screen.findByText('Sol Ring')
    await user.click(screen.getAllByRole('radio', { name: 'Proxy' })[0])

    await waitFor(() =>
      expect(screen.getAllByRole('radio', { name: 'Proxy' })[0]).toHaveAttribute('aria-checked', 'true')
    )
    const names = screen.getAllByText(/^(Sol Ring|Zealous Conscripts)$/).map((n) => n.textContent)
    expect(names).toEqual(['Sol Ring', 'Zealous Conscripts'])
  })

  it('never lists cards that had no conflict, even after a later update returns them', async () => {
    const user = userEvent.setup()
    const conflict = { ...mockView.rows[0], resolved: false }
    const fine = { ...mockView.rows[0], cardName: 'Cultivate', printingId: 'fine-printing', resolved: true }
    const unresolvedOnly = { ...mockView, rows: [conflict] }
    const withResolved = { ...mockView, rows: [conflict, fine] }

    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(unresolvedOnly) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, view: withResolved }) } as Response)

    render(<ReconciliationSummary batchResult={batchResult} batchId="batch-1" onFinish={vi.fn()} />)
    await screen.findByText('Sol Ring')
    await user.click(screen.getAllByRole('radio', { name: 'Proxy' })[0])

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    expect(screen.queryByText('Cultivate')).not.toBeInTheDocument()
  })
})
