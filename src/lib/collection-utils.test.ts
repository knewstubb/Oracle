import { describe, it, expect } from 'vitest'
import {
  filterCards,
  paginateCards,
  abbreviate,
  getPaginationRange,
  determineStatus,
  PAGE_SIZE,
  type AllocationRow,
  type FilterFlags,
} from './collection-utils'

/* ─── Test helpers ──────────────────────────────────────────────────── */

function makeCard(overrides: Partial<AllocationRow> = {}): AllocationRow {
  return {
    cardName: 'Sol Ring',
    typeLine: 'Artifact',
    isConflict: false,
    decks: [{ deckId: 1, deckName: 'Deck A', status: 'original' }],
    ownedCopies: 1,
    totalDemand: 1,
    ...overrides,
  }
}

/* ─── filterCards ───────────────────────────────────────────────────── */

describe('filterCards', () => {
  const cards: AllocationRow[] = [
    makeCard({ cardName: 'Sol Ring', isConflict: true, totalDemand: 2, decks: [{ deckId: 1, deckName: 'A', status: 'original' }, { deckId: 2, deckName: 'B', status: 'proxy' }] }),
    makeCard({ cardName: 'Command Tower', isConflict: false, totalDemand: 1, decks: [{ deckId: 1, deckName: 'A', status: 'original' }] }),
    makeCard({ cardName: 'Island', isConflict: false, totalDemand: 0, decks: [] }),
    makeCard({ cardName: 'Mana Crypt', isConflict: false, totalDemand: 1, decks: [{ deckId: 2, deckName: 'B', status: 'proxy' }] }),
  ]

  it('returns all cards when no filters active', () => {
    const result = filterCards(cards, { conflicts: false, proxies: false, notInDeck: false })
    expect(result).toHaveLength(4)
  })

  it('filters to conflicts only', () => {
    const result = filterCards(cards, { conflicts: true, proxies: false, notInDeck: false })
    expect(result).toHaveLength(1)
    expect(result[0].cardName).toBe('Sol Ring')
  })

  it('filters to proxies only', () => {
    const result = filterCards(cards, { conflicts: false, proxies: true, notInDeck: false })
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.cardName)).toEqual(['Sol Ring', 'Mana Crypt'])
  })

  it('filters to not-in-deck only', () => {
    const result = filterCards(cards, { conflicts: false, proxies: false, notInDeck: true })
    expect(result).toHaveLength(1)
    expect(result[0].cardName).toBe('Island')
  })

  it('applies AND semantics for multiple filters', () => {
    const result = filterCards(cards, { conflicts: true, proxies: true, notInDeck: false })
    expect(result).toHaveLength(1)
    expect(result[0].cardName).toBe('Sol Ring')
  })

  it('returns empty when conflicting filters exclude all', () => {
    const result = filterCards(cards, { conflicts: true, proxies: false, notInDeck: true })
    expect(result).toHaveLength(0)
  })
})

/* ─── paginateCards ─────────────────────────────────────────────────── */

describe('paginateCards', () => {
  const cards = Array.from({ length: 250 }, (_, i) =>
    makeCard({ cardName: `Card ${i}` })
  )

  it('returns first page of pageSize items', () => {
    const result = paginateCards(cards, 1, 100)
    expect(result).toHaveLength(100)
    expect(result[0].cardName).toBe('Card 0')
    expect(result[99].cardName).toBe('Card 99')
  })

  it('returns second page starting at correct offset', () => {
    const result = paginateCards(cards, 2, 100)
    expect(result).toHaveLength(100)
    expect(result[0].cardName).toBe('Card 100')
  })

  it('returns remaining items on last page', () => {
    const result = paginateCards(cards, 3, 100)
    expect(result).toHaveLength(50)
    expect(result[0].cardName).toBe('Card 200')
  })

  it('returns empty array for page beyond range', () => {
    const result = paginateCards(cards, 4, 100)
    expect(result).toHaveLength(0)
  })

  it('handles empty array', () => {
    const result = paginateCards([], 1, 100)
    expect(result).toHaveLength(0)
  })
})

/* ─── abbreviate ────────────────────────────────────────────────────── */

