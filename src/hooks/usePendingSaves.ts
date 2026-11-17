import { useCallback, useMemo, useRef, useState } from 'react'

/**
 * Bookkeeping for optimistic saves, keyed by a number (a copy id or a step id).
 *
 * - `start` shows the new state at once (`value`) and blocks a second save for the same key (double click).
 *   It returns a token, or null when a save for that key is already running.
 * - `saved` is called when the server has answered: the key can be saved again, but the new state stays on
 *   screen until `clear` is called after the screen has re-read the server data. A re-read that finishes
 *   earlier or later therefore cannot flip the row back.
 * - `fail` puts the row back (rollback) and unblocks the key.
 * - `clear` only acts if no newer save has replaced this one (token check).
 */
export function usePendingSaves<V>() {
  const running = useRef(new Set<number>())
  const counter = useRef(0)
  const [entries, setEntries] = useState<Record<number, { token: number; value: V; saving: boolean }>>({})

  const start = useCallback((key: number, value: V): number | null => {
    if (running.current.has(key)) return null
    running.current.add(key)
    const token = ++counter.current
    setEntries((e) => ({ ...e, [key]: { token, value, saving: true } }))
    return token
  }, [])
  const saved = useCallback((key: number) => {
    running.current.delete(key)
    setEntries((e) => (e[key] ? { ...e, [key]: { ...e[key], saving: false } } : e))
  }, [])
  const clear = useCallback((key: number, token: number) => {
    setEntries((e) => {
      if (e[key]?.token !== token) return e
      const rest = { ...e }
      delete rest[key]
      return rest
    })
  }, [])
  const fail = useCallback((key: number, token: number) => {
    running.current.delete(key)
    clear(key, token)
  }, [clear])
  /** True while the server has not yet answered for this key (drives the subtle "Saving…" mark). */
  const isSaving = (key: number) => entries[key]?.saving === true

  const values = useMemo(() => Object.values(entries).map((e) => e.value), [entries])
  return { start, saved, clear, fail, isSaving, values }
}
