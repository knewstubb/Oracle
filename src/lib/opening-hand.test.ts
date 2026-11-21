import { describe, it, expect } from 'vitest'
import { handOdds, atLeastLands, landsBetween } from './opening-hand'

// Vectors computed independently with python math.comb (sum of C(K,x)*C(N-K,n-x) / C(N,n)).
const VECTORS: Array<[number, number, number[]]> = [
  // library, lands, [0-1 in 7, 2-4 in 7, 5+ in 7, 3+ in 9, 4+ in 10, 7+ in 12]
  [99, 35, [0.217996, 0.730612, 0.051391, 0.681069, 0.498384, 0.075256]],
  [99, 38, [0.171037, 0.755102, 0.073861, 0.74816, 0.582795, 0.116196]],
  [100, 35, [0.224091, 0.726716, 0.049193, 0.672564, 0.488304, 0.071374]],
  [100, 38, [0.176656, 0.752568, 0.070776, 0.740042, 0.572271, 0.110511]],
]

describe('handOdds', () => {
  it.each(VECTORS)('matches the independent computation for a %i-card library with %i lands', (n, k, v) => {
    const o = handOdds(n, k)
    const got = [o.opening.low, o.opening.mid, o.opening.high, o.thirdLandByTurn3, o.fourthLandByTurn4, o.floodedByTurn6]
    got.forEach((g, i) => expect(g).toBeCloseTo(v[i], 5))
  })
  it('opening buckets sum to 1', () => {
    const o = handOdds(99, 36).opening
    expect(o.low + o.mid + o.high).toBeCloseTo(1, 10)
  })
  it('handles decks with no lands and tiny libraries', () => {
    expect(handOdds(99, 0).opening.low).toBe(1)
    expect(atLeastLands(99, 0, 9, 3)).toBe(0)
    expect(landsBetween(5, 3, 7, 0, 7)).toBe(0)
    expect(handOdds(0, 0).thirdLandByTurn3).toBe(0)
  })
})
