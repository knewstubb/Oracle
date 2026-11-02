import { describe, it, expect } from 'vitest'
import { isEligibleCommander, eligibleNames, type CommanderCardFacts } from './commander-eligibility'

const base: CommanderCardFacts = { type_line: null, oracle_text: null, power: null, toughness: null, commander_legal: true }

describe('isEligibleCommander', () => {
  it('accepts legendary creatures', () => {
    expect(isEligibleCommander({ ...base, type_line: 'Legendary Creature — Elf Druid' })).toBe(true)
  })
  it('rejects non-legendary creatures and other legendaries', () => {
    expect(isEligibleCommander({ ...base, type_line: 'Creature — Elf' })).toBe(false)
    expect(isEligibleCommander({ ...base, type_line: 'Legendary Artifact' })).toBe(false)
  })
  it('accepts legendary Vehicles/Spacecraft only with power and toughness', () => {
    const v = { ...base, type_line: 'Legendary Artifact — Vehicle' }
    expect(isEligibleCommander({ ...v, power: '4', toughness: '4' })).toBe(true)
    expect(isEligibleCommander(v)).toBe(false)
    expect(isEligibleCommander({ ...base, type_line: 'Legendary Artifact — Spacecraft', power: '3', toughness: '5' })).toBe(true)
  })
  it('accepts "can be your commander" text and Backgrounds', () => {
    expect(isEligibleCommander({ ...base, type_line: 'Legendary Planeswalker — X', oracle_text: 'X can be your commander.' })).toBe(true)
    expect(isEligibleCommander({ ...base, type_line: 'Legendary Enchantment — Background' })).toBe(true)
  })
  it('rejects cards that are not commander-legal', () => {
    expect(isEligibleCommander({ ...base, type_line: 'Legendary Creature — Elf', commander_legal: false })).toBe(false)
  })
  it('judges a double-faced card by its front face', () => {
    expect(isEligibleCommander({ ...base, type_line: 'Creature — Human // Legendary Creature — Wolf' })).toBe(false)
  })
})

describe('eligibleNames', () => {
  it('keeps matching names, case-insensitively, ignoring unknown cards', () => {
    const facts = new Map([['atraxa', { ...base, type_line: 'Legendary Creature — Phyrexian' }], ['sol ring', { ...base, type_line: 'Artifact' }]])
    expect(eligibleNames(['Atraxa', 'Sol Ring', 'Unknown'], facts)).toEqual(['Atraxa'])
  })
})
