/* eslint-disable @typescript-eslint/no-explicit-any -- test results are inspected loosely */
import { describe, it, expect } from 'vitest'
import { parseBracket, resolveBracket, BRACKET_WHY_EMPTY } from '../tools/bracket'
import { listDecks, listDecksInput } from '../tools/list-decks'
import { getDeck, getDeckInput } from '../tools/get-deck'
import { CONNECTOR_TOOLS } from '../tools'
import { hasEq, mockDb } from './mock-db'

const U = 'user-1'
const deck = (id: number, bracket: string | null) => ({ id, name: `Deck ${id}`, commander_name: 'C', format: 'commander', status: 'active', bracket, card_count: 99, is_active: true })

describe('bracket rules (CC-06e)', () => {
  it('parses only whole numbers 1 to 4', () => {
    expect(parseBracket(3)).toBe(3)
    expect(parseBracket('2')).toBe(2)
    expect(parseBracket(' 4 ')).toBe(4)
    for (const bad of [0, 5, 2.5, '', 'Bracket 3', 'high', null, undefined]) expect(parseBracket(bad as never)).toBeNull()
  })
  it('strategy first, then the deck row, else explained as not set', () => {
    expect(resolveBracket(2, '4')).toEqual({ value: 2, source: 'deck_strategy' })
    expect(resolveBracket(null, '4')).toEqual({ value: 4, source: 'deck_row' })
    expect(resolveBracket(null, 'nonsense')).toEqual({ value: null, source: 'not_set', whyEmpty: BRACKET_WHY_EMPTY })
    expect(BRACKET_WHY_EMPTY).toMatch(/Claude cannot set them/)
  })
})

describe('brackets in the tools', () => {
  it('list_decks: a deck with a strategy bracket shows it; a deck without shows null and the explanation', async () => {
    const { db, queries } = mockDb((q) => {
      if (q.table === 'decks') return { data: [deck(1, null), deck(2, null)], count: 2 }
      if (q.table === 'deck_strategy') return { data: [{ deck_id: 1, bracket: 3 }] }
      return { data: [] }
    })
    const r = (await listDecks({ db, userId: U }, listDecksInput.parse({}))) as any
    expect(r.items[0].bracketInfo).toEqual({ value: 3, source: 'deck_strategy' })
    expect(r.items[0].bracket).toBe('3')
    expect(r.items[1].bracketInfo).toMatchObject({ value: null, source: 'not_set', whyEmpty: BRACKET_WHY_EMPTY })
    expect(r.items[1].bracket).toBeNull()
    const sq = queries.find((q) => q.table === 'deck_strategy')!
    expect(hasEq(sq, 'user_id', U)).toBe(true)
  })

  it('get_deck: falls back to the deck row when the strategy screen has none', async () => {
    const { db } = mockDb((q) => (q.table === 'decks' ? { data: [deck(1, '2')] } : { data: [] }))
    const r = (await getDeck({ db, userId: U }, getDeckInput.parse({ deck_id: 1 }))) as any
    expect(r.deck.bracketInfo).toEqual({ value: 2, source: 'deck_row' })
  })

  it('no tool can set a bracket', () => {
    for (const t of CONNECTOR_TOOLS) {
      expect(t.name).not.toMatch(/bracket/i)
      expect(Object.keys((t.inputSchema as any).shape ?? {}).some((k) => /bracket/i.test(k)), t.name).toBe(false)
    }
  })
})
