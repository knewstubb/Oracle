import { describe, it, expect } from 'vitest'
import { buildDeckHealth, type HealthDeckCard } from './deck-health'
import {
  applySettings,
  categoryNamesOnCards,
  countCategory,
  DEFAULT_SETTINGS,
  healthTilesView,
  validateCategoryName,
  validateRange,
  type HealthSettings,
} from './deck-health-settings'

const c = (name: string, typeLine: string, text: string | null, quantity = 1): HealthDeckCard => ({ cardName: name, quantity, typeLine, oracleText: text, inMainDeck: true })
const many = (n: number, prefix: string, typeLine: string, text: string) => Array.from({ length: n }, (_, i) => c(`${prefix} ${i}`, typeLine, text))
const deck = (lands: number, ramp: number, draw: number, kill: number, wipes: number, beaters = 5) =>
  buildDeckHealth([
    c('Forest', 'Basic Land — Forest', null, lands),
    ...many(ramp, 'Rock', 'Artifact', '{T}: Add {G}.'),
    ...many(draw, 'Brain', 'Sorcery', 'Draw two cards.'),
    ...many(kill, 'Kill', 'Instant', 'Destroy target creature.'),
    ...many(wipes, 'Wipe', 'Sorcery', 'Destroy all creatures.'),
    ...many(beaters, 'Beater', 'Creature — Elf', 'Trample'),
  ])
const view = (h: ReturnType<typeof deck>, s: HealthSettings = DEFAULT_SETTINGS, cards: Array<{ categories?: string | null; quantity?: number }> = []) =>
  healthTilesView(applySettings(h, s, cards), s.mode)

describe('default mode', () => {
  it('shows the six rows with the standard ranges and Game Plan as a total', () => {
    const v = view(deck(37, 11, 11, 11, 4))
    expect(v.tiles.map((t) => t.label)).toEqual(['Lands', 'Ramp', 'Card Advantage', 'Targeted Removal', 'Board Wipes', 'Game Plan'])
    expect(v.tiles.map((t) => t.rangeText)).toEqual(['35\u201338', '10\u201312', '10\u201312', '10\u201312', '3\u20136', null])
    const gp = v.tiles[5]
    expect(gp.status).toBe('total')
    expect(gp.have).toBe(5)
    expect(v.headline).toEqual({ text: 'On target in every category', problem: false })
  })
  it('puts problems first and words the headline: shortfalls first, then overs', () => {
    const v = view(deck(37, 18, 6, 8, 8))
    expect(v.tiles.slice(0, 4).map((t) => [t.kind, t.status])).toEqual([
      ['card_advantage', 'under'],
      ['targeted_removal', 'under'],
      ['ramp', 'over'],
      ['board_wipes', 'over'],
    ])
    expect(v.headline.text).toBe('Light on card advantage and removal, heavy on ramp and board wipes')
    expect(v.headline.problem).toBe(true)
  })
  it('words a deck that is only over', () => {
    expect(view(deck(37, 18, 11, 11, 4)).headline.text).toBe('Heavy on ramp')
  })
  it('a per-deck override changes the range and the verdict for that row only', () => {
    const s: HealthSettings = { ...DEFAULT_SETTINGS, overrides: { ramp: { min: 5, max: 20 } } }
    const v = view(deck(37, 18, 11, 11, 4), s)
    const ramp = v.tiles.find((t) => t.kind === 'ramp')!
    expect(ramp.status).toBe('on')
    expect(ramp.rangeText).toBe('5\u201320')
    expect(v.tiles.find((t) => t.kind === 'lands')!.rangeText).toBe('35\u201338')
  })
  it('ignores overrides and custom rows when the stored data is unavailable', () => {
    const s: HealthSettings = { available: false, mode: 'custom', overrides: { ramp: { min: 5, max: 20 } }, categories: [] }
    const v = view(deck(37, 18, 11, 11, 4), s)
    expect(v.tiles).toHaveLength(6)
    expect(v.tiles.find((t) => t.kind === 'ramp')!.status).toBe('over')
  })
})

