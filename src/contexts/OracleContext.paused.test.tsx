import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { OracleProvider, useOracle } from './OracleContext'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  localStorage.clear()
})

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <OracleProvider>{children}</OracleProvider>
    </QueryClientProvider>
  )
}

describe('OracleContext while the in-app chat is paused', () => {
  it('cannot be opened, ignores the shortcut, ignores a stored "open", and sends nothing', async () => {
    vi.stubEnv('NEXT_PUBLIC_AI_CHAT_ENABLED', 'false')
    localStorage.setItem('oracle-sidebar-open', 'true')
    const fetchSpy = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchSpy)
    const { result } = renderHook(() => useOracle(), { wrapper })
    act(() => result.current.open())
    act(() => result.current.toggle())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true, shiftKey: true }))
    })
    await act(async () => result.current.sendMessage('hello'))
    expect(result.current.isOpen).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('opens normally when switched on', () => {
    const { result } = renderHook(() => useOracle(), { wrapper })
    act(() => result.current.open())
    expect(result.current.isOpen).toBe(true)
  })
})
