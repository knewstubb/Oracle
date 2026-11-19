// Live refresh: pieces of the screen that are saving right now (for example the Strategy window). While one is busy,
// a Claude change waits and is applied right after, so a refetch never lands in the middle of a save.
import { useEffect } from 'react'

/** The Strategy window's save. */
export const STRATEGY_BUSY = 'strategy'

const busy = new Set<string>()

export const isBusy = (key: string) => busy.has(key)

export function setBusy(key: string, on: boolean) {
  if (on) busy.add(key)
  else busy.delete(key)
}

/** Call from the piece that saves: `active` is true while a save is running. */
export function useLiveRefreshBusy(key: string, active: boolean) {
  useEffect(() => {
    if (!active) return
    setBusy(key, true)
    return () => setBusy(key, false)
  }, [key, active])
}