describe('abbreviate', () => {
  it('returns short names unchanged', () => {
    expect(abbreviate('Deck A', 8)).toBe('Deck A')
  })

  it('returns names at max length unchanged', () => {
    expect(abbreviate('12345678', 8)).toBe('12345678')
  })

  it('truncates names longer than max with ellipsis', () => {
    expect(abbreviate('World Breaker', 8)).toBe('World B…')
  })

  it('result is never longer than max', () => {
    const result = abbreviate('Extremely Long Deck Name', 8)
    expect(result.length).toBe(8)
  })

  it('uses default max of 8', () => {
    expect(abbreviate('Short')).toBe('Short')
    expect(abbreviate('LongDeckName')).toBe('LongDec…')
  })
})

/* ─── getPaginationRange ────────────────────────────────────────────── */

describe('getPaginationRange', () => {
  it('returns all pages when total <= 5', () => {
    expect(getPaginationRange(1, 3)).toEqual([1, 2, 3])
    expect(getPaginationRange(2, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('includes first and last page always', () => {
    const range = getPaginationRange(5, 10)
    expect(range[0]).toBe(1)
    expect(range[range.length - 1]).toBe(10)
  })

  it('shows ellipsis when current is far from start', () => {
    const range = getPaginationRange(5, 10)
    expect(range).toContain('...')
  })

  it('shows context around current page', () => {
    const range = getPaginationRange(5, 10)
    expect(range).toContain(4)
    expect(range).toContain(5)
    expect(range).toContain(6)
  })

  it('handles page 1 of many', () => {
    const range = getPaginationRange(1, 10)
    expect(range[0]).toBe(1)
    expect(range).toContain(2)
    // Should not have leading ellipsis
    expect(range[1]).not.toBe('...')
  })

  it('handles last page', () => {
    const range = getPaginationRange(10, 10)
    expect(range[range.length - 1]).toBe(10)
    expect(range).toContain(9)
  })
})

/* ─── determineStatus ───────────────────────────────────────────────── */

describe('determineStatus', () => {
  it('returns muted "Not in a deck" when totalDemand === 0', () => {
    const result = determineStatus({
      isConflict: false,
      totalDemand: 0,
      ownedCopies: 1,
      decks: [],
    })
    expect(result.label).toBe('● Not in a deck')
    expect(result.variant).toBe('muted')
  })

  it('returns amber when isConflict is true', () => {
    const result = determineStatus({
      isConflict: true,
      totalDemand: 2,
      ownedCopies: 1,
      decks: [
        { status: 'original' },
        { status: 'proxy' },
      ],
    })
    expect(result.variant).toBe('amber')
    expect(result.label).toContain('orig')
    expect(result.label).toContain('proxy')
  })

  it('returns amber when proxyCount > 0 even without conflict', () => {
    const result = determineStatus({
      isConflict: false,
      totalDemand: 2,
      ownedCopies: 1,
      decks: [
        { status: 'original' },
        { status: 'proxy' },
      ],
    })
    expect(result.variant).toBe('amber')
    expect(result.label).toBe('◐ 1 orig · 1 proxy')
  })

  it('returns teal "Multiple copies" when origCount > 1', () => {
    const result = determineStatus({
      isConflict: false,
      totalDemand: 2,
      ownedCopies: 3,
      decks: [
        { status: 'original' },
        { status: 'original' },
      ],
    })
    expect(result.label).toBe('● Multiple copies')
    expect(result.variant).toBe('teal')
  })

  it('returns teal "Original" for single original, no proxies', () => {
    const result = determineStatus({
      isConflict: false,
      totalDemand: 1,
      ownedCopies: 1,
      decks: [{ status: 'original' }],
    })
    expect(result.label).toBe('● Original')
    expect(result.variant).toBe('teal')
  })

  it('totalDemand === 0 takes priority over conflict flag', () => {
    const result = determineStatus({
      isConflict: true,
      totalDemand: 0,
      ownedCopies: 1,
      decks: [],
    })
    expect(result.variant).toBe('muted')
    expect(result.label).toBe('● Not in a deck')
  })
})

/* ─── PAGE_SIZE constant ────────────────────────────────────────────── */

describe('PAGE_SIZE', () => {
  it('equals 100', () => {
    expect(PAGE_SIZE).toBe(100)
  })
})
