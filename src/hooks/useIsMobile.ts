'use client'

import { useState, useEffect } from 'react'

/**
 * Hook to detect mobile viewport.
 * @param breakpoint - CSS breakpoint in pixels (default: 640 for sm:)
 * @returns true if viewport width is at or below breakpoint
 */
export function useIsMobile(breakpoint: number = 640): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    setIsMobile(mql.matches)

    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [breakpoint])

  return isMobile
}
