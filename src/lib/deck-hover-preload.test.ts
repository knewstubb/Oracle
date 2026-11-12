import { describe, it, expect, vi } from 'vitest'
import { buildPreloadList, chunk, shouldSkipPreload, runPreload } from './deck-hover-preload'

const ID = 'abcdef12-0000-0000-0000-000000000000'

describe('buildPreloadList', () => {
  it('uses the CDN url for cards with a scryfall id', () => {
    const [item] = buildPreloadList([{ card_name: 'Sol Ring', scryfall_id: ID }])
    expect(item.url).toBe(`https://cards.scryfall.io/large/front/a/b/${ID}.jpg`)
  })

  it('dedupes by url and skips already-preloaded', () => {
    const cards = [
      { card_name: 'Sol Ring', scryfall_id: ID },
      { card_name: 'Sol Ring', scryfall_id: ID },
      { card_name: 'Arcane Signet', scryfall_id: 'ffeedd00-1' },
    ]
    expect(buildPreloadList(cards)).toHaveLength(2)
    const done = new Set([buildPreloadList(cards)[0].key])
    expect(buildPreloadList(cards, done)).toHaveLength(1)
  })

  it('falls back to the name source when there is no id', () => {
    const [item] = buildPreloadList([{ card_name: 'Odd Card', scryfall_id: null }])
    expect(item.url).toContain('cards/named?exact=Odd%20Card')
  })

  it('uses default art for basic lands without a printing', () => {
    const [item] = buildPreloadList([{ card_name: 'Forest', scryfall_id: '' }])
    expect(item.url).toContain('39513cdb-2461-4e9e-ad7f-ebde097cd189')
  })

  it('ignores blank names', () => {
    expect(buildPreloadList([{ card_name: '  ', scryfall_id: ID }])).toEqual([])
  })
})

describe('chunk', () => {
  it('splits into batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 4)).toEqual([])
    expect(chunk([1, 2], 0)).toEqual([[1], [2]])
  })
})

describe('shouldSkipPreload', () => {
  it('skips on save-data, slow networks and touch-only devices', () => {
    expect(shouldSkipPreload({ connection: { saveData: true }, canHover: true })).toBe(true)
    expect(shouldSkipPreload({ connection: { effectiveType: '2g' }, canHover: true })).toBe(true)
    expect(shouldSkipPreload({ connection: null, canHover: false })).toBe(true)
  })
  it('allows normal desktop', () => {
    expect(shouldSkipPreload({ connection: { effectiveType: '4g' }, canHover: true })).toBe(false)
    expect(shouldSkipPreload({ canHover: true })).toBe(false)
  })
})

describe('runPreload', () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ key: `k${i}`, url: `u${i}` }))

  it('never exceeds the concurrency limit and waits between batches', async () => {
    let inFlight = 0
    let peak = 0
    const loadImage = async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight--
    }
    const wait = vi.fn(async () => {})
    const loaded: string[] = []
    await runPreload(items, {
      loadImage,
      isCancelled: () => false,
      onLoaded: (k) => loaded.push(k),
      maxConcurrent: 4,
      wait,
    })
    expect(peak).toBe(4)
    expect(loaded).toHaveLength(9)
    expect(wait).toHaveBeenCalledTimes(2)
  })

  it('stops when cancelled', async () => {
    let cancelled = false
    const loadImage = vi.fn(async () => {
      cancelled = true
    })
    await runPreload(items, { loadImage, isCancelled: () => cancelled, maxConcurrent: 4, wait: async () => {} })
    expect(loadImage).toHaveBeenCalledTimes(4)
  })

  it('keeps going after a failed load', async () => {
    const loadImage = vi.fn(async (u: string) => {
      if (u === 'u0') throw new Error('x')
    })
    const loaded: string[] = []
    await runPreload(items.slice(0, 3), { loadImage, isCancelled: () => false, onLoaded: (k) => loaded.push(k), wait: async () => {} })
    expect(loaded).toEqual(['k1', 'k2'])
  })
})
