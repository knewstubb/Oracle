import { describe, expect, it } from 'vitest'
import { mapScryfallToRefCard, normaliseTypeLineSubtypes, type ScryfallCard } from './ref-card-backfill'

const OID = '11111111-1111-1111-1111-111111111111'

const normal: ScryfallCard = {
  name: 'Llanowar Elves',
  oracle_id: OID,
  layout: 'normal',
  type_line: 'Creature — Elf Druid',
  mana_cost: '{G}',
  cmc: 1,
  oracle_text: '{T}: Add {G}.',
  power: '1',
  toughness: '1',
  color_identity: ['G'],
  keywords: [],
  legalities: { commander: 'legal' },
  edhrec_rank: 120,
}

const legendary: ScryfallCard = {
  name: 'Haliya, Guided by Light',
  oracle_id: OID,
  layout: 'normal',
  type_line: 'Legendary Creature — Elf Knight',
  mana_cost: '{2}{W}',
  cmc: 3,
  oracle_text: 'Flying',
  power: '3',
  toughness: '3',
  color_identity: ['W'],
  keywords: ['Flying'],
  legalities: { commander: 'legal' },
}

const transform: ScryfallCard = {
  name: 'Front Person // Back Beast',
  oracle_id: OID,
  layout: 'transform',
  type_line: 'Legendary Creature — Human Scientist Hero // Legendary Creature — Spider Human Hero',
  cmc: 3,
  color_identity: ['U', 'B', 'G'],
  legalities: { commander: 'legal' },
  card_faces: [
    { name: 'Front Person', type_line: 'Legendary Creature — Human Scientist Hero', mana_cost: '{1}{G}{U}', oracle_text: 'Front text.', power: '2', toughness: '3' },
    { name: 'Back Beast', type_line: 'Legendary Creature — Spider Human Hero', mana_cost: '', oracle_text: 'Back text.', power: '4', toughness: '4' },
  ],
}

const adventure: ScryfallCard = {
  name: 'Bonecrusher Giant // Stomp',
  oracle_id: OID,
  layout: 'adventure',
  type_line: 'Creature — Giant // Instant — Adventure',
  cmc: 3,
  color_identity: ['R'],
  legalities: { commander: 'legal' },
  card_faces: [
    { name: 'Bonecrusher Giant', type_line: 'Creature — Giant', mana_cost: '{2}{R}', oracle_text: 'Whenever this becomes the target of a spell, it deals 2 damage.', power: '4', toughness: '3' },
    { name: 'Stomp', type_line: 'Instant — Adventure', mana_cost: '{1}{R}', oracle_text: 'Damage cannot be prevented this turn.' },
  ],
}

const split: ScryfallCard = {
  name: 'Fire // Ice',
  oracle_id: OID,
  layout: 'split',
  type_line: 'Instant // Instant',
  mana_cost: '{1}{R} // {1}{U}',
  cmc: 4,
  color_identity: ['U', 'R'],
  legalities: { commander: 'legal' },
  card_faces: [
    { name: 'Fire', type_line: 'Instant', mana_cost: '{1}{R}', oracle_text: 'Fire deals 2 damage divided as you choose.' },
    { name: 'Ice', type_line: 'Instant', mana_cost: '{1}{U}', oracle_text: 'Tap target permanent.' },
  ],
}

const modal: ScryfallCard = {
  name: 'Valki, God of Lies // Tibalt, Cosmic Impostor',
  oracle_id: OID,
  layout: 'modal_dfc',
  type_line: 'Legendary Creature — God // Legendary Planeswalker — Tibalt',
  cmc: 2,
  color_identity: ['B', 'R'],
  legalities: { commander: 'legal' },
  card_faces: [
    { name: 'Valki, God of Lies', type_line: 'Legendary Creature — God', mana_cost: '{1}{B}', oracle_text: 'Valki text.', power: '2', toughness: '1' },
    { name: 'Tibalt, Cosmic Impostor', type_line: 'Legendary Planeswalker — Tibalt', mana_cost: '{5}{B}{R}', oracle_text: 'Tibalt text.' },
  ],
}

const prepare: ScryfallCard = {
  name: 'Mystery Front // Mystery Back',
  oracle_id: OID,
  layout: 'prepare',
  type_line: 'Creature — Wizard // Sorcery',
  cmc: 2,
  color_identity: ['U'],
  legalities: { commander: 'not_legal' },
  card_faces: [
    { name: 'Mystery Front', type_line: 'Creature — Wizard', mana_cost: '{1}{U}', oracle_text: 'Front.', power: '1', toughness: '2' },
    { name: 'Mystery Back', type_line: 'Sorcery', mana_cost: '{U}', oracle_text: 'Back.' },
  ],
}

const artifact: ScryfallCard = {
  name: 'Sol Ring',
  oracle_id: OID,
  type_line: 'Artifact',
  mana_cost: '{1}',
  cmc: 1,
  oracle_text: '{T}: Add {C}{C}.',
  color_identity: [],
  legalities: { commander: 'legal' },
}

