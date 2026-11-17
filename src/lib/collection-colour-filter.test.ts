import { describe, it, expect } from 'vitest'
import { colourOrExpression, matchesColourFilter, parseColourFilter } from './collection-colour-filter'

const f = (colors: string[], mode: string) => parseColourFilter(colors, mode)!

describe('parseColourFilter', () => {
  it('returns null when nothing usable is chosen', () => {
    expect(parseColourFilter([], 'exact')).toBeNull()
    expect(parseColourFilter(['X'], 'exact')).toBeNull()
  })
  it('splits colourless (C) from the five colours', () => {
    expect(parseColourFilter(['c', 'g'], 'exact')).toEqual({ colours: ['G'], colourless: true, mode: 'exact' })
  })
})

describe('matchesColourFilter: colourless is an empty colour list', () => {
  it.each(['exact', 'includes'])('%s + colourless alone: colourless cards only', (mode) => {
    expect(matchesColourFilter([], f(['C'], mode))).toBe(true) // Sol Ring, Basalt Monolith
    expect(matchesColourFilter(['G'], f(['C'], mode))).toBe(false)
    expect(matchesColourFilter(['G', 'U'], f(['C'], mode))).toBe(false)
  })
  it('Exact + green: only mono-green, never colourless', () => {
    expect(matchesColourFilter(['G'], f(['G'], 'exact'))).toBe(true)
    expect(matchesColourFilter(['G', 'U'], f(['G'], 'exact'))).toBe(false)
    expect(matchesColourFilter([], f(['G'], 'exact'))).toBe(false)
  })
  it('Includes + green: any green card, never colourless', () => {
    expect(matchesColourFilter(['G', 'U'], f(['G'], 'includes'))).toBe(true)
    expect(matchesColourFilter([], f(['G'], 'includes'))).toBe(false)
  })
  it('colourless + green adds colourless cards to the green match', () => {
    expect(matchesColourFilter([], f(['G', 'C'], 'exact'))).toBe(true)
    expect(matchesColourFilter(['G'], f(['G', 'C'], 'exact'))).toBe(true)
    expect(matchesColourFilter(['G', 'U'], f(['G', 'C'], 'exact'))).toBe(false)
    expect(matchesColourFilter(['G', 'U'], f(['G', 'C'], 'includes'))).toBe(true)
    expect(matchesColourFilter(['U'], f(['G', 'C'], 'includes'))).toBe(false)
  })
  it('Exact + two colours needs both and nothing else', () => {
    expect(matchesColourFilter(['G', 'U'], f(['U', 'G'], 'exact'))).toBe(true)
    expect(matchesColourFilter(['G', 'U', 'R'], f(['U', 'G'], 'exact'))).toBe(false)
  })
  it('a missing colour list counts as colourless', () => {
    expect(matchesColourFilter(null, f(['C'], 'exact'))).toBe(true)
  })
})

describe('colourOrExpression', () => {
  it('colourless alone', () => {
    expect(colourOrExpression(f(['C'], 'exact'), [])).toBe('and(facts_available.eq.true,is_colourless.eq.true)')
  })
  it('exact green requires the other four colours to be absent; includes does not', () => {
    expect(colourOrExpression(f(['G'], 'exact'), [])).toBe(
      'and(facts_available.eq.true,has_w.eq.false,has_u.eq.false,has_b.eq.false,has_r.eq.false,has_g.eq.true)'
    )
    expect(colourOrExpression(f(['G'], 'includes'), [])).toBe('and(facts_available.eq.true,has_g.eq.true)')
  })
  it('adds copies the view cannot judge', () => {
    expect(colourOrExpression(f(['C'], 'exact'), [4, 9])).toBe(
      'and(facts_available.eq.true,is_colourless.eq.true),copy_id.in.(4,9)'
    )
  })
})
