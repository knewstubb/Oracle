import { describe, it, expect } from 'vitest'
import { groupByType, sortCards } from './CardsTab'
import type { DeckCard } from './CardGrid'

// Real type lines as the library holds them (ref_cards.type_line), plus Scryfall-style ones.
const card = (id: number, card_name: string, type_line: string | null, categories = '["Artifact"]') =>
  ({ id, card_name, type_line, categories }) as unknown as DeckCard

const cards = [
  card(1, 'Darksteel Citadel', 'Artifact, Land —'),
  card(2, 'Seat of the Synod', 'Artifact, Land —'),
  card(3, 'Thousand Moons Smithy // Barracks of the Thousand', 'Artifact Land // Artifact Land'),
  card(4, 'Snow-Covered Artifact Land', 'Snow Artifact Land'),
  card(5, 'Sol Ring', 'Artifact —'),
  card(6, 'Steel Hellkite', 'Artifact Creature — Dragon'),
  card(7, 'Mirrorpool', 'Land —'),
  card(8, 'Mystery', null),
]

describe('deck page Group: Type and Sort: Type', () => {
  it('puts every artifact land under Land, whatever its saved category says', () => {
    const groups = Object.fromEntries(groupByType(cards).map(([name, list]) => [name, list.map((c) => c.card_name)]))
    expect(groups.Land).toEqual(['Darksteel Citadel', 'Seat of the Synod', 'Thousand Moons Smithy // Barracks of the Thousand', 'Snow-Covered Artifact Land', 'Mirrorpool'])
    expect(groups.Artifact).toEqual(['Sol Ring'])
    expect(groups.Creature).toEqual(['Steel Hellkite'])
    expect(groups.Other).toEqual(['Mystery'])
  })
  it('sorts artifact lands with the lands', () => {
    const sorted = sortCards(cards, 'type').map((c) => c.card_name)
    expect(sorted.indexOf('Darksteel Citadel')).toBeGreaterThan(sorted.indexOf('Sol Ring'))
    expect(sorted.indexOf('Seat of the Synod')).toBeGreaterThan(sorted.indexOf('Sol Ring'))
  })
})
