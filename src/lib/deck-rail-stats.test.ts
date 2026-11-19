import { describe, it, expect } from 'vitest'
import { manaCurveBuckets, colourNeeds, cardCountView } from './deck-rail-stats'

const spell = (name: string, mana_cost: string | null, quantity = 1) => ({ card_name: name, mana_cost, type_line: 'Creature — Elf', quantity })
const land = (name: string, quantity = 1) => ({ card_name: name, mana_cost: null, type_line: 'Basic Land — Forest', quantity })

describe('manaCurveBuckets', () => {
  it('puts cost 0 in the first bucket and 7 or more in the last', () => {
    const { buckets } = manaCurveBuckets([spell('Ornithopter', '{0}'), spell('Big', '{7}'), spell('Bigger', '{9}{G}', 2), spell('Two', '{1}{G}')])
    expect(buckets).toEqual([1, 0, 1, 0, 0, 0, 0, 3])
  })
  it('leaves lands out', () => {
    const { buckets, unknown } = manaCurveBuckets([land('Forest', 10), spell('Elf', '{G}')])
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(1)
    expect(unknown).toBe(0)
  })
  it('counts spells with no mana cost as unknown and never guesses a bucket', () => {
    const { buckets, unknown } = manaCurveBuckets([spell('Mystery', null, 2), spell('Blank', ''), spell('Elf', '{G}')])
    expect(unknown).toBe(3)
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(1)
  })
})

describe('colourNeeds', () => {
  it('reports a colourless deck', () => {
    expect(colourNeeds([spell('Rock', '{2}')], '')).toMatchObject({ colourless: true, rows: [] })
  })
  it('gives each colour its share of symbols and its land sources', () => {
    const cards = [spell('Elf', '{G}', 3), spell('Mage', '{W}'), land('Forest', 4), { card_name: 'Plains', mana_cost: null, type_line: 'Basic Land — Plains', quantity: 1 }]
    const r = colourNeeds(cards, 'GW')
    expect(r.landCount).toBe(5)
    expect(r.rows.map((x) => x.colour)).toEqual(['W', 'G'])
    const g = r.rows.find((x) => x.colour === 'G')!
    expect(g).toMatchObject({ symbols: 3, symbolsPct: 75, sources: 4 })
    expect(r.rows.find((x) => x.colour === 'W')).toMatchObject({ symbolsPct: 25, sources: 1 })
  })
  it('shows 0 percent for every colour when there are no coloured symbols', () => {
    expect(colourNeeds([land('Forest')], 'G').rows[0].symbolsPct).toBe(0)
  })
})

describe('cardCountView', () => {
  it('shows how many are over', () => {
    expect(cardCountView(102, 100)).toEqual({ label: '102 / 100', over: 2 })
  })
  it('shows nothing over at 100 or under', () => {
    expect(cardCountView(100, 100).over).toBe(0)
    expect(cardCountView(60, 100).over).toBe(0)
  })
  it('has no target for some formats', () => {
    expect(cardCountView(40, null)).toEqual({ label: '40', over: 0 })
  })
})
