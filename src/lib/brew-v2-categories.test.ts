import { describe, it, expect } from 'vitest'
import { toArchidektCategories, fromArchidektCategories } from './brew-v2-categories'
import type { DeckCard } from './brew-v2-types'

function makeDeckCard(
  primary: string,
  additional: string[] = []
): DeckCard {
  return {
    card_name: 'Test Card',
    primary_category: primary,
    additional_categories: additional,
    ownership_status: 'original',
    cmc: 3,
    type_line: 'Creature — Human',
    oracle_text: 'Test oracle text',
  }
}

describe('toArchidektCategories', () => {
  it('puts primary category first with no additional', () => {
    const card = makeDeckCard('Ramp')
    expect(toArchidektCategories(card)).toEqual(['Ramp'])
  })

  it('puts primary first followed by additional categories in order', () => {
    const card = makeDeckCard('Draw', ['Removal', 'Combo'])
    expect(toArchidektCategories(card)).toEqual(['Draw', 'Removal', 'Combo'])
  })

  it('preserves empty additional_categories as no extra entries', () => {
    const card = makeDeckCard('Finisher', [])
    expect(toArchidektCategories(card)).toEqual(['Finisher'])
  })
})

describe('fromArchidektCategories', () => {
  it('maps first element to primary, rest to additional', () => {
    const result = fromArchidektCategories(['Ramp', 'Draw', 'Combo'])
    expect(result).toEqual({ primary: 'Ramp', additional: ['Draw', 'Combo'] })
  })

  it('maps single element to primary with empty additional', () => {
    const result = fromArchidektCategories(['Removal'])
    expect(result).toEqual({ primary: 'Removal', additional: [] })
  })

  it('defaults to Uncategorized when array is empty', () => {
    const result = fromArchidektCategories([])
    expect(result).toEqual({ primary: 'Uncategorized', additional: [] })
  })
})
