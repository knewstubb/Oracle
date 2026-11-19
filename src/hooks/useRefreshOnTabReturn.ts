import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchChangeMarker } from '@/components/connector/api'

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
// ---------------------------------------------------------------------------------------------------------------
// Live refresh (same visibility handling as above): while the tab is visible, ask a very small question every few
// seconds, "has Claude changed anything?", and tell the caller when the answer changes.
// ---------------------------------------------------------------------------------------------------------------
/** 8 s: a change shows within about 10 s (8 s wait plus the answer), and a deck left open for an hour makes 450 tiny requests. */
export const CLAUDE_POLL_INTERVAL_MS = 8000
export const CLAUDE_POLL_MAX_BACKOFF_MS = 120_000
/** After this many errors in a row the check stops until the tab is shown again or the network returns. */
export const CLAUDE_POLL_MAX_ERRORS = 5
export interface ClaudeMarkerReply { marker: string; actor: 'claude' | 'owner' | null }
export interface ClaudeChangeWatchOptions {
  /** One deck, or omitted for the whole account (deck list, Recent changes). */
  deckId?: number
  enabled?: boolean
  intervalMs?: number
  fetchMarker?: (deckId: number | undefined, signal: AbortSignal) => Promise<ClaudeMarkerReply>
  /** Called when the marker differs from the one seen before. The first answer only sets the starting point. */
  onChange: (reply: ClaudeMarkerReply) => void
}
export function useClaudeChangeWatch({ deckId, enabled = true, intervalMs = CLAUDE_POLL_INTERVAL_MS, fetchMarker, onChange }: ClaudeChangeWatchOptions) {
  const onChangeRef = useRef(onChange)
  const fetchRef = useRef(fetchMarker)
  useEffect(() => {
    onChangeRef.current = onChange
    fetchRef.current = fetchMarker
  })
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let ctrl: AbortController | null = null
    let inflight = false
    let disposed = false
    let errors = 0
    let last: string | null = null
    const canRun = () => document.visibilityState === 'visible' && navigator.onLine !== false
    const stopTimer = () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    }
    const schedule = (ms: number) => {
      stopTimer()
      if (disposed || !canRun()) return
      timer = setTimeout(() => void tick(), ms)
    }
    const tick = async () => {
      stopTimer()
      if (disposed || inflight || !canRun()) return
      inflight = true
      ctrl = new AbortController()
      let aborted = false
      let fatal = false
      try {
        const f = fetchRef.current ?? defaultFetchMarker
        const reply = await f(deckId, ctrl.signal)
        errors = 0
        const before = last
        last = reply.marker
        if (before !== null && before !== reply.marker) onChangeRef.current(reply)
      } catch (e) {
        if (ctrl.signal.aborted) aborted = true
        else {
          errors += 1
          const status = (e as { status?: number } | null)?.status
          if (status === 401 || status === 403) fatal = true
        }
      } finally {
        inflight = false
      }
      if (aborted || fatal || disposed || errors >= CLAUDE_POLL_MAX_ERRORS) return
      schedule(errors > 0 ? Math.min(intervalMs * 2 ** errors, CLAUDE_POLL_MAX_BACKOFF_MS) : intervalMs)
    }
    const resume = () => {
      if (!canRun()) return
      errors = 0
      void tick()
    }
    const pause = () => {
      stopTimer()
      ctrl?.abort()
    }
    const onVisibility = () => (document.visibilityState === 'visible' ? resume() : pause())
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', resume)
    window.addEventListener('offline', pause)
    resume()
    return () => {
      disposed = true
      pause()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', resume)
      window.removeEventListener('offline', pause)
    }
  }, [deckId, enabled, intervalMs])
}
function defaultFetchMarker(deckId: number | undefined, signal: AbortSignal) {
  return fetchChangeMarker(deckId, signal)
}
