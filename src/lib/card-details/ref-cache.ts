/**
 * A small in-memory cache for card reference data that rarely changes (card facts, rulings, printings of one card).
 * It lives as long as the server process, so a warm server answers these without a database round trip.
 * User data (copies, decks, the Why line) is never cached here.
 */
const all: Array<Map<string, unknown>> = []

export interface RefCache<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
}

export function createRefCache<T>(ttlMs: number, max = 500): RefCache<T> {
  const map = new Map<string, { at: number; value: T }>()
  all.push(map as Map<string, unknown>)
  return {
    get(key) {
      const hit = map.get(key)
      if (!hit) return undefined
      if (Date.now() - hit.at > ttlMs) {
        map.delete(key)
        return undefined
      }
      return hit.value
    },
    set(key, value) {
      if (map.size >= max) map.clear()
      map.set(key, { at: Date.now(), value })
    },
  }
}

/** Test helper: forget everything cached. */
export function clearRefCaches(): void {
  for (const m of all) m.clear()
}
