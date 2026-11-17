import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useRefreshOnTabReturn } from './useRefreshOnTabReturn'

function setup() {
  const client = new QueryClient()
  const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  renderHook(() => useRefreshOnTabReturn(), { wrapper })
  return { client, spy }
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useRefreshOnTabReturn', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('refreshes when the tab becomes visible, not when it is hidden', () => {
    const { spy } = setup()
    setVisibility('hidden')
    expect(spy).not.toHaveBeenCalled()
    setVisibility('visible')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('refreshes on window focus too', () => {
    const { spy } = setup()
    window.dispatchEvent(new Event('focus'))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('refreshes at most once every 5 seconds', () => {
    const { spy } = setup()
    setVisibility('visible')
    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(4000)
    setVisibility('visible')
    expect(spy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1500)
    setVisibility('visible')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('skips while a save, delete or import is running, and refreshes right after', () => {
    const { client, spy } = setup()
    const mutating = vi.spyOn(client, 'isMutating').mockReturnValue(1)
    setVisibility('visible')
    expect(spy).not.toHaveBeenCalled()
    mutating.mockReturnValue(0)
    setVisibility('visible')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
