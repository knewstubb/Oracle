// Live refresh: pieces of the screen that hold the owner's work in progress (for example the open Strategy window).
// While a piece is held, a Claude change does not refetch it; it is marked "stale" so the piece can offer "Refresh".
import { useEffect, useSyncExternalStore } from 'react'
const held = new Set<string>()
const stale = new Set<string>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export const isHeld = (key: string) => held.has(key)
export function markStale(key: string) {
  if (stale.has(key)) return
  stale.add(key)
  emit()
}
export function clearStale(key: string) {
  if (stale.delete(key)) emit()
}
/** Call from the piece that has work in progress: `active` is true while it is open. */
export function useLiveRefreshHold(key: string, active: boolean) {
  useEffect(() => {
    if (!active) return
    held.add(key)
    return () => {
      held.delete(key)
    }
  }, [key, active])
}
/** True when Claude changed the deck while this piece was held. */
export function useLiveRefreshStale(key: string): boolean {
  return useSyncExternalStore(subscribe, () => stale.has(key), () => false)
}
