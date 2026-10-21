/**
 * Coalesces rapid +/- clicks on a generic basic line into one request with the final count.
 * Pure (no React) so it can be unit tested with fake timers.
 */

export interface CountQueueOptions {
  delayMs?: number
  /** Send the final count. Reject to signal failure. */
  send: (key: string, count: number) => Promise<void>
  onSettled?: (key: string, ok: boolean) => void
}

export function createCountQueue({ delayMs = 350, send, onSettled }: CountQueueOptions) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const latest = new Map<string, number>()
  const inFlight = new Map<string, Promise<void>>()

  const flush = async (key: string) => {
    timers.delete(key)
    const count = latest.get(key)
    if (count === undefined) return
    latest.delete(key)
    // Keep requests for one line in order.
    const previous = inFlight.get(key) ?? Promise.resolve()
    const run = previous
      .catch(() => undefined)
      .then(() => send(key, count))
      .then(
        () => onSettled?.(key, true),
        () => onSettled?.(key, false)
      )
    inFlight.set(key, run)
    await run
    if (inFlight.get(key) === run) inFlight.delete(key)
  }

  return {
    /** Record the wanted count; the request goes out after clicks stop for `delayMs`. */
    set(key: string, count: number) {
      latest.set(key, count)
      const t = timers.get(key)
      if (t) clearTimeout(t)
      timers.set(key, setTimeout(() => void flush(key), delayMs))
    },
    pending(key: string) {
      return timers.has(key) || inFlight.has(key)
    },
    /** Send anything waiting right now (e.g. before leaving the page). */
    flushAll() {
      return Promise.all([...timers.keys()].map((k) => { clearTimeout(timers.get(k)!); return flush(k) }))
    },
  }
}
