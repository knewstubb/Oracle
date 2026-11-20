import { describe, expect, it } from 'vitest'
import { allCardTypes, hasCardType, parseTypeLine, primaryType } from './type-line'
import { countDeckTypes } from './deck-health'
import { classifyCard } from './rating-engine'

// Owner rule 2026-11-18: double-faced cards use the FRONT face type line; Land still comes first.
const CASES: Array<[string, string]> = [
  ['Legendary Artifact // Legendary Artifact Land', 'Artifact'],
  ['Creature — Goblin // Land', 'Creature'],
  ['Instant // Land', 'Instant'],
  ['Legendary Enchantment // Legendary Land', 'Enchantment'],
  ['Creature — Elf Druid // Land', 'Creature'],
  ['Land // Land', 'Land'],
  ['Sorcery // Land', 'Sorcery'],
  ['Artifact Land', 'Land'],
  ['Legendary Artifact Land', 'Land'],
]

describe('double-faced cards group by the front face', () => {
  it.each(CASES)('primaryType of %s is %s', (line, expected) => {
    expect(primaryType(parseTypeLine(line))).toBe(expected)
  })

  it('card-type checks on the front scope ignore the back face', () => {
    const p = parseTypeLine('Instant // Land')
    expect(hasCardType(p, 'Land', 'front')).toBe(false)
    expect(hasCardType(p, 'Instant', 'front')).toBe(true)
  })

  it('deck health counts the front face only, Land first', () => {
    const mk = (typeLine: string) => ({ typeLine, quantity: 1, inMainDeck: true, cardName: typeLine }) as never
    const counts = countDeckTypes([
      mk('Legendary Artifact // Legendary Artifact Land'),
      mk('Instant // Land'),
      mk('Land // Land'),
      mk('Artifact Land'),
    ])
    expect(counts).toMatchObject({ artifact: 1, instant: 1, land: 2 })
  })

  it('rating engine does not read a back-face Instant as a counterspell', () => {
    const card = { oracleText: 'Counter target spell.', categories: '[]' }
    expect(classifyCard({ ...card, typeLine: 'Sorcery // Instant' } as never)).not.toContain('counterspell')
    expect(classifyCard({ ...card, typeLine: 'Instant // Land' } as never)).toContain('counterspell')
  })

  it('the card-type list still includes the types of both faces', () => {
    expect(allCardTypes(parseTypeLine('Legendary Artifact // Legendary Artifact Land'))).toEqual(['Artifact', 'Land'])
  })
})
