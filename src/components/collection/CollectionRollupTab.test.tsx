/**
 * Tests for the Collection Rollup two-pane tab's selection wiring.
 *
 * The rollup row checkbox must resolve the real `physical_copy_id` values
 * behind an `oracle_id` through the instance-id resolver and hand those
 * exact values to the selection model / bulk actions. It must never fall
 * back to placeholder or index-based IDs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CollectionRollupTab } from './CollectionRollupTab'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

const ORACLE_ID = 'oracle-sol-ring'
const REAL_COPY_IDS = [101, 205]

let fetchCalls: Array<{ url: string; init?: RequestInit }> = []

beforeEach(() => {
  vi.clearAllMocks()
  fetchCalls = []

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  global.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString()
    fetchCalls.push({ url: urlStr, init })

    if (urlStr.includes('/api/collection/rollup-v2')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          rows: [
            {
              oracleId: ORACLE_ID,
              cardName: 'Sol Ring',
              ownedCount: 2,
              proxyCount: 0,
              allocatedCount: 0,
              shortfall: 0,
              typeLine: 'Artifact',
            },
          ],
        }),
      } as Response)
    }

    if (urlStr.includes(`/api/collection/instances/${ORACLE_ID}/ids`)) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ oracleId: ORACLE_ID, physicalCopyIds: REAL_COPY_IDS }),
      } as Response)
    }

    if (urlStr.includes('/api/settings/storage-locations')) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    }

    return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
  })
})

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CollectionRollupTab />
    </QueryClientProvider>
  )
}

async function selectRollupRow() {
  renderTab()

  const checkbox = await screen.findByRole('checkbox', { name: /Select Sol Ring/i })
  fireEvent.click(checkbox)

  return checkbox
}

describe('CollectionRollupTab rollup-level selection', () => {
  it('resolves real physical_copy_ids from the instance resolver when a row is checked', async () => {
    await selectRollupRow()

    await waitFor(() => {
      const resolveCall = fetchCalls.find((c) =>
        c.url.includes(`/api/collection/instances/${ORACLE_ID}/ids`)
      )
      expect(resolveCall).toBeDefined()
    })

    // The selection shows the real copy count, not a single placeholder.
    await waitFor(() => {
      expect(screen.getByText(`${REAL_COPY_IDS.length} selected`)).toBeInTheDocument()
    })
  })

  it('passes the resolved physical_copy_ids to bulk actions', async () => {
    await selectRollupRow()

    await waitFor(() => {
      expect(screen.getByText(`${REAL_COPY_IDS.length} selected`)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    // Confirm the destructive bulk action so it actually runs.
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      const deleteCalls = fetchCalls.filter((c) => c.url.includes('/api/collection/instances/delete'))
      expect(deleteCalls).toHaveLength(REAL_COPY_IDS.length)
      const deletedIds = deleteCalls.map((c) => JSON.parse(String(c.init?.body)).physicalCopyId)
      expect(deletedIds).toEqual(expect.arrayContaining(REAL_COPY_IDS))
    })
  })

  it('does not store non-numeric resolver values as copy IDs', async () => {
    global.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      fetchCalls.push({ url: urlStr, init })

      if (urlStr.includes('/api/collection/rollup-v2')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            rows: [
              {
                oracleId: ORACLE_ID,
                cardName: 'Sol Ring',
                ownedCount: 2,
                proxyCount: 0,
                allocatedCount: 0,
                shortfall: 0,
                typeLine: 'Artifact',
              },
            ],
          }),
        } as Response)
      }

      if (urlStr.includes(`/api/collection/instances/${ORACLE_ID}/ids`)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            oracleId: ORACLE_ID,
            physicalCopyIds: [101, 'placeholder', null],
          }),
        } as Response)
      }

      if (urlStr.includes('/api/settings/storage-locations')) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response)
      }

      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })

    renderTab()

    const checkbox = await screen.findByRole('checkbox', { name: /Select Sol Ring/i })
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(screen.getByText('1 selected')).toBeInTheDocument()
    })
  })
})
describe('CollectionRollupTab Hide Basics', () => {
  const row = (oracleId: string, cardName: string, typeLine: string) => ({ oracleId, cardName, ownedCount: 1, proxyCount: 0, allocatedCount: 0, shortfall: 0, typeLine })
  function mockRows(rows: ReturnType<typeof row>[]) {
    global.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/api/collection/rollup-v2')) return Promise.resolve({ ok: true, json: async () => ({ rows }) } as Response)
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })
  }
  it('hides Basic Land, Basic Snow Land (library comma form) and Wastes, and keeps other cards; the button turns it off', async () => {
    mockRows([
      row('o1', 'Forest', 'Basic Land — Forest'),
      row('o2', 'Snow-Covered Swamp', 'Basic, Snow Land — Swamp'),
      row('o3', 'Wastes', 'Basic Land —'),
      row('o4', 'Sol Ring', 'Artifact —'),
      row('o5', 'Ohran Frostfang', 'Snow Creature — Snake'),
    ])
    renderTab()
    expect(await screen.findByText('Sol Ring')).toBeInTheDocument()
    expect(screen.getByText('Ohran Frostfang')).toBeInTheDocument()
    expect(screen.queryByText('Forest')).not.toBeInTheDocument()
    expect(screen.queryByText('Snow-Covered Swamp')).not.toBeInTheDocument()
    expect(screen.queryByText('Wastes')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Basics' }))
    expect(await screen.findByText('Snow-Covered Swamp')).toBeInTheDocument()
    expect(screen.getByText('Forest')).toBeInTheDocument()
  })
})

describe('CollectionRollupTab card details window', () => {
  const copy = (id: number) => ({
    copyId: id, isProxy: false, finish: 'nonfoil', condition: 'near_mint', printingId: 'p1',
    printing: { setCode: 'c21', setName: 'Commander 2021', collectorNumber: '263' }, priceUsd: 2.1,
    storage: { id: null, name: null }, assigned: null, state: 'open',
  })
  beforeEach(() => {
    const base = global.fetch
    global.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.endsWith(`/api/collection/instances/${ORACLE_ID}/details`)) {
        fetchCalls.push({ url: urlStr, init })
        return Promise.resolve({
          ok: true,
          json: async () => ({
            oracleId: ORACLE_ID, cardName: 'Sol Ring', facts: null, tags: [], printings: [], copies: REAL_COPY_IDS.map(copy),
            waitingDecks: [], rulings: [], commanderLegality: 'legal', ownedCount: 2, collectionValue: 4.2, cheapest: 2.1, imageScryfallId: null,
          }),
        } as Response)
      }
      return (base as typeof fetch)(url, init)
    }) as typeof fetch
  })
  async function openWindow() {
    renderTab()
    fireEvent.click(await screen.findByText('Sol Ring'))
    await screen.findByRole('button', { name: 'Close card details' })
    fireEvent.click(await screen.findByRole('tab', { name: /^Copies/ }))
    await screen.findAllByTestId('card-details-copy-row')
  }
  it('opens the window from a row and keeps the Collection list in one full-width column', async () => {
    await openWindow()
    expect(screen.queryByText('Select a card to view details')).toBeNull()
  })
  it('ticking copies in the window selects those exact ids for the bulk bar, and closing keeps the selection', async () => {
    await openWindow()
    fireEvent.click(screen.getByLabelText(/^Select copy 205 /))
    fireEvent.click(screen.getByLabelText(/^Select copy 101 /))
    await waitFor(() => expect(screen.getAllByText('2 selected').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('button', { name: 'Close card details' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close card details' })).toBeNull())
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      const ids = fetchCalls.filter((c) => c.url.includes('/api/collection/instances/delete')).map((c) => JSON.parse(String(c.init?.body)).physicalCopyId)
      expect(ids.sort()).toEqual([101, 205])
    })
  })
})
