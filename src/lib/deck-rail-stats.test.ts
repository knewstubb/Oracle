import { describe, it, expect } from 'vitest'
import { manaCurveBuckets, colourNeeds, cardCountView, cardLegend, legalityView, outsideTheHundred, railBuildStatus, showsPlayableNeedsLegal, toBuyView } from './deck-rail-stats'
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

describe('cardLegend', () => {
  const counts = { size: 84, original: 60, proxy: 4, available: 3, in_hand: 1, claimed: 5, unowned: 2, generic_land: 9, generic_unsleeved: 3 }
  it('groups by sleeved / not sleeved / empty with the convention wording', () => {
    const items = cardLegend(counts, 100)
    expect(items.map((i) => [i.group, i.label, i.count])).toEqual([
      ['sleeved', 'Original', 60],
      ['sleeved', 'Proxy', 4],
      ['sleeved', 'Basics', 6],
      ['notSleeved', 'Open', 4],
      ['notSleeved', 'Basics, not sleeved', 3],
      ['notSleeved', 'In other decks', 5],
      ['notSleeved', 'Unowned', 2],
      ['empty', 'Empty slots', 16],
    ])
  })
  it('hides zero-count categories and never says Available', () => {
    const items = cardLegend({ size: 100, original: 94, proxy: 6 }, 100)
    expect(items.map((i) => i.label)).toEqual(['Original', 'Proxy'])
    expect(items.some((i) => /Available|Open slot/.test(i.label))).toBe(false)
  })
  it('says "Empty slot" for exactly one', () => {
    expect(cardLegend({ size: 99, original: 99 }, 100).at(-1)?.label).toBe('Empty slot')
  })
})

describe('legalityView', () => {
  it('Legal at the full size lists what was checked', () => {
    expect(legalityView({ isLegal: true, issues: [] }, 100, 100)).toEqual({
      status: 'legal',
      bullets: [],
      subline: '100 cards · singleton · colour identity · no banned cards',
    })
  })
  it('Legal but not the full size reads "so far" with the count, and never says 100 cards', () => {
    const v = legalityView({ isLegal: true, issues: [] }, 84, 100)
    expect(v.status).toBe('unverified')
    expect(v.subline).toBe('Nothing found illegal. 84 of 100 cards.')
  })
  it('Not legal lists one bullet per issue', () => {
    const v = legalityView(
      {
        isLegal: false,
        issues: [
          { cardName: 'Mana Crypt', reason: 'banned', details: '' },
          { cardName: 'Swords', reason: 'color_identity', details: '' },
          { cardName: 'Sol Ring', reason: 'over_limit', details: '' },
        ],
      },
      100,
      100,
    )
    expect(v.status).toBe('not_legal')
    expect(v.bullets).toEqual(['1 banned card: Mana Crypt', 'Swords is outside the colour identity', 'Sol Ring: more than one copy'])
  })
})

describe('showsPlayableNeedsLegal', () => {
  it('shows only when Not legal and not Playable', () => {
    expect(showsPlayableNeedsLegal('not_legal', 'assembling')).toBe(true)
    expect(showsPlayableNeedsLegal('not_legal', 'brewing')).toBe(true)
    expect(showsPlayableNeedsLegal('not_legal', 'playable')).toBe(false)
    expect(showsPlayableNeedsLegal('legal', 'assembling')).toBe(false)
    expect(showsPlayableNeedsLegal(null, 'assembling')).toBe(false)
  })
})

describe('outsideTheHundred', () => {
  it('finds the companion, the Maybeboard count and tokens', () => {
    const v = outsideTheHundred([
      { card_name: 'Lurrus', command_zone_role: 'companion', categories: '["Sideboard"]', has_copy: true },
      { card_name: 'A', categories: '["Maybeboard"]', quantity: 2 },
      { card_name: 'B', categories: '["Maybeboard"]' },
      { card_name: 'Elf', categories: '["Tokens"]' },
      { card_name: 'Forest', categories: '["Land"]' },
    ])
    expect(v).toEqual({ companion: { name: 'Lurrus', sleeved: true }, maybeboard: 3, tokens: 1 })
  })
  it('is empty when nothing is outside', () => {
    expect(outsideTheHundred([{ card_name: 'Forest' }])).toEqual({ companion: null, maybeboard: 0, tokens: 0 })
  })
})

describe('toBuyView', () => {
  it('sums prices of the unowned cards and flags partial pricing', () => {
    const cards = [
      { card_name: 'A', price_usd: 10 },
      { card_name: 'B', price_usd: null },
      { card_name: 'C', price_usd: 5 },
    ]
    expect(toBuyView(['A', 'B'], cards)).toEqual({ count: 2, price: 10, partial: true })
    expect(toBuyView(['A'], cards)).toEqual({ count: 1, price: 10, partial: false })
    expect(toBuyView(['B'], cards)).toEqual({ count: 1, price: null, partial: false })
  })
})
