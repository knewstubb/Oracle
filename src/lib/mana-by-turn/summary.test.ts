import { describe, expect, it } from 'vitest'
import { summarise } from './summary'

describe('summarise', () => {
  it('gives mean and nearest-rank percentiles', () => {
    const turn = Array.from({ length: 10 }, (_, i) => i + 1)
    const s = summarise([turn])
    expect(s.avg[0]).toBe(5.5)
    expect(s.p10[0]).toBe(1)
    expect(s.p90[0]).toBe(9)
  })
  it('handles an empty turn', () => expect(summarise([[]])).toEqual({ avg: [0], p10: [0], p90: [0] }))
})
