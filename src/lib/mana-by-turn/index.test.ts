import { describe, expect, it } from 'vitest'
import { manaByTurn } from './index'

describe('manaByTurn', () => {
  const deck = [
    { card_name: 'Forest', quantity: 20, type_line: 'Basic Land - Forest', oracle_text: null },
    { card_name: 'Gate', quantity: 16, type_line: 'Land', oracle_text: 'Gate enters tapped.\n{T}: Add {G}.' },
    { card_name: 'Bear', quantity: 63, type_line: 'Creature - Bear', mana_cost: '{1}{G}', oracle_text: null },
  ]
  it('returns seven turns for both lines, untapped never below actual, and repeats exactly', () => {
    const a = manaByTurn(deck, [], { games: 500 })
    expect(a.actual.avg).toHaveLength(7)
    a.actual.avg.forEach((v, i) => expect(a.untapped.avg[i]).toBeGreaterThanOrEqual(v))
    expect(manaByTurn(deck, [], { games: 500 })).toEqual(a)
  })
})
