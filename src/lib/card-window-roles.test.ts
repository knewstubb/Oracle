import { describe, it, expect } from 'vitest'
import { cardWindowRoles, cardWindowTypes } from './card-window-roles'

describe('cardWindowRoles', () => {
  it('gives ramp for Sol Ring text, in the fixed order', () => {
    const r = cardWindowRoles({ name: 'Sol Ring', typeLine: 'Artifact', oracleText: '{T}: Add {C}{C}.' })
    expect(r).toEqual({ kind: 'roles', roles: ['ramp'] })
  })
  it('says "checked, no role" for a plain creature', () => {
    const r = cardWindowRoles({ name: 'Grizzly Bears', typeLine: 'Creature — Bear', oracleText: 'Trample' })
    expect(r).toEqual({ kind: 'roles', roles: [] })
  })
  it('lands have no roles', () => {
    expect(cardWindowRoles({ name: 'Command Tower', typeLine: 'Land', oracleText: '{T}: Add one mana of any color.' })).toEqual({ kind: 'land' })
    expect(cardWindowRoles({ name: 'Forest', typeLine: null, oracleText: null })).toEqual({ kind: 'land' })
  })
  it('no card text means no data, never an empty answer', () => {
    expect(cardWindowRoles({ name: 'Mystery', typeLine: null, oracleText: null })).toEqual({ kind: 'no_data' })
  })
})
describe('cardWindowTypes', () => {
  it('splits supertypes, all card types and subtypes', () => {
    expect(cardWindowTypes('Legendary Artifact, Creature — Golem, Soldier')).toEqual({ supertypes: ['Legendary'], cardTypes: ['Artifact', 'Creature'], subtypes: ['Golem', 'Soldier'] })
    expect(cardWindowTypes('Basic, Snow Land — Swamp')).toEqual({ supertypes: ['Basic', 'Snow'], cardTypes: ['Land'], subtypes: ['Swamp'] })
  })
  it('joins both faces without repeats, and gives empty groups for a missing line', () => {
    expect(cardWindowTypes('Creature — Human // Legendary Creature — Werewolf')).toEqual({ supertypes: ['Legendary'], cardTypes: ['Creature'], subtypes: ['Human', 'Werewolf'] })
    expect(cardWindowTypes(null)).toEqual({ supertypes: [], cardTypes: [], subtypes: [] })
  })
})
