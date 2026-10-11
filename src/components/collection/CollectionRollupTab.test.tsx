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
