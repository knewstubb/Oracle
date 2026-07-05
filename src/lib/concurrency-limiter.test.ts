import { describe, it, expect } from 'vitest'
import { ConcurrencyLimiter } from './concurrency-limiter'

describe('ConcurrencyLimiter', () => {
  it('uses default delayMs of 500ms', async () => {
    const limiter = new ConcurrencyLimiter()
    const timestamps: number[] = []

    await limiter.execute(async () => {
      timestamps.push(Date.now())
    })
    await limiter.execute(async () => {
      timestamps.push(Date.now())
    })

    const gap = timestamps[1] - timestamps[0]
    // Should wait at least ~500ms between tasks (allow some tolerance)
    expect(gap).toBeGreaterThanOrEqual(480)
  })

  it('accepts configurable delayMs', async () => {
    const limiter = new ConcurrencyLimiter(100)
    const timestamps: number[] = []

    await limiter.execute(async () => {
      timestamps.push(Date.now())
    })
    await limiter.execute(async () => {
      timestamps.push(Date.now())
    })

    const gap = timestamps[1] - timestamps[0]
    expect(gap).toBeGreaterThanOrEqual(80)
    expect(gap).toBeLessThan(300)
  })

  it('execute returns the task result', async () => {
    const limiter = new ConcurrencyLimiter(10)
    const result = await limiter.execute(async () => 42)
    expect(result).toBe(42)
  })

  it('execute propagates errors from the task', async () => {
    const limiter = new ConcurrencyLimiter(10)
    await expect(
      limiter.execute(async () => {
        throw new Error('task failed')
      })
    ).rejects.toThrow('task failed')
  })

  it('does not wait before the first execution', async () => {
    const limiter = new ConcurrencyLimiter(1000)
    const start = Date.now()
    await limiter.execute(async () => 'first')
    const elapsed = Date.now() - start

    // First execution should be near-instant (no prior task to wait for)
    expect(elapsed).toBeLessThan(50)
  })

  it('processAll runs items sequentially and returns all results', async () => {
    const limiter = new ConcurrencyLimiter(10)
    const items = [1, 2, 3, 4, 5]
    const results = await limiter.processAll(items, async (n) => n * 2)
    expect(results).toEqual([2, 4, 6, 8, 10])
  })

  it('processAll respects delay between items', async () => {
    const limiter = new ConcurrencyLimiter(50)
    const timestamps: number[] = []

    await limiter.processAll([1, 2, 3], async () => {
      timestamps.push(Date.now())
    })

    // Each gap should be at least ~50ms
    for (let i = 1; i < timestamps.length; i++) {
      const gap = timestamps[i] - timestamps[i - 1]
      expect(gap).toBeGreaterThanOrEqual(40)
    }
  })

  it('processAll returns empty array for empty items', async () => {
    const limiter = new ConcurrencyLimiter(10)
    const results = await limiter.processAll([], async (x) => x)
    expect(results).toEqual([])
  })

  it('processAll processes items in order', async () => {
    const limiter = new ConcurrencyLimiter(10)
    const order: number[] = []

    await limiter.processAll([1, 2, 3], async (n) => {
      order.push(n)
      return n
    })

    expect(order).toEqual([1, 2, 3])
  })

  it('tasks run sequentially, not concurrently', async () => {
    const limiter = new ConcurrencyLimiter(10)
    let concurrentCount = 0
    let maxConcurrent = 0

    await limiter.processAll([1, 2, 3, 4], async () => {
      concurrentCount++
      maxConcurrent = Math.max(maxConcurrent, concurrentCount)
      await new Promise((r) => setTimeout(r, 20))
      concurrentCount--
    })

    expect(maxConcurrent).toBe(1)
  })
})
