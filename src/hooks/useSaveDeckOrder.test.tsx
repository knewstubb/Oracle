import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { applyDeckOrder, useSaveDeckOrder } from './useSaveDeckOrder'
import { deckKeys } from '@/hooks/useDeckQueryKeys'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const list = () => ({ decks: [{ id: 1 }, { id: 2 }, { id: 3 }] })
const ids = (c: QueryClient) => (c.getQueryData(deckKeys.all) as { decks: { id: number }[] }).decks.map((d) => d.id)

describe('applyDeckOrder', () => {
  it('puts decks in the saved order and loses none', () => {
    expect(applyDeckOrder(list(), [3, 1, 2])?.decks.map((d) => d.id)).toEqual([3, 1, 2])
  })
  it('keeps a deck missing from the list at the end', () => {
    expect(applyDeckOrder(list(), [3, 1])?.decks.map((d) => d.id)).toEqual([3, 1, 2])
  })
  it('leaves an empty cache alone', () => {
    expect(applyDeckOrder(undefined, [1])).toBeUndefined()
  })
})

describe('useSaveDeckOrder', () => {
  const fetchMock = vi.fn()
  let client: QueryClient
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    client.setQueryData(deckKeys.all, list())
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    Object.values(toast).forEach((f) => f.mockClear())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('success: new order stays, one PUT with the whole list, no message', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, count: 3 }) })
    const { result } = renderHook(() => useSaveDeckOrder(), { wrapper })
    act(() => result.current.saveOrder([2, 3, 1]))
    await waitFor(() => expect(result.current.saving).toBe(false))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/decks/order')
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ deckIds: [2, 3, 1] })
    expect(ids(client)).toEqual([2, 3, 1])
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })
  it('server failure: old order comes back and a message with Try again shows (D-030)', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'save_failed' }) })
    const { result } = renderHook(() => useSaveDeckOrder(), { wrapper })
    act(() => result.current.saveOrder([3, 2, 1]))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(ids(client)).toEqual([1, 2, 3])
    expect(toast.error.mock.calls[0][0]).toMatch(/Couldn't save the new order/)
    expect(toast.error.mock.calls[0][1].action.label).toBe('Try again')
  })
  it('network failure is a failure too, never a success', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useSaveDeckOrder(), { wrapper })
    act(() => result.current.saveOrder([3, 2, 1]))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(ids(client)).toEqual([1, 2, 3])
  })
  it('Try again sends the same order again', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) }).mockResolvedValue({ ok: true, json: async () => ({ ok: true, count: 3 }) })
    const { result } = renderHook(() => useSaveDeckOrder(), { wrapper })
    act(() => result.current.saveOrder([3, 2, 1]))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    act(() => toast.error.mock.calls[0][1].action.onClick())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ deckIds: [3, 2, 1] })
  })
  it('list changed elsewhere: old order back, "changed in another window" message, list reloads', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'deck_order_mismatch' }) })
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSaveDeckOrder(), { wrapper })
    act(() => result.current.saveOrder([3, 2, 1]))
    await waitFor(() => expect(toast.info).toHaveBeenCalled())
    expect(toast.info.mock.calls[0][0]).toMatch(/changed in another window/)
    expect(toast.error).not.toHaveBeenCalled()
    expect(ids(client)).toEqual([1, 2, 3])
    expect(spy).toHaveBeenCalledWith({ queryKey: deckKeys.all })
  })
})
