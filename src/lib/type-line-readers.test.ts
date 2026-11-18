import { describe, it, expect } from 'vitest'
import { isLandTypeLine, rolesForCard } from './card-roles'
import { isBasicLandCard } from './basic-lands'
import { countDeckTypes, classifyDeckCard, type HealthDeckCard } from './deck-health'
import { deriveDefaultCategory } from './card-definition-resolver'
import { buildFilter } from './spare-copy-browse'
import { isEligibleCommander } from './commander-eligibility'
import { checkCommanderPair } from './commander-pairing'
import { cardWindowRoles } from './card-window-roles'

const card = (cardName: string, typeLine: string | null): HealthDeckCard =>
  ({ cardName, typeLine, oracleText: 'x', quantity: 1, inMainDeck: true }) as HealthDeckCard

describe('isLandTypeLine (front face, by card type)', () => {
  it.each([
    ['Basic Land — Forest', true],
    ['Basic, Snow Land — Swamp', true],
    ['Artifact, Land —', true],
    ['Land Creature — Forest Dryad', true],
    ['Instant // Land', false],
    ['Creature — Landshark', false],
    ['Kindred, Sorcery — Eldrazi', false],
  ])('%s -> %s', (line, expected) => expect(isLandTypeLine(line)).toBe(expected))
})

describe('isBasicLandCard', () => {
  it('reads the Basic supertype on the front face', () => {
    expect(isBasicLandCard({ name: 'x', typeLine: 'Basic Land — Forest' })).toBe(true)
    expect(isBasicLandCard({ name: 'x', typeLine: 'Basic, Snow Land — Swamp' })).toBe(true)
    expect(isBasicLandCard({ name: 'x', typeLine: 'Basic Land —' })).toBe(true)
    expect(isBasicLandCard({ name: 'x', typeLine: 'Land — Forest' })).toBe(false)
    expect(isBasicLandCard({ name: 'Forest', typeLine: 'Land' })).toBe(false)
  })
  it('falls back to the name list when there is no type line', () => {
    expect(isBasicLandCard({ name: 'Snow-Covered Swamp', typeLine: null })).toBe(true)
    expect(isBasicLandCard({ name: 'Sol Ring' })).toBe(false)
  })
})

describe('countDeckTypes', () => {
  it('counts a card under every card type of its front face', () => {
    const out = countDeckTypes([
      card('Golem', 'Artifact, Creature — Golem'),
      card('Swamp', 'Basic, Snow Land — Swamp'),
      card('Pact', 'Kindred, Sorcery — Eldrazi'),
      card('Spell', 'Instant // Land'),
    ])
    expect(out.creature).toBe(1)
    expect(out.artifact).toBe(1)
    expect(out.land).toBe(1)
    expect(out.sorcery).toBe(1)
    expect(out.instant).toBe(1)
  })
  it('classifies an Instant // Land as a spell, not a land', () => {
    expect(classifyDeckCard(card('Spell', 'Instant // Land')).kind).toBe('roles')
    expect(classifyDeckCard(card('Swamp', 'Basic, Snow Land — Swamp')).kind).toBe('land')
  })
})

describe('deriveDefaultCategory', () => {
  it.each([
    ['Legendary Creature — Elf Druid', 'Creature'],
    ['Artifact, Creature — Golem', 'Creature'],
    ['Kindred, Sorcery — Eldrazi', 'Sorcery'],
    ['Basic, Snow Land — Swamp', 'Land'],
    ['Instant // Land', 'Instant'],
    ['Land Creature — Forest Dryad', 'Land'],
    ['Artifact, Land —', 'Land'],
    ['Plane — Dominaria', 'Other'],
    ['', 'Other'],
  ])('%s -> %s', (line, expected) => expect(deriveDefaultCategory(line)).toBe(expected))
})

describe('buildFilter by card type', () => {
  it('matches the card type, not a subtype containing the word', () => {
    const m = buildFilter('creature').match
    expect(m('Artifact, Creature — Golem', '')).toBe(true)
    expect(m('Land — Creature', '')).toBe(false)
  })
  it('free text matches a subtype only as a whole word', () => {
    const m = buildFilter('elf').match
    expect(m('Legendary Creature — Elf Druid', '')).toBe(true)
    expect(m('Creature — Elfhame Sage', '')).toBe(false)
    expect(m('Creature — Human', '')).toBe(false)
  })
  it('finds Kindred and Basic', () => {
    expect(buildFilter('kindred').match('Kindred, Sorcery — Eldrazi', '')).toBe(true)
    expect(buildFilter('basic').match('Basic, Snow Land — Swamp', '')).toBe(true)
  })
})

describe('commander readers', () => {
  const facts = (type_line: string, extra = {}) => ({
    type_line, oracle_text: '', power: null, toughness: null, commander_legal: true, ...extra,
  })
  it('Legendary Creature, Vehicle and Background rules use supertype and subtype', () => {
    expect(isEligibleCommander(facts('Legendary Artifact, Creature — Golem'))).toBe(true)
    expect(isEligibleCommander(facts('Legendary Artifact — Vehicle', { power: '3', toughness: '3' }))).toBe(true)
    expect(isEligibleCommander(facts('Legendary Enchantment — Background'))).toBe(true)
    expect(isEligibleCommander(facts('Enchantment — Background'))).toBe(false)
  })
  it('Time Lord Doctor matches the library comma form and the Scryfall form', () => {
    const companion = { name: 'Companion', type_line: 'Legendary Creature — Human', oracle_text: "Doctor's companion" }
    for (const line of ['Legendary Creature — Time Lord, Doctor', 'Legendary Creature — Time Lord Doctor']) {
      expect(checkCommanderPair({ name: 'Doc', type_line: line, oracle_text: '' }, companion).ok).toBe(true)
    }
  })
})

describe('roles with the parser', () => {
  it('a Kindred Instant that adds mana is one-shot, not ramp', () => {
    expect(rolesForCard({ name: 'x', typeLine: 'Kindred Instant — Elf', oracleText: 'Add {G}{G}.' })).not.toContain('ramp')
  })
  it('card window treats a Basic, Snow Land as a land', () => {
    expect(cardWindowRoles({ name: 'Snow-Covered Swamp', typeLine: 'Basic, Snow Land — Swamp', oracleText: null }).kind).toBe('land')
  })
})
