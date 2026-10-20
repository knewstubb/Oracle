import { describe, it, expect } from 'vitest'
import {
  countStoredFoils,
  resultHeadline,
  buildResultBreakdown,
  buildNeedsLook,
  visibleUnmatched,
  unmatchedLinesText,
} from './import-result'

const base = { kind: 'collection' as const, inserted: 10, proxies: 0, foils: 0, tokensSkipped: 0, unsleeved: 0, basics: 0 }

describe('import-result', () => {
  it('counts foil and etched copies but not proxies', () => {
    expect(
      countStoredFoils([
        { finish: 'nonfoil' },
        { finish: 'foil' },
        { finish: 'etched' },
        { finish: 'foil', is_proxy: true },
      ])
    ).toBe(2)
  })

  it('writes headlines for collection and deck', () => {
    expect(resultHeadline('collection', 81, '')).toEqual({ headline: '81 copies added', sub: 'to your collection' })
    expect(resultHeadline('collection', 1, '').headline).toBe('1 copy added')
    expect(resultHeadline('deck', 99, 'Atraxa')).toEqual({ headline: 'Atraxa imported', sub: '99 cards added' })
  })

  it('says all originals for a clean collection', () => {
    const b = buildResultBreakdown(base)
    expect(b.allOriginals).toBe(true)
    expect(b.rows).toEqual([])
    expect(b.originals).toBe(10)
  })

  it('lists originals, proxies, foil and tokens when present', () => {
    const b = buildResultBreakdown({ ...base, proxies: 2, foils: 3, tokensSkipped: 1 })
    expect(b.allOriginals).toBe(false)
    expect(b.rows.map((r) => [r.key, r.value])).toEqual([
      ['originals', 8],
      ['proxies', 2],
      ['foil', 3],
      ['tokens', 1],
    ])
  })

  it('omits deck originals but shows unsleeved and basics', () => {
    const b = buildResultBreakdown({ ...base, kind: 'deck', unsleeved: 4, basics: 20 })
    expect(b.originals).toBeNull()
    expect(b.rows.map((r) => r.key)).toEqual(['unsleeved', 'basics'])
    expect(b.allOriginals).toBe(false)
  })

  it('builds one notice per kind and none when clean', () => {
    expect(buildNeedsLook({ unrecognisedValues: 0, unlistedFinish: 0, unmatchedCount: 0 })).toEqual([])
    const n = buildNeedsLook({ unrecognisedValues: 2, unlistedFinish: 1, unmatchedCount: 3 })
    expect(n.map((x) => x.key)).toEqual(['unrecognised', 'unlisted', 'unmatched'])
    expect(n[2].text).toMatch(/3 cards/)
  })

  it('shows three unmatched lines then the rest when expanded', () => {
    const lines = [1, 2, 3, 4, 5]
    expect(visibleUnmatched(lines, false)).toEqual({ shown: [1, 2, 3], hidden: 2 })
    expect(visibleUnmatched(lines, true)).toEqual({ shown: lines, hidden: 0 })
    expect(visibleUnmatched([1], false).hidden).toBe(0)
  })

  it('joins unmatched raw lines for copying', () => {
    expect(unmatchedLinesText([{ rawLine: 'a', reason: 'x' }, { rawLine: 'b', reason: 'y' }])).toBe('a\nb')
  })
})
