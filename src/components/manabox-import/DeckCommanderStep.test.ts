import { describe, it, expect } from 'vitest'
import { commanderCandidates } from './DeckCommanderStep'

describe('commanderCandidates', () => {
  const cards = [
    { card_name: 'Sol Ring', scryfall_id: 's' },
    { card_name: 'Atraxa', scryfall_id: 'a' },
    { card_name: 'Atraxa', scryfall_id: 'a2' },
  ]
  it('lists unique names alphabetically', () => {
    expect(commanderCandidates(cards, '').map((c) => c.name)).toEqual(['Atraxa', 'Sol Ring'])
  })
  it('filters by search', () => {
    expect(commanderCandidates(cards, 'sol').map((c) => c.name)).toEqual(['Sol Ring'])
    expect(commanderCandidates(cards, 'zzz')).toEqual([])
  })
})
