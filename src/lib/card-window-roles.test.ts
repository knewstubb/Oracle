import { describe, it, expect } from 'vitest'
import { cardWindowRoles } from './card-window-roles'

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
