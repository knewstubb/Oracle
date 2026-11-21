import { describe, it, expect } from 'vitest'
import { manaCurveBuckets, avgManaValue, curveByColour, colourBalance, colourNeeds, cardCountView, cardsSectionView, railBuildStatus } from './deck-rail-stats'
import { computeDeckReadiness } from './deck-readiness'

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

describe('railBuildStatus', () => {
  it.each([0, 62, 99, 100, 101])('matches computeDeckReadiness for %i cards (all sleeved)', (n) => {
    const slots = Array.from({ length: n }, () => ({ copy_id: 1 }))
    const expected = computeDeckReadiness(slots, 100, 'exact')
    expect(railBuildStatus({ size: n, sleeved: n }, 100)).toEqual({ state: expected.state, sleeved: expected.sleeved, of: 100 })
  })
  it('62 of 100 sleeved in a full list is Assembling; none sleeved is Brewing; all 100 is Playable', () => {
    expect(railBuildStatus({ size: 100, sleeved: 62 }, 100)).toEqual({ state: 'assembling', sleeved: 62, of: 100 })
    expect(railBuildStatus({ size: 100, sleeved: 0 }, 100).state).toBe('brewing')
    expect(railBuildStatus({ size: 100, sleeved: 100 }, 100).state).toBe('playable')
  })
  it('an 84-card list with every card sleeved is Assembling, not Playable', () => {
    expect(railBuildStatus({ size: 84, sleeved: 84 }, 100)).toEqual({ state: 'assembling', sleeved: 84, of: 100 })
  })
  it('uses the list size as the denominator when the format has no deck size', () => {
    expect(railBuildStatus({ size: 40, sleeved: 10 }, null).of).toBe(40)
  })
})

const basic = (name: string, type: string, quantity: number) => ({ card_name: name, mana_cost: null, type_line: `Basic Land — ${type}`, quantity })
describe('avgManaValue', () => {
  it('weights by quantity and leaves out lands and cards with no cost', () => {
    // (1*2 + 4*1) / 3 = 2
    expect(avgManaValue([spell('Elf', '{G}', 2), spell('Big', '{3}{G}'), land('Forest', 30), spell('Mystery', null, 5)])).toBe(2)
  })
  it('is null when there is nothing to average', () => {
    expect(avgManaValue([land('Forest', 36)])).toBeNull()
  })
  it('counts a 9-cost card at 9, not at the 7+ column cap', () => {
    expect(avgManaValue([spell('Big', '{9}')])).toBe(9)
  })
})

describe('curveByColour', () => {
  it('drops the 0 column when it is empty and keeps it when a free card exists', () => {
    expect(curveByColour([spell('Elf', '{G}')]).columns.map((c) => c.label)).toEqual(['1', '2', '3', '4', '5', '6', '7+'])
    expect(curveByColour([spell('Ornithopter', '{0}')]).columns.map((c) => c.label)[0]).toBe('0')
  })
  it('splits a multicolour card evenly and puts colourless cards in grey', () => {
    const col = curveByColour([spell('Rock', '{2}', 2), spell('Gold', '{1}{W}{B}'), spell('Mono', '{1}{G}')]).columns
    const two = col.find((c) => c.label === '2')!
    expect(two.total).toBe(3)
    expect(two.segments).toEqual([{ colour: 'G', count: 1 }, { colour: 'C', count: 2 }])
    const three = col.find((c) => c.label === '3')!
    expect(three.segments).toEqual([{ colour: 'W', count: 0.5 }, { colour: 'B', count: 0.5 }])
  })
  it('leaves lands out and counts costless spells as unknown', () => {
    const r = curveByColour([land('Forest', 10), spell('Mystery', null, 2), spell('Elf', '{G}')])
    expect(r.unknown).toBe(2)
    expect(r.columns.reduce((n, c) => n + c.total, 0)).toBe(1)
  })
})

