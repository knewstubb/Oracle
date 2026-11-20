import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCollectionRollup } from './useCollectionRollup'
import { useCollectionPrintings } from './useCollectionPrintings'

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
afterEach(() => vi.unstubAllGlobals())

describe('the Tag choice goes with the list request', () => {
  it('grid: tags and tagsMatch are sent, sorted so the click order does not matter; nothing is sent without Tags', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ rows: [], totalCount: 0, page: 1, pageSize: 50, lastPriceRefresh: null, isPriceStale: false }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCollectionRollup({ tags: ['tutor', 'ramp'], tagsMatch: 'any' }), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), 'http://x')
    expect(url.searchParams.get('tags')).toBe('ramp,tutor')
    expect(url.searchParams.get('tagsMatch')).toBe('any')
    fetchMock.mockClear()
    const plain = renderHook(() => useCollectionRollup({}), { wrapper })
    await waitFor(() => expect(plain.result.current.data).toBeDefined())
    const plainUrl = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), 'http://x')
    expect(plainUrl.searchParams.has('tags')).toBe(false)
  })
  it('list: tags and tagsMatch are sent', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ rows: [], totalCount: 0, page: 1, pageSize: 100, lastPriceRefresh: null, isPriceStale: false }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCollectionPrintings({ tags: ['sacrifice_outlet'] }), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), 'http://x')
    expect(url.searchParams.get('tags')).toBe('sacrifice_outlet')
    expect(url.searchParams.get('tagsMatch')).toBe('all')
  })
})
