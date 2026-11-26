import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCollectionPrintings } from './useCollectionPrintings'

// Default client options on purpose: the hook itself must not retry a failed answer behind a spinner.
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
afterEach(() => vi.unstubAllGlobals())

describe('a failed Qty sort shows an error, not a spinner (D-030)', () => {
  it('reports the error straight away and stops fetching', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCollectionPrintings({ sort: 'quantity' }), { wrapper })
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.isFetching).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), 'http://x').searchParams.get('sort')).toBe('quantity')
  })
})
