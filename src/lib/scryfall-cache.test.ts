import { describe, it, expect } from 'vitest'
import { LruCache, SlidingWindowRateLimiter } from './scryfall-cache'

describe('LruCache', () => {
  it('stores and retrieves values', () => {
    const cache = new LruCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBe(2)
  })

  it('returns undefined for missing keys', () => {
    const cache = new LruCache<string, number>(3)
    expect(cache.get('missing')).toBeUndefined()
  })

  it('evicts least recently used when maxSize exceeded', () => {
    const cache = new LruCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    // Cache is full at 3. Adding 'd' should evict 'a' (LRU)
    cache.set('d', 4)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
    expect(cache.get('d')).toBe(4)
    expect(cache.size).toBe(3)
  })

  it('accessing a key makes it most recently used', () => {
    const cache = new LruCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    // Access 'a' to make it MRU
    cache.get('a')
    // Adding 'd' should evict 'b' (now LRU)
    cache.set('d', 4)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBeUndefined()
  })

  it('updating an existing key does not increase size', () => {
    const cache = new LruCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('a', 10) // update existing
    expect(cache.size).toBe(2)
    expect(cache.get('a')).toBe(10)
  })

  it('has() returns correct membership', () => {
    const cache = new LruCache<string, number>(3)
    cache.set('a', 1)
    expect(cache.has('a')).toBe(true)
    expect(cache.has('b')).toBe(false)
  })

  it('reports correct size', () => {
    const cache = new LruCache<string, number>(5)
    expect(cache.size).toBe(0)
    cache.set('a', 1)
    expect(cache.size).toBe(1)
    cache.set('b', 2)
    expect(cache.size).toBe(2)
  })
})

describe('SlidingWindowRateLimiter', () => {
  it('allows requests within the limit', async () => {
    const limiter = new SlidingWindowRateLimiter(5, 1000)
    // Should complete immediately for the first 5 requests
    for (let i = 0; i < 5; i++) {
      await limiter.acquire()
    }
    // If we get here without hanging, the test passes
    expect(true).toBe(true)
  })

  it('delays when limit is exceeded', async () => {
    const limiter = new SlidingWindowRateLimiter(2, 100)
    const start = Date.now()
    await limiter.acquire()
    await limiter.acquire()
    // Third request should be delayed
    await limiter.acquire()
    const elapsed = Date.now() - start
    // Should have waited approximately 100ms for the window to slide
    expect(elapsed).toBeGreaterThanOrEqual(50)
  })
})
