import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export const REFRESH_MIN_INTERVAL_MS = 5000

/**
 * When the browser tab becomes visible again (or the window regains focus),
 * refetch the data of the queries on screen. Nothing is reloaded, so open
 * dialogs, scroll position and typed text stay as they are.
 *
 * - At most one refresh every 5 seconds, however fast the user switches tabs.
 * - Skipped while any save/delete/import (a react-query mutation) is running,
 *   so a refresh cannot bring back a just-deleted deck. A skipped refresh does
 *   not use up the 5-second allowance.
 */
export function useRefreshOnTabReturn(minIntervalMs: number = REFRESH_MIN_INTERVAL_MS) {
  const queryClient = useQueryClient()

  useEffect(() => {
    let lastRefresh = Number.NEGATIVE_INFINITY

    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      if (queryClient.isMutating() > 0) return
      const now = Date.now()
      if (now - lastRefresh < minIntervalMs) return
      lastRefresh = now
      // Active queries refetch now; the rest are marked stale and refetch when next shown.
      void queryClient.invalidateQueries()
    }

    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [queryClient, minIntervalMs])
}
