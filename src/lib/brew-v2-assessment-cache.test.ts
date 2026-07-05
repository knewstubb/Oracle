import { describe, it, expect } from 'vitest'
import {
  getCachedAssessment,
  cacheAssessment,
  serializeCache,
  deserializeCache,
} from './brew-v2-assessment-cache'
import type { CardAssessment } from './brew-v2-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAssessment(overrides?: Partial<CardAssessment>): CardAssessment {
  return {
    pros: ['Strong synergy with commander', 'Low CMC'],
    cons: ['Fragile body'],
    fit_score: 8,
    fit_note: 'Fits the aristocrats shell well. Triggers on every sacrifice.',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// getCachedAssessment
// ---------------------------------------------------------------------------

describe('getCachedAssessment', () => {
  it('returns null for an empty cache', () => {
    const cache = new Map<string, CardAssessment>()
    expect(getCachedAssessment(cache, 'Sol Ring')).toBeNull()
  })

  it('returns null when the card is not in cache', () => {
    const cache = new Map<string, CardAssessment>()
    cache.set('Sol Ring', makeAssessment())
    expect(getCachedAssessment(cache, 'Arcane Signet')).toBeNull()
  })

  it('returns the cached assessment when the card exists', () => {
    const cache = new Map<string, CardAssessment>()
    const assessment = makeAssessment({ fit_score: 9 })
    cache.set('Viscera Seer', assessment)
    expect(getCachedAssessment(cache, 'Viscera Seer')).toEqual(assessment)
  })

  it('is case-sensitive on card names', () => {
    const cache = new Map<string, CardAssessment>()
    cache.set('Sol Ring', makeAssessment())
    expect(getCachedAssessment(cache, 'sol ring')).toBeNull()
    expect(getCachedAssessment(cache, 'SOL RING')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// cacheAssessment
// ---------------------------------------------------------------------------

describe('cacheAssessment', () => {
  it('stores an assessment that can be retrieved', () => {
    const cache = new Map<string, CardAssessment>()
    const assessment = makeAssessment()
    cacheAssessment(cache, 'Blood Artist', assessment)
    expect(getCachedAssessment(cache, 'Blood Artist')).toEqual(assessment)
  })

  it('overwrites an existing entry for the same card', () => {
    const cache = new Map<string, CardAssessment>()
    const first = makeAssessment({ fit_score: 5 })
    const second = makeAssessment({ fit_score: 9 })
    cacheAssessment(cache, 'Skullclamp', first)
    cacheAssessment(cache, 'Skullclamp', second)
    expect(getCachedAssessment(cache, 'Skullclamp')).toEqual(second)
  })

  it('stores multiple cards independently', () => {
    const cache = new Map<string, CardAssessment>()
    const a = makeAssessment({ fit_score: 7 })
    const b = makeAssessment({ fit_score: 3 })
    cacheAssessment(cache, 'Card A', a)
    cacheAssessment(cache, 'Card B', b)
    expect(getCachedAssessment(cache, 'Card A')).toEqual(a)
    expect(getCachedAssessment(cache, 'Card B')).toEqual(b)
  })
})

// ---------------------------------------------------------------------------
// serializeCache
// ---------------------------------------------------------------------------

describe('serializeCache', () => {
  it('serializes an empty cache to "{}"', () => {
    const cache = new Map<string, CardAssessment>()
    expect(serializeCache(cache)).toBe('{}')
  })

  it('serializes a cache with one entry', () => {
    const cache = new Map<string, CardAssessment>()
    const assessment = makeAssessment()
    cache.set('Sol Ring', assessment)

    const json = serializeCache(cache)
    const parsed = JSON.parse(json)
    expect(parsed['Sol Ring']).toEqual(assessment)
  })

  it('serializes a cache with multiple entries', () => {
    const cache = new Map<string, CardAssessment>()
    cache.set('Card A', makeAssessment({ fit_score: 5 }))
    cache.set('Card B', makeAssessment({ fit_score: 10 }))

    const json = serializeCache(cache)
    const parsed = JSON.parse(json)
    expect(Object.keys(parsed)).toHaveLength(2)
    expect(parsed['Card A'].fit_score).toBe(5)
    expect(parsed['Card B'].fit_score).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// deserializeCache
// ---------------------------------------------------------------------------

describe('deserializeCache', () => {
  it('returns an empty Map for null input', () => {
    const cache = deserializeCache(null)
    expect(cache.size).toBe(0)
  })

  it('returns an empty Map for undefined input', () => {
    const cache = deserializeCache(undefined)
    expect(cache.size).toBe(0)
  })

  it('returns an empty Map for empty string', () => {
    const cache = deserializeCache('')
    expect(cache.size).toBe(0)
  })

  it('returns an empty Map for invalid JSON', () => {
    const cache = deserializeCache('not valid json {{{')
    expect(cache.size).toBe(0)
  })

  it('returns an empty Map for "{}" input', () => {
    const cache = deserializeCache('{}')
    expect(cache.size).toBe(0)
  })

  it('deserializes a valid JSON object into a Map', () => {
    const assessment = makeAssessment()
    const json = JSON.stringify({ 'Sol Ring': assessment })
    const cache = deserializeCache(json)
    expect(cache.size).toBe(1)
    expect(cache.get('Sol Ring')).toEqual(assessment)
  })

  it('preserves multiple entries', () => {
    const a = makeAssessment({ fit_score: 4 })
    const b = makeAssessment({ fit_score: 9 })
    const json = JSON.stringify({ 'Card A': a, 'Card B': b })
    const cache = deserializeCache(json)
    expect(cache.size).toBe(2)
    expect(cache.get('Card A')).toEqual(a)
    expect(cache.get('Card B')).toEqual(b)
  })
})

// ---------------------------------------------------------------------------
// Round-trip: serialize → deserialize
// ---------------------------------------------------------------------------

describe('serialize → deserialize round-trip', () => {
  it('produces an identical cache after round-trip', () => {
    const original = new Map<string, CardAssessment>()
    original.set('Viscera Seer', makeAssessment({ fit_score: 8 }))
    original.set('Blood Artist', makeAssessment({ fit_score: 9, pros: ['Drain on each death'] }))
    original.set('Zulaport Cutthroat', makeAssessment({ fit_score: 7 }))

    const json = serializeCache(original)
    const restored = deserializeCache(json)

    expect(restored.size).toBe(original.size)
    for (const [key, value] of original) {
      expect(restored.get(key)).toEqual(value)
    }
  })

  it('round-trips an empty cache', () => {
    const original = new Map<string, CardAssessment>()
    const json = serializeCache(original)
    const restored = deserializeCache(json)
    expect(restored.size).toBe(0)
  })
})
