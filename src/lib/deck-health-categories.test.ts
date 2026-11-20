import { describe, it, expect } from 'vitest'
import { buildDeckHealth, DEFAULT_RANGES, type HealthDeckCard } from './deck-health'
import { healthCardsFromRows } from './deck-health-server'

// HC-02: the deck total is a count of different cards. It is never summed from category counts,
// and extra categories on a card change nothing in Deck health yet (health still reads card text).
type Rows = Parameters<typeof healthCardsFromRows>[0]

const rows = (list: Array<{ name: string; categories: string }>): Rows =>
  list.map((r, i) => ({ id: i + 1, card_name: r.name, quantity: 1, categories: r.categories, is_commander: false, command_zone_role: null })) as unknown as Rows

const refs = new Map([
  ['Cultivate', { type_line: 'Sorcery', oracle_text: 'Search your library for up to two basic land cards, put one onto the battlefield tapped and the other into your hand, then shuffle.' }],
  ['Forest', { type_line: 'Basic Land — Forest', oracle_text: '({T}: Add {G}.)' }],
]) as unknown as Parameters<typeof healthCardsFromRows>[1]

describe('HC-02: totals are not summed from categories', () => {
  it('a card holding five categories counts once in the deck total', () => {
    const cards = healthCardsFromRows(
      rows([
        { name: 'Cultivate', categories: JSON.stringify(['Sorcery', 'Ramp', 'Game Plan & Win Conditions', 'Payoffs', 'Protection']) },
        { name: 'Forest', categories: JSON.stringify(['Land']) },
      ]),
      refs,
    )
    const h = buildDeckHealth(cards)
    expect(h.mainDeckCount).toBe(2)
    // the number of category names on the cards (6) is not the deck total
    expect(h.mainDeckCount).not.toBe(6)
  })

  it('extra categories do not change any row count', () => {
    const one = buildDeckHealth(healthCardsFromRows(rows([{ name: 'Cultivate', categories: '["Sorcery"]' }]), refs))
    const five = buildDeckHealth(
      healthCardsFromRows(rows([{ name: 'Cultivate', categories: JSON.stringify(['Sorcery', 'Ramp', 'Card Advantage', 'Targeted Removal', 'Board Wipes']) }]), refs),
    )
    expect(five.rows.map((r) => r.have)).toEqual(one.rows.map((r) => r.have))
    expect(five.mainDeckCount).toBe(one.mainDeckCount)
  })

  it('rows can add to more than the deck total, and the total stays the number of cards', () => {
    const cards: HealthDeckCard[] = [
      // Damn-like: removal and wipes together, so two rows
      { cardName: 'Two Rows', quantity: 1, typeLine: 'Sorcery', oracleText: 'Destroy target creature. Destroy all creatures.', inMainDeck: true },
      { cardName: 'Forest', quantity: 1, typeLine: 'Basic Land — Forest', oracleText: null, inMainDeck: true },
    ]
    const h = buildDeckHealth(cards)
    expect(h.mainDeckCount).toBe(2)
    expect(h.rowsTotal).toBeGreaterThan(h.mainDeckCount)
    expect(h.multiRowCards).toBe(1)
  })

  it('a card whose first category is Maybeboard stays out of the total, whatever its other categories', () => {
    const cards = healthCardsFromRows(rows([{ name: 'Cultivate', categories: JSON.stringify(['Maybeboard', 'Ramp']) }, { name: 'Forest', categories: '["Land"]' }]), refs)
    expect(buildDeckHealth(cards).mainDeckCount).toBe(1)
    expect(DEFAULT_RANGES.ramp.min).toBe(10)
  })
})
