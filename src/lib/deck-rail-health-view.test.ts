import { describe, it, expect } from 'vitest'
import { guideTargets } from './commander-targets'
import { buildDeckHealth, DEFAULT_RANGES, type HealthDeckCard, type DeckHealthResponse } from './deck-health'
import { railHealthView } from './deck-rail-health-view'

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

const withSample = (h: DeckHealthResponse, available: boolean, sample: number | null): DeckHealthResponse => ({ ...h, reference: { available, label: 'x', sample } })

describe('railHealthView', () => {
  it('shows the same have, range and offset as buildDeckHealth for all six rows', () => {
    const h = deck(37, 18, 6, 6, 0)
    const v = railHealthView(h)
    expect(v.rows).toHaveLength(6)
    for (const src of h.rows) {
      const r = v.rows.find((x) => x.kind === src.kind)!
      expect(r.have).toBe(src.have)
      expect(r.rangeText).toBe(src.range ? `${src.range.min} to ${src.range.max}` : null)
      expect(r.delta).toBe(src.offBy < 0 ? src.offBy : null)
    }
  })

  it('uses the Command Zone ranges', () => {
    const v = railHealthView(deck(37, 11, 11, 11, 4))
    expect(v.rows.map((r) => r.rangeText)).toEqual(['35 to 38', '10 to 12', '10 to 12', '10 to 12', '3 to 6', null])
    expect(DEFAULT_RANGES.lands).toEqual({ min: 35, max: 38 })
  })

  it('puts shortfalls first (largest first), then the rest in order, Game Plan last', () => {
    const v = railHealthView(deck(37, 18, 6, 9, 0))
    expect(v.rows.map((r) => r.kind)).toEqual(['card_advantage', 'board_wipes', 'targeted_removal', 'lands', 'ramp', 'game_plan'])
  })

  it('shows an amber delta only below the minimum', () => {
    const v = railHealthView(deck(37, 18, 6, 12, 3))
    const by = (k: string) => v.rows.find((r) => r.kind === k)!
    expect(by('card_advantage').delta).toBe(-4)
    expect(by('ramp').delta).toBeNull() // over the maximum stays neutral
    expect(by('lands').delta).toBeNull() // inside
    expect(by('game_plan').delta).toBeNull()
  })

  it('words the verdict from the short rows, or says Well covered', () => {
    expect(railHealthView(deck(37, 8, 11, 8, 4)).verdict).toEqual({ text: 'Light on ramp and removal', short: true })
    expect(railHealthView(deck(37, 11, 11, 11, 4)).verdict).toEqual({ text: 'Well covered', short: false })
  })

  it('names the shortest row first and joins three or more with commas and "and"', () => {
    const v = railHealthView(deck(37, 11, 11, 5, 0))
    expect(v.verdict.text).toBe('Light on removal and board wipes')
    expect(railHealthView(deck(37, 5, 5, 5, 0)).verdict.text).toMatch(/^Light on .+, .+, .+ and .+$/)
  })

  it('never uses Ok, Light or Heavy as a row word, and the game plan row has no range or delta', () => {
    const v = railHealthView(deck(37, 18, 6, 6, 0))
    for (const r of v.rows) {
      expect(r.ariaLabel).not.toMatch(/\b(ok|light|heavy)\b/i)
      expect(r.label).not.toMatch(/\b(ok|light|heavy)\b/i)
    }
    const gp = v.rows.find((r) => r.kind === 'game_plan')!
    expect(gp).toMatchObject({ rangeText: null, min: null, max: null, delta: null, proposed: false })
  })

  it('shows the small-sample note at 999 decks and not at 1,000', () => {
    const h = deck(37, 11, 11, 11, 4)
    expect(railHealthView(withSample(h, true, 999)).reference).toEqual({ text: 'EDHREC average for reference · 999 decks', sample: 999, smallSample: true })
    expect(railHealthView(withSample(h, true, 1000)).reference).toEqual({ text: 'EDHREC average for reference · 1,000 decks', sample: 1000, smallSample: false })
  })

  it('has no small-sample note when there is no average or no count', () => {
    const h = deck(37, 11, 11, 11, 4)
    expect(railHealthView(withSample(h, false, null)).reference.smallSample).toBe(false)
    expect(railHealthView(withSample(h, true, null))).toMatchObject({ reference: { text: 'EDHREC average for reference', smallSample: false } })
    expect(railHealthView(buildDeckHealth([], guideTargets('General guide'))).reference.smallSample).toBe(false)
  })
})
