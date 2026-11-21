import { describe, expect, it } from 'vitest'
import { hashSeed, mulberry32, shuffle } from './prng'

describe('prng', () => {
  it('hashSeed is stable and order-sensitive', () => {
    expect(hashSeed(['a:1', 'b:2'])).toBe(hashSeed(['a:1', 'b:2']))
    expect(hashSeed(['a:1', 'b:2'])).not.toBe(hashSeed(['b:2', 'a:1']))
  })
  it('mulberry32 repeats for the same seed and stays in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 50; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
  it('shuffle keeps every item', () => {
    const out = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(1))
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
