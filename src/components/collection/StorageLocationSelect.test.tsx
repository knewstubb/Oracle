/**
 * Tests for StorageLocationSelect component.
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5
 * - Unallocated copies show a dropdown populated with storage locations
 * - Allocated copies show deck name instead of dropdown
 * - Changing selection calls PATCH endpoint with correct payload
 * - "None" option clears storage_location_id
 * - If no locations exist, renders a text fallback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StorageLocationSelect } from './StorageLocationSelect'

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockLocations = [
  { id: 1, name: 'Rare Binder', color: '#4CAF50' },
  { id: 2, name: 'Bulk Box', color: '#9E9E9E' },
  { id: 3, name: 'Trade Pile', color: '#FF9800' },
]

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

let fetchCalls: Array<{ url: string; init?: RequestInit }> = []

beforeEach(() => {
  vi.clearAllMocks()
  fetchCalls = []

  global.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString()
    fetchCalls.push({ url: urlStr, init })

    if (urlStr.includes('/api/settings/storage-locations')) {
      return Promise.resolve({
        ok: true,
        json: async () => mockLocations,
      } as Response)
    }

    if (urlStr.includes('/api/collection/assign-location')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ updated: 1, physicalCopyId: 42, storageLocationId: 2 }),
      } as Response)
    }

    return Promise.resolve({
      ok: false,
      json: async () => ({ error: 'Not found' }),
    } as Response)
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithProviders(props: React.ComponentProps<typeof StorageLocationSelect>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <StorageLocationSelect {...props} />
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StorageLocationSelect', () => {
  describe('Allocated copies (Req 14.2)', () => {
    it('displays deck name when copy is allocated', () => {
      renderWithProviders({
        physicalCopyId: 42,
        currentLocationId: 1,
        currentLocationName: 'Rare Binder',
        isAllocated: true,
        assignedDeckName: 'World Breaker',
      })

      expect(screen.getByText('World Breaker')).toBeInTheDocument()
      // Should NOT show a select dropdown
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    })

    it('shows "Allocated" when deck name is not provided', () => {
      renderWithProviders({
        physicalCopyId: 42,
        currentLocationId: null,
        currentLocationName: null,
        isAllocated: true,
        assignedDeckName: null,
      })

      expect(screen.getByText('Allocated')).toBeInTheDocument()
    })
  })

  describe('Unallocated copies (Req 14.3)', () => {
    it('shows storage location dropdown when not allocated', async () => {
      renderWithProviders({
        physicalCopyId: 42,
        currentLocationId: null,
        currentLocationName: null,
        isAllocated: false,
      })

      // Wait for locations to load
      await waitFor(() => {
        const select = screen.getByLabelText(/storage location/i)
        expect(select).toBeInTheDocument()
      })

      // Should have the "None" option plus all locations
      const select = screen.getByLabelText(/storage location/i)
      const options = select.querySelectorAll('option')
      expect(options).toHaveLength(4) // None + 3 locations
      expect(options[0]).toHaveTextContent('None')
      expect(options[1]).toHaveTextContent('Rare Binder')
      expect(options[2]).toHaveTextContent('Bulk Box')
      expect(options[3]).toHaveTextContent('Trade Pile')
    })

    it('shows current location as selected value', async () => {
      renderWithProviders({
        physicalCopyId: 42,
        currentLocationId: 2,
        currentLocationName: 'Bulk Box',
        isAllocated: false,
      })

      await waitFor(() => {
        const select = screen.getByLabelText(/storage location/i) as HTMLSelectElement
        expect(select.value).toBe('2')
      })
    })

    it('calls PATCH API when location is changed', async () => {
      renderWithProviders({
        physicalCopyId: 42,
        currentLocationId: null,
        currentLocationName: null,
        isAllocated: false,
      })

      await waitFor(() => {
        expect(screen.getByLabelText(/storage location/i)).toBeInTheDocument()
      })

      const select = screen.getByLabelText(/storage location/i)
      fireEvent.change(select, { target: { value: '2' } })

      await waitFor(() => {
        const patchCall = fetchCalls.find(
          (c) => c.url.includes('/api/collection/assign-location') && c.init?.method === 'PATCH'
        )
        expect(patchCall).toBeDefined()
        const body = JSON.parse(patchCall!.init!.body as string)
        expect(body.physicalCopyId).toBe(42)
        expect(body.storageLocationId).toBe(2)
      })
    })

    it('sends null storageLocationId when "None" is selected (clear)', async () => {
      renderWithProviders({
        physicalCopyId: 42,
        currentLocationId: 2,
        currentLocationName: 'Bulk Box',
        isAllocated: false,
      })

      await waitFor(() => {
        expect(screen.getByLabelText(/storage location/i)).toBeInTheDocument()
      })

      const select = screen.getByLabelText(/storage location/i)
      fireEvent.change(select, { target: { value: '' } })

      await waitFor(() => {
        const patchCall = fetchCalls.find(
          (c) => c.url.includes('/api/collection/assign-location') && c.init?.method === 'PATCH'
        )
        expect(patchCall).toBeDefined()
        const body = JSON.parse(patchCall!.init!.body as string)
        expect(body.physicalCopyId).toBe(42)
        expect(body.storageLocationId).toBeNull()
      })
    })
  })

  describe('No locations defined', () => {
    it('shows text fallback when no storage locations exist', async () => {
      // Override fetch to return empty locations
      global.fetch = vi.fn((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString()
        if (urlStr.includes('/api/settings/storage-locations')) {
          return Promise.resolve({
            ok: true,
            json: async () => [],
          } as Response)
        }
        return Promise.resolve({ ok: false, json: async () => ({}) } as Response)
      })

      renderWithProviders({
        physicalCopyId: 42,
        currentLocationId: null,
        currentLocationName: null,
        isAllocated: false,
      })

      await waitFor(() => {
        expect(screen.getByText('None')).toBeInTheDocument()
      })

      // Should NOT show a select dropdown
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    })
  })
})
