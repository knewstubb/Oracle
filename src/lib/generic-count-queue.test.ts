import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCountQueue } from './generic-count-queue'

describe('createCountQueue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sends one request with the final count for rapid clicks', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const q = createCountQueue({ send, delayMs: 300 })
    q.set('Island', 11)
    q.set('Island', 12)
    q.set('Island', 13)
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('Island', 13)
  })

  it('reports failure so the caller can revert', async () => {
    const onSettled = vi.fn()
    const q = createCountQueue({ send: vi.fn().mockRejectedValue(new Error('x')), onSettled, delayMs: 10 })
    q.set('Forest', 3)
    await vi.advanceTimersByTimeAsync(20)
    expect(onSettled).toHaveBeenCalledWith('Forest', false)
  })

  it('keeps separate basics separate', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const q = createCountQueue({ send, delayMs: 10 })
    q.set('Island', 2)
    q.set('Swamp', 5)
    await vi.advanceTimersByTimeAsync(20)
    expect(send).toHaveBeenCalledTimes(2)
  })
})
