'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Hook to detect mobile viewport.
 * @param breakpoint - CSS breakpoint in pixels (default: 640 for sm:)
 * @returns true if viewport width is at or below breakpoint
 */
export function useIsMobile(breakpoint: number = 640): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`

  const subscribe = useCallback((onStoreChange: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener('change', onStoreChange)
    return () => mql.removeEventListener('change', onStoreChange)
  }, [query])

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
