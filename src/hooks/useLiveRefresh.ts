'use client'
// Live refresh: when Claude changes something, refetch what depends on it, without a page reload and without
// touching work the owner has in progress. Uses the same query-cache invalidation as the rest of the app.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { connectorKeys } from '@/components/connector/api'
import { deckKeys } from '@/hooks/useDeckQueryKeys'
import { useClaudeChangeWatch, type ClaudeMarkerReply } from '@/hooks/useRefreshOnTabReturn'
import { isHeld, markStale } from '@/lib/live-refresh-holds'
/** The deck's Strategy block (its query sits under the deck key). Held while the Strategy window is open. */
export const STRATEGY_HOLD = 'strategy'
export const TYPING_IDLE_MS = 3000
export const DEFER_RECHECK_MS = 1500
export const NOTE_SHOW_MS = 6000
export const NOTE_FADE_MS = 1000
/** A window with this attribute may be refreshed behind it (History); every other open window defers the refresh. */
const BLOCKING_DIALOG = '[role="dialog"]:not([data-live-refresh="allow"]), [role="alertdialog"]:not([data-live-refresh="allow"])'
const isTextField = (el: Element | null) =>
  !!el && ((el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range'].includes(el.type)) || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable)
/** Tracks the last keystroke so "typing in a field" means a field has focus and was typed in a moment ago. */
function useTypingClock() {
  const lastInput = useRef(Number.NEGATIVE_INFINITY)
  useEffect(() => {
    const mark = () => {
      lastInput.current = Date.now()
    }
    document.addEventListener('keydown', mark, true)
    document.addEventListener('input', mark, true)
    return () => {
      document.removeEventListener('keydown', mark, true)
      document.removeEventListener('input', mark, true)
    }
  }, [])
  return useCallback(() => isTextField(document.activeElement) && Date.now() - lastInput.current < TYPING_IDLE_MS, [])
}
/** Runs `apply` once nothing of the owner's is in progress; re-checks every 1.5 s while something is. Several changes in a row become one refresh. */
function useDeferredApply(isBusy: () => boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<(() => void) | null>(null)
  const busyRef = useRef(isBusy)
  useEffect(() => {
    busyRef.current = isBusy
  })
  useEffect(() => () => clearTimeout(timer.current), [])
  return useCallback((fn: () => void) => {
    pending.current = fn
    if (timer.current !== undefined) return
    const run = () => {
      timer.current = undefined
      const next = pending.current
      if (!next) return
      if (busyRef.current()) {
        timer.current = setTimeout(run, DEFER_RECHECK_MS)
        return
      }
      pending.current = null
      next()
    }
    run()
  }, [])
}
export interface LiveNote { fading: boolean }
/** Deck page. Returns the one-line note state; the page shows it and can open History from it. */
export function useLiveDeckRefresh(deckId: number | undefined) {
  const qc = useQueryClient()
  const typing = useTypingClock()
  const [note, setNote] = useState<LiveNote | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const isBusy = useCallback(() => qc.isMutating() > 0 || typing() || document.querySelector(BLOCKING_DIALOG) !== null, [qc, typing])
  const defer = useDeferredApply(isBusy)
  const showNote = useCallback(() => {
    timers.current.forEach(clearTimeout)
    setNote({ fading: false })
    timers.current = [setTimeout(() => setNote({ fading: true }), NOTE_SHOW_MS - NOTE_FADE_MS), setTimeout(() => setNote(null), NOTE_SHOW_MS)]
  }, [])
  const onChange = useCallback(
    (reply: ClaudeMarkerReply) => {
      if (deckId === undefined) return
      // Marked at once so an open Strategy window shows "Claude changed this deck. Refresh" without waiting.
      if (isHeld(STRATEGY_HOLD)) markStale(STRATEGY_HOLD)
      defer(() => {
        // The Strategy window is open: leave its data alone (it offers "Refresh"); everything else under the deck refetches.
        const skipStrategy = isHeld(STRATEGY_HOLD)
        if (skipStrategy) markStale(STRATEGY_HOLD)
        qc.invalidateQueries({ queryKey: deckKeys.detail(deckId), predicate: (q) => !(skipStrategy && q.queryKey[2] === 'strategy-window') })
        qc.invalidateQueries({ queryKey: deckKeys.picklist(deckId) })
        qc.invalidateQueries({ queryKey: deckKeys.allocation(deckId) })
        qc.invalidateQueries({ queryKey: connectorKeys.deckChanges(deckId) })
        qc.invalidateQueries({ queryKey: connectorKeys.changes })
        qc.invalidateQueries({ queryKey: connectorKeys.pending })
        qc.invalidateQueries({ queryKey: connectorKeys.pendingCount })
        qc.invalidateQueries({ queryKey: connectorKeys.moved(deckId) })
        if (reply.actor === 'claude') showNote()
      })
    },
    [deckId, defer, qc, showNote],
  )
  useClaudeChangeWatch({ deckId, enabled: deckId !== undefined, onChange })
  return { note, dismissNote: () => setNote(null) }
}
/** Deck list and Recent changes: the same check for the whole account. `keys` are what to refetch. */
export function useLiveUserRefresh(keys: readonly (readonly unknown[])[]) {
  const qc = useQueryClient()
  const typing = useTypingClock()
  const isBusy = useCallback(() => qc.isMutating() > 0 || typing() || document.querySelector(BLOCKING_DIALOG) !== null, [qc, typing])
  const defer = useDeferredApply(isBusy)
  const keysRef = useRef(keys)
  useEffect(() => {
    keysRef.current = keys
  })
  const onChange = useCallback(() => {
    defer(() => keysRef.current.forEach((queryKey) => qc.invalidateQueries({ queryKey })))
  }, [defer, qc])
  useClaudeChangeWatch({ onChange })
}
