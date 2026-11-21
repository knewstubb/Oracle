import { describe, expect, it } from 'vitest'
import { landTapState, parseDrawCount, parseManaProduced, simCardFromRail } from './card-facts'

const card = (card_name: string, type_line: string, oracle_text: string | null, mana_cost: string | null = null) => ({
  card_name, type_line, oracle_text, mana_cost,
})

describe('parseManaProduced', () => {
  it('reads Sol Ring as 2', () => expect(parseManaProduced('{T}: Add {C}{C}.')).toBe(2))
  it('reads Arcane Signet style "or" as 1', () => expect(parseManaProduced('{T}: Add one mana of any color in your commander\'s color identity.')).toBe(1))
  it('reads a choice of colours as 1', () => expect(parseManaProduced('{T}: Add {G} or {W}.')).toBe(1))
  it('reads "two mana" words', () => expect(parseManaProduced('{T}: Add two mana of any one color.')).toBe(2))
  it('skips variable mana', () => expect(parseManaProduced('{T}: Add {G} for each creature you control.')).toBe(0))
  it('returns 0 without a tap ability', () => expect(parseManaProduced('Flying')).toBe(0))
})

describe('parseDrawCount', () => {
  it('reads one, numbers and unreadable', () => {
    expect(parseDrawCount('Whenever you cast a spell, draw a card.')).toBe(1)
    expect(parseDrawCount('Draw three cards.')).toBe(3)
    expect(parseDrawCount('Draw cards equal to its power.')).toBe(1)
    expect(parseDrawCount('Flying')).toBe(0)
  })
})

describe('landTapState', () => {
  it('basic and Command Tower are untapped', () => {
    expect(landTapState('Basic Land - Forest', '({T}: Add {G}.)')).toBe('untapped')
    expect(landTapState('Land', '{T}: Add one mana of any color in your commander\'s color identity.')).toBe('untapped')
  })
  it('Temple is tapped', () => {
    expect(landTapState('Land', 'Temple of Malady enters tapped.\nWhen Temple of Malady enters, scry 1.\n{T}: Add {B} or {G}.')).toBe('tapped')
  })
  it('check land and shock land are conditional', () => {
    expect(landTapState('Land', 'Woodland Cemetery enters tapped unless you control a Swamp or a Forest.\n{T}: Add {B} or {G}.')).toBe('conditional')
    expect(landTapState('Land - Swamp Forest', 'As Overgrown Tomb enters, you may pay 2 life. If you don\'t, it enters tapped.')).toBe('conditional')
  })
  it('non-lands are untapped', () => expect(landTapState('Artifact', 'enters tapped')).toBe('untapped'))
})

describe('simCardFromRail', () => {
  it('Sol Ring is ramp making 2', () => {
    expect(simCardFromRail(card('Sol Ring', 'Artifact', '{T}: Add {C}{C}.', '{1}'))).toMatchObject({ kind: 'ramp', produced: 2, cost: 1 })
  })
  it('Arcane Signet is ramp making 1', () => {
    expect(simCardFromRail(card('Arcane Signet', 'Artifact', '{T}: Add one mana of any color in your commander\'s color identity.', '{2}'))).toMatchObject({ kind: 'ramp', produced: 1, cost: 2 })
  })
  it('Rampant Growth is permanent ramp making 1', () => {
    const c = card('Rampant Growth', 'Sorcery', 'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.', '{1}{G}')
    expect(simCardFromRail(c)).toMatchObject({ kind: 'ramp', produced: 1, cost: 2 })
  })
  it('Cultivate is ramp making 1', () => {
    const c = card('Cultivate', 'Sorcery', 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.', '{2}{G}')
    expect(simCardFromRail(c)).toMatchObject({ kind: 'ramp', produced: 1 })
  })
  it('Dark Ritual is a one-shot ritual', () => {
    expect(simCardFromRail(card('Dark Ritual', 'Instant', 'Add {B}{B}{B}.', '{B}'))).toMatchObject({ kind: 'oneShot', produced: 3, cost: 1, ritual: true })
  })
  it('a Treasure maker is a one-shot', () => {
    expect(simCardFromRail(card('Smothering Tithe', 'Enchantment', 'Create a Treasure token.', '{3}{W}'))).toMatchObject({ kind: 'oneShot', produced: 1 })
  })
  it('a draw spell is draw', () => {
    expect(simCardFromRail(card('Rhystic Study', 'Enchantment', 'Whenever an opponent casts a spell, you may draw a card.', '{2}{U}'))).toMatchObject({ kind: 'draw', draws: 1 })
  })
  it('lands carry tap state and at least 1 mana', () => {
    expect(simCardFromRail(card('Forest', 'Basic Land - Forest', null))).toMatchObject({ kind: 'land', produced: 1, tap: 'untapped' })
    expect(simCardFromRail(card('Guildgate', 'Land', 'Guildgate enters tapped.\n{T}: Add {W} or {U}.'))).toMatchObject({ kind: 'land', tap: 'tapped' })
  })
  it('a plain creature is other', () => {
    expect(simCardFromRail(card('Bear', 'Creature - Bear', null, '{1}{G}'))).toMatchObject({ kind: 'other' })
  })
})