describe('mapScryfallToRefCard', () => {
  it('maps a normal creature to library style', () => {
    const r = mapScryfallToRefCard(normal, OID)
    expect(r).toMatchObject({
      name: 'Llanowar Elves',
      type_line: 'Creature — Elf, Druid',
      color_identity: 'G',
      mana_cost: '{G}',
      mana_value: 1,
      oracle_text: '{T}: Add {G}.',
      power: '1',
      toughness: '1',
      edhrec_rank: 120,
      commander_legal: true,
      is_legendary: false,
      is_creature: true,
      can_be_commander: false,
      keywords: null,
      default_category: null,
    })
  })

  it('marks a legendary creature as commander and keeps keywords', () => {
    const r = mapScryfallToRefCard(legendary)
    expect(r.is_legendary).toBe(true)
    expect(r.can_be_commander).toBe(true)
    expect(r.keywords).toEqual(['Flying'])
  })

  it('transform: comma subtypes per face, faces joined, text joined with a separator line', () => {
    const r = mapScryfallToRefCard(transform, OID)
    expect(r.type_line).toBe('Legendary Creature — Human, Scientist, Hero // Legendary Creature — Spider, Human, Hero')
    expect(r.color_identity).toBe('B, G, U')
    expect(r.mana_cost).toBe('{1}{G}{U}')
    expect(r.oracle_text).toBe('Front text.\n//\nBack text.')
    expect(r.power).toBe('2')
    expect(r.toughness).toBe('3')
    expect(r.can_be_commander).toBe(true)
  })

  it('adventure: joins face costs and texts, creature front face', () => {
    const r = mapScryfallToRefCard(adventure)
    expect(r.type_line).toBe('Creature — Giant // Instant — Adventure')
    expect(r.mana_cost).toBe('{2}{R} // {1}{R}')
    expect(r.oracle_text).toBe(
      'Whenever this becomes the target of a spell, it deals 2 damage.\n//\nDamage cannot be prevented this turn.',
    )
    expect(r.is_creature).toBe(true)
    expect(r.can_be_commander).toBe(false)
  })

  it('split: uses the top-level cost and sorts colours alphabetically', () => {
    const r = mapScryfallToRefCard(split)
    expect(r.mana_cost).toBe('{1}{R} // {1}{U}')
    expect(r.color_identity).toBe('R, U')
    expect(r.mana_value).toBe(4)
    expect(r.is_creature).toBe(false)
  })

  it('modal_dfc: legendary on the back face counts; commander follows the front face', () => {
    const r = mapScryfallToRefCard(modal)
    expect(r.is_legendary).toBe(true)
    expect(r.can_be_commander).toBe(true)
    expect(r.color_identity).toBe('B, R')
  })

  it('unknown layout "prepare" works generically from card_faces', () => {
    const r = mapScryfallToRefCard(prepare)
    expect(r.type_line).toBe('Creature — Wizard // Sorcery')
    expect(r.oracle_text).toBe('Front.\n//\nBack.')
    expect(r.commander_legal).toBe(false)
    expect(r.is_creature).toBe(true)
  })

  it('colourless artifact: empty colour identity, no creature', () => {
    const r = mapScryfallToRefCard(artifact)
    expect(r.color_identity).toBe('')
    expect(r.is_creature).toBe(false)
    expect(r.is_legendary).toBe(false)
    expect(r.type_line).toBe('Artifact')
  })

  it('keeps Time Lord as one subtype', () => {
    const r = mapScryfallToRefCard({ ...legendary, type_line: 'Legendary Creature — Time Lord Doctor' })
    expect(r.type_line).toBe('Legendary Creature — Time Lord, Doctor')
  })

  it('copes with missing optional fields', () => {
    const r = mapScryfallToRefCard({ name: 'Bare', oracle_id: OID, type_line: 'Instant' })
    expect(r).toMatchObject({
      mana_cost: null,
      mana_value: 0,
      oracle_text: null,
      power: null,
      toughness: null,
      edhrec_rank: null,
      commander_legal: false,
      keywords: null,
      color_identity: '',
    })
  })

  it('legendary Vehicle with power and toughness can be a commander; without them it cannot', () => {
    const vehicle: ScryfallCard = { name: 'Ride', oracle_id: OID, type_line: 'Legendary Artifact — Vehicle', power: '4', toughness: '4' }
    expect(mapScryfallToRefCard(vehicle).can_be_commander).toBe(true)
    expect(mapScryfallToRefCard({ ...vehicle, power: undefined, toughness: undefined }).can_be_commander).toBe(false)
  })

  it('"can be your commander" text counts', () => {
    const pw: ScryfallCard = { name: 'Walker', oracle_id: OID, type_line: 'Legendary Planeswalker — X', oracle_text: 'Walker can be your commander.' }
    expect(mapScryfallToRefCard(pw).can_be_commander).toBe(true)
  })

  it('refuses a card whose oracle_id differs from the requested one', () => {
    expect(() => mapScryfallToRefCard(normal, '22222222-2222-2222-2222-222222222222')).toThrow(/oracle_id mismatch/)
  })
})

describe('normaliseTypeLineSubtypes', () => {
  it('converts space separated subtypes and is idempotent', () => {
    const once = normaliseTypeLineSubtypes('Legendary Creature — Human Scientist Hero // Legendary Creature — Spider Human Hero')
    expect(once).toBe('Legendary Creature — Human, Scientist, Hero // Legendary Creature — Spider, Human, Hero')
    expect(normaliseTypeLineSubtypes(once)).toBe(once)
  })
  it('leaves lines without subtypes alone', () => {
    expect(normaliseTypeLineSubtypes('Instant // Instant')).toBe('Instant // Instant')
  })
})