describe('custom mode', () => {
  const cards = [
    { categories: 'Ramp, Mana Rocks', quantity: 1 },
    { categories: 'mana rocks', quantity: 2 },
    { categories: 'Removal', quantity: 1 },
    { categories: 'Maybeboard, Ramp', quantity: 1 },
  ]
  const s: HealthSettings = {
    available: true,
    mode: 'custom',
    overrides: {},
    categories: [
      { id: 1, name: 'Mana Rocks', min: 2, max: 4, proposed: null },
      { id: 2, name: 'Removal', min: 5, max: 8, proposed: null },
      { id: 3, name: 'Tutors', min: null, max: null, proposed: { min: 3, max: 5 } },
      { id: 4, name: 'Wincons', min: null, max: null, proposed: null },
    ],
  }
  it('counts cards by category name, case-insensitive, by quantity, skipping Maybeboard cards', () => {
    expect(countCategory(cards, 'MANA ROCKS')).toBe(3)
    expect(countCategory(cards, 'Ramp')).toBe(1)
  })
  it('gives no verdict to a category with no range or only a proposal', () => {
    const v = view(deck(37, 11, 11, 11, 4), s, cards)
    const by = (n: string) => v.tiles.find((t) => t.label === n)!
    expect(by('Mana Rocks').status).toBe('on')
    expect(by('Removal').status).toBe('under')
    expect(by('Tutors').status).toBe('none')
    expect(by('Tutors').proposed).toEqual({ min: 3, max: 5 })
    expect(by('Wincons').status).toBe('none')
    expect(v.headline.text).toBe('Light on Removal')
  })
  it('says On target everywhere a target is set when nothing is off but some have no target', () => {
    const ok = { ...s, categories: [s.categories[0], s.categories[3]] }
    expect(view(deck(37, 11, 11, 11, 4), ok, cards).headline.text).toBe('On target everywhere a target is set')
  })
  it('says No targets set yet when no category has a target', () => {
    const none = { ...s, categories: [s.categories[3]] }
    expect(view(deck(37, 11, 11, 11, 4), none, cards).headline.text).toBe('No targets set yet')
  })
  it('switching to default and back keeps the custom rows (the settings object is never edited)', () => {
    const toDefault: HealthSettings = { ...s, mode: 'default' }
    const back: HealthSettings = { ...toDefault, mode: 'custom' }
    expect(view(deck(37, 11, 11, 11, 4), toDefault, cards).tiles).toHaveLength(6)
    expect(view(deck(37, 11, 11, 11, 4), back, cards).tiles.map((t) => t.label)).toEqual(['Removal', 'Mana Rocks', 'Tutors', 'Wincons'])
    expect(back.categories).toEqual(s.categories)
  })
})

describe('suggestions and validation', () => {
  it('lists category names on the cards once each, skipping places a card sits', () => {
    expect(categoryNamesOnCards([{ categories: 'Ramp, Mana Rocks' }, { categories: 'ramp' }, { categories: 'Maybeboard' }, { categories: null }])).toEqual(['Mana Rocks', 'Ramp'])
  })
  it('accepts whole numbers 0 to 100 with min <= max', () => {
    expect(validateRange(0, 100).ok).toBe(true)
    expect(validateRange(5, 4).ok).toBe(false)
    expect(validateRange(1.5, 4).ok).toBe(false)
    expect(validateRange(-1, 4).ok).toBe(false)
    expect(validateRange(1, 101).ok).toBe(false)
    expect(validateRange('1', 2).ok).toBe(false)
  })
  it('accepts names of 1 to 60 characters and refuses places a card sits', () => {
    expect(validateCategoryName('  Mana   Rocks ')).toEqual({ ok: true, name: 'Mana Rocks' })
    expect(validateCategoryName('').ok).toBe(false)
    expect(validateCategoryName('x'.repeat(61)).ok).toBe(false)
    for (const n of ['Maybeboard', 'sideboard', 'COMMANDER', 'Companion']) expect(validateCategoryName(n).ok).toBe(false)
  })
})
