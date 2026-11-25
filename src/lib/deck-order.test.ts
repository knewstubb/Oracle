import { describe, it, expect } from 'vitest'
import { compareDecks, deckRanks, moveInOrder, orderDecks } from './deck-order'

describe('compareDecks', () => {
  it('sorts by position, then name, then id', () => {
    const list = [
      { id: 3, name: 'B', position: 2 },
      { id: 2, name: 'A', position: 2 },
      { id: 1, name: 'Z', position: 1 },
      { id: 4, name: 'A', position: 2 },
    ]
    expect([...list].sort(compareDecks).map((d) => d.id)).toEqual([1, 2, 4, 3])
    expect([...deckRanks(list).entries()]).toEqual([[1, 0], [2, 1], [4, 2], [3, 3]])
  })
})

describe('orderDecks', () => {
  it('asks for position, name, id in that order', () => {
    const calls: string[] = []
    const q = { order(c: string) { calls.push(c); return q } }
    orderDecks(q)
    expect(calls).toEqual(['position', 'name', 'id'])
  })
})

describe('moveInOrder', () => {
  const all = [1, 2, 3, 4] // 1 Atraxa (P), 2 Edgar (A), 3 Korvold (P), 4 Prosper (P)
  it('plain grid: drops before a deck', () => {
    expect(moveInOrder(all, all, 4, 2)).toEqual([1, 4, 2, 3])
  })
  it('plain grid: drops at the end', () => {
    expect(moveInOrder(all, all, 1, null)).toEqual([2, 3, 4, 1])
  })
  it('inside a status group only the carried deck moves (spec 6.5 example)', () => {
    expect(moveInOrder(all, [1, 3, 4], 4, 3)).toEqual([1, 2, 4, 3])
  })
  it('end of a group lands after the group last deck', () => {
    expect(moveInOrder(all, [1, 3, 4], 1, null)).toEqual([2, 3, 4, 1])
    expect(moveInOrder([1, 2, 3, 4, 5], [1, 3], 1, null)).toEqual([2, 3, 1, 4, 5])
  })
  it('returns null when nothing changes', () => {
    expect(moveInOrder(all, all, 2, 3)).toBeNull()
    expect(moveInOrder(all, all, 4, null)).toBeNull()
    expect(moveInOrder(all, all, 2, 2)).toBeNull()
  })
  it('refuses a drop outside the group', () => {
    expect(moveInOrder(all, [1, 3, 4], 4, 2)).toBeNull()
    expect(moveInOrder(all, [1, 3, 4], 2, 3)).toBeNull()
  })
})
