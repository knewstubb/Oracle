import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SyncStatus } from './SyncStatus'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SyncStatus', () => {
  it('shows "Synced [time]" when last sync time is available', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ lastSyncedAt: fiveMinAgo }),
    })

    render(<SyncStatus />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Synced 5 min ago')).toBeInTheDocument()
    })
  })

  it('shows "Not synced" when no sync has occurred', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ lastSyncedAt: null }),
    })

    render(<SyncStatus />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Not synced')).toBeInTheDocument()
    })
  })

  it('shows "Syncing..." with spinner during sync', async () => {
    // Status fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ lastSyncedAt: null }),
    })

    render(<SyncStatus />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Not synced')).toBeInTheDocument()
    })

    // Sync call — never resolves so we stay in pending state
    let resolveSyncFn!: (value: unknown) => void
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => { resolveSyncFn = resolve })
    )

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('Syncing...')).toBeInTheDocument()
    })

    // Button should be disabled during sync
    expect(screen.getByRole('button')).toBeDisabled()

    // Resolve to clean up
    resolveSyncFn({ ok: true, json: () => Promise.resolve({ synced: 1, errors: [] }) })
  })

  it('shows "Sync failed" on error', async () => {
    // Status fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ lastSyncedAt: null }),
    })

    render(<SyncStatus />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Not synced')).toBeInTheDocument()
    })

    // Sync call fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Connection failed' }),
    })

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('Sync failed')).toBeInTheDocument()
    })
  })

  it('click triggers re-sync', async () => {
    const now = new Date().toISOString()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ lastSyncedAt: now }),
    })

    render(<SyncStatus />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    // Sync call succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ synced: 1, errors: [] }),
    })
    // Re-fetch status after invalidation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ lastSyncedAt: new Date().toISOString() }),
    })

    fireEvent.click(screen.getByRole('button'))

    // Verify sync endpoint was called
    await waitFor(() => {
      const syncCall = mockFetch.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/sync') && !call[0].includes('/status')
      )
      expect(syncCall).toBeDefined()
    })
  })

  it('shows "just now" for very recent sync', async () => {
    const justNow = new Date().toISOString()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ lastSyncedAt: justNow }),
    })

    render(<SyncStatus />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Synced just now')).toBeInTheDocument()
    })
  })

  it('has accessible label', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ lastSyncedAt: null }),
    })

    render(<SyncStatus />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sync now' })).toBeInTheDocument()
    })
  })
})
