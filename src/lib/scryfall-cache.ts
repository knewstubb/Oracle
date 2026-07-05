/** Simple LRU cache for direct Scryfall REST API calls */
export class LruCache<K, V> {
  private cache = new Map<K, V>()
  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // Delete least recently used (first entry)
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) this.cache.delete(firstKey)
    }
    this.cache.set(key, value)
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }

  get size(): number {
    return this.cache.size
  }
}

/** Sliding-window rate limiter: max N requests per window */
export class SlidingWindowRateLimiter {
  private timestamps: number[] = []
  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  async acquire(): Promise<void> {
    const now = Date.now()
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs)
    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0]
      const waitMs = this.windowMs - (now - oldestInWindow)
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
    this.timestamps.push(Date.now())
  }
}

// Singleton instances
export const cardCache = new LruCache<string, unknown>(500)
export const rateLimiter = new SlidingWindowRateLimiter(10, 1000)

/** Direct Scryfall card search with caching and rate limiting */
export async function scryfallSearch(query: string): Promise<unknown> {
  const cached = cardCache.get(query)
  if (cached) return cached

  await rateLimiter.acquire()

  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'TheOracle/0.1.0' }
  })

  if (!response.ok) {
    throw new Error(`Scryfall API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  cardCache.set(query, data)
  return data
}
