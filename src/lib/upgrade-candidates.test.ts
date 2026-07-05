import { describe, it, expect } from 'vitest'
import {
  sortCandidates,
  filterCandidates,
  partitionBySource,
  type UpgradeCandidate,
  type SortMode,
  type FilterChip,
} from './upgrade-candidates'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<UpgradeCandidate> = {}): UpgradeCandidate {
  return {
    priority: 1,
    impact: 50,
    source: 'analysis',
    cut: {
      card_name: 'Cut Card',
      reason: 'Underperforming',
      ownership_status: 'original',
    },
    add: {
      card_name: 'Add Card',
      reason: 'Better synergy',
      ownership_status: 'not_owned',
      edhrec_percent: 40,
      price: 3.5,
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// sortCandidates
// ---------------------------------------------------------------------------

describe('sortCandidates', () => {
  it('sorts by impact descending', () => {
    const candidates = [
      makeCandidate({ impact: 30 }),
      makeCandidate({ impact: 80 }),
      makeCandidate({ impact: 50 }),
    ]
    const result = sortCandidates(candidates, 'impact')
    expect(result.map((c) => c.impact)).toEqual([80, 50, 30])
  })

  it('sorts by cheapest (price ascending)', () => {
    const candidates = [
      makeCandidate({ add: { ...makeCandidate().add, price: 10 } }),
      makeCandidate({ add: { ...makeCandidate().add, price: 2 } }),
      makeCandidate({ add: { ...makeCandidate().add, price: 5 } }),
    ]
    const result = sortCandidates(candidates, 'cheapest')
    expect(result.map((c) => c.add.price)).toEqual([2, 5, 10])
  })

  it('sorts by owned (ownership tier ascending)', () => {
    const candidates = [
      makeCandidate({ add: { ...makeCandidate().add, ownership_status: 'not_owned' } }),
      makeCandidate({ add: { ...makeCandidate().add, ownership_status: 'original' } }),
      makeCandidate({ add: { ...makeCandidate().add, ownership_status: 'proxy' } }),
    ]
    const result = sortCandidates(candidates, 'owned')
    expect(result.map((c) => c.add.ownership_status)).toEqual([
      'original',
      'proxy',
      'not_owned',
    ])
  })

  it('sorts by edhrec percentage descending', () => {
    const candidates = [
      makeCandidate({ add: { ...makeCandidate().add, edhrec_percent: 20 } }),
      makeCandidate({ add: { ...makeCandidate().add, edhrec_percent: 80 } }),
      makeCandidate({ add: { ...makeCandidate().add, edhrec_percent: 50 } }),
    ]
    const result = sortCandidates(candidates, 'edhrec')
    expect(result.map((c) => c.add.edhrec_percent)).toEqual([80, 50, 20])
  })

  it('treats missing price as 999 for cheapest sort', () => {
    const candidates = [
      makeCandidate({ add: { ...makeCandidate().add, price: undefined } }),
      makeCandidate({ add: { ...makeCandidate().add, price: 1 } }),
    ]
    const result = sortCandidates(candidates, 'cheapest')
    expect(result[0].add.price).toBe(1)
    expect(result[1].add.price).toBeUndefined()
  })

  it('treats missing edhrec_percent as 0', () => {
    const candidates = [
      makeCandidate({ add: { ...makeCandidate().add, edhrec_percent: undefined } }),
      makeCandidate({ add: { ...makeCandidate().add, edhrec_percent: 30 } }),
    ]
    const result = sortCandidates(candidates, 'edhrec')
    expect(result[0].add.edhrec_percent).toBe(30)
    expect(result[1].add.edhrec_percent).toBeUndefined()
  })

  it('does not mutate the original array', () => {
    const candidates = [
      makeCandidate({ impact: 30 }),
      makeCandidate({ impact: 80 }),
    ]
    const original = [...candidates]
    sortCandidates(candidates, 'impact')
    expect(candidates).toEqual(original)
  })
})

// ---------------------------------------------------------------------------
// filterCandidates
// ---------------------------------------------------------------------------

describe('filterCandidates', () => {
  it('owned_only keeps original and proxy, excludes not_owned', () => {
    const candidates = [
      makeCandidate({ add: { ...makeCandidate().add, ownership_status: 'original' } }),
      makeCandidate({ add: { ...makeCandidate().add, ownership_status: 'proxy' } }),
      makeCandidate({ add: { ...makeCandidate().add, ownership_status: 'not_owned' } }),
    ]
    const result = filterCandidates(candidates, new Set<FilterChip>(['owned_only']))
    expect(result).toHaveLength(2)
    expect(result.every((c) => c.add.ownership_status !== 'not_owned')).toBe(true)
  })

  it('under_5 keeps candidates with price < 5', () => {
    const candidates = [
      makeCandidate({ add: { ...makeCandidate().add, price: 3 } }),
      makeCandidate({ add: { ...makeCandidate().add, price: 5 } }),
      makeCandidate({ add: { ...makeCandidate().add, price: 7 } }),
    ]
    const result = filterCandidates(candidates, new Set<FilterChip>(['under_5']))
    expect(result).toHaveLength(1)
    expect(result[0].add.price).toBe(3)
  })

  it('under_5 treats missing price as 0 (passes filter)', () => {
    const candidates = [
      makeCandidate({ add: { ...makeCandidate().add, price: undefined } }),
      makeCandidate({ add: { ...makeCandidate().add, price: 10 } }),
    ]
    const result = filterCandidates(candidates, new Set<FilterChip>(['under_5']))
    expect(result).toHaveLength(1)
    expect(result[0].add.price).toBeUndefined()
  })

  it('combines filters (intersection)', () => {
    const candidates = [
      makeCandidate({
        add: { ...makeCandidate().add, ownership_status: 'original', price: 3 },
      }),
      makeCandidate({
        add: { ...makeCandidate().add, ownership_status: 'original', price: 10 },
      }),
      makeCandidate({
        add: { ...makeCandidate().add, ownership_status: 'not_owned', price: 2 },
      }),
    ]
    const result = filterCandidates(
      candidates,
      new Set<FilterChip>(['owned_only', 'under_5'])
    )
    expect(result).toHaveLength(1)
    expect(result[0].add.ownership_status).toBe('original')
    expect(result[0].add.price).toBe(3)
  })

  it('empty filter set returns all candidates', () => {
    const candidates = [makeCandidate(), makeCandidate(), makeCandidate()]
    const result = filterCandidates(candidates, new Set<FilterChip>())
    expect(result).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// partitionBySource
// ---------------------------------------------------------------------------

describe('partitionBySource', () => {
  it('places debrief candidates before analysis candidates', () => {
    const candidates = [
      makeCandidate({ source: 'analysis', impact: 90 }),
      makeCandidate({ source: 'debrief', impact: 20 }),
      makeCandidate({ source: 'analysis', impact: 70 }),
      makeCandidate({ source: 'debrief', impact: 10 }),
    ]
    const result = partitionBySource(candidates)
    expect(result[0].source).toBe('debrief')
    expect(result[1].source).toBe('debrief')
    expect(result[2].source).toBe('analysis')
    expect(result[3].source).toBe('analysis')
  })

  it('preserves order within each partition', () => {
    const candidates = [
      makeCandidate({ source: 'analysis', impact: 90 }),
      makeCandidate({ source: 'debrief', impact: 20 }),
      makeCandidate({ source: 'analysis', impact: 70 }),
      makeCandidate({ source: 'debrief', impact: 10 }),
    ]
    const result = partitionBySource(candidates)
    // Debrief partition preserves original relative order
    expect(result[0].impact).toBe(20)
    expect(result[1].impact).toBe(10)
    // Analysis partition preserves original relative order
    expect(result[2].impact).toBe(90)
    expect(result[3].impact).toBe(70)
  })

  it('handles all-debrief input', () => {
    const candidates = [
      makeCandidate({ source: 'debrief' }),
      makeCandidate({ source: 'debrief' }),
    ]
    const result = partitionBySource(candidates)
    expect(result).toHaveLength(2)
    expect(result.every((c) => c.source === 'debrief')).toBe(true)
  })

  it('handles all-analysis input', () => {
    const candidates = [
      makeCandidate({ source: 'analysis' }),
      makeCandidate({ source: 'analysis' }),
    ]
    const result = partitionBySource(candidates)
    expect(result).toHaveLength(2)
    expect(result.every((c) => c.source === 'analysis')).toBe(true)
  })

  it('handles empty input', () => {
    expect(partitionBySource([])).toEqual([])
  })
})