describe('colourBalance', () => {
  const lands = (g: number, w: number) => [basic('Forest', 'Forest', g), basic('Plains', 'Plains', w)]
  it('says colourless for a deck with no colour identity', () => {
    expect(colourBalance([spell('Rock', '{2}')], '').kind).toBe('colourless')
  })
  it('is mono for one colour: no chip, no split', () => {
    const b = colourBalance([spell('Elf', '{G}', 3), ...lands(30, 0)], 'G')
    expect(b.kind).toBe('mono')
    expect(b.underColours).toEqual([])
  })
  // 50 green pips and 50 white pips against 50/50 sources is balanced; shift the lands to test the 5-point line.
  const pips = (g: number, w: number) => [spell('Elf', '{G}', g), spell('Mage', '{W}', w)]
  it('flags a colour whose sources trail its pips by 5 points', () => {
    // pips 55 / 45 percent, sources 50 / 50: green trails by 5.
    const b = colourBalance([...pips(55, 45), ...lands(50, 50)], 'GW')
    const g = b.rows.find((r) => r.colour === 'G')!
    expect(g).toMatchObject({ demandPct: 55, supplyPct: 50, gap: 5, under: true })
    expect(b.underColours).toEqual(['G'])
  })
  it('does not flag a 4-point gap', () => {
    const b = colourBalance([...pips(54, 46), ...lands(50, 50)], 'GW')
    expect(b.rows.find((r) => r.colour === 'G')).toMatchObject({ gap: 4, under: false })
    expect(b.underColours).toEqual([])
  })
  it('flags nothing when no land makes any identity colour (nothing to compare)', () => {
    const b = colourBalance(pips(5, 5), 'GW')
    expect(b.rows.every((r) => !r.under)).toBe(true)
  })
  it('measures sources as a share of the identity colours sources', () => {
    const b = colourBalance([...pips(1, 1), ...lands(30, 10)], 'GW')
    expect(b.rows.find((r) => r.colour === 'G')!.supplyPct).toBe(75)
    expect(b.rows.find((r) => r.colour === 'W')!.supplyPct).toBe(25)
  })
})

describe('cardsSectionView', () => {
  const view = (total: number, sleeved: number, issues: Array<{ reason: 'banned' | 'color_identity' | 'over_limit' }> = []) =>
    cardsSectionView({
      total,
      deckSize: 100,
      sleeved,
      readiness: railBuildStatus({ size: total, sleeved }, 100).state,
      issues: issues.map((i) => ({ cardName: 'X', details: '', ...i })),
    })
  it('A: 71 of 100 sleeved is Assembling and Legal, with 29 not sleeved', () => {
    const v = view(100, 71)
    expect(v).toMatchObject({ count: '100', countSuffix: '/ 100 cards', amber: false, status: 'assembling', legal: true })
    expect(v.problems).toEqual([{ key: 'unsleeved', text: '29 cards not sleeved', right: '71 / 100' }])
  })
  it('B: nothing sleeved is Brewing and Legal, with 100 not sleeved', () => {
    const v = view(100, 0)
    expect(v).toMatchObject({ status: 'brewing', legal: true })
    expect(v.problems).toEqual([{ key: 'unsleeved', text: '100 cards not sleeved', right: '0 / 100' }])
  })
  it('C: one card outside the colour identity is Assembling and Not legal', () => {
    const v = view(100, 100, [{ reason: 'color_identity' }])
    expect(v).toMatchObject({ status: 'assembling', legal: false })
    expect(v.problems.map((p) => p.text)).toEqual(['1 card outside colour identity'])
  })
  it('103 cards: amber, Not legal, 3 cards over, sleeved count stops at 100', () => {
    const v = view(103, 103)
    expect(v).toMatchObject({ amber: true, legal: false, status: 'assembling' })
    expect(v.problems).toEqual([{ key: 'over', text: '3 cards over' }])
    const part = view(103, 90)
    expect(part.problems).toEqual([{ key: 'over', text: '3 cards over' }, { key: 'unsleeved', text: '10 cards not sleeved', right: '90 / 100' }])
  })
  it('84 cards: 16 cards short; unsleeved counts against the list size', () => {
    const v = view(84, 80)
    expect(v).toMatchObject({ amber: true, legal: false })
    expect(v.problems.map((p) => p.text)).toEqual(['16 cards short', '4 cards not sleeved'])
    expect(view(101, 0).problems[0].text).toBe('1 card over')
  })
  it('100 all sleeved and legal is Playable with no list', () => {
    const v = view(100, 100)
    expect(v).toMatchObject({ status: 'playable', legal: true, problems: [] })
  })
})
