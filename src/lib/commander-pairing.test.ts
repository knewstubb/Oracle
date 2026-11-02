import { describe, it, expect } from 'vitest'
import { checkCommanderPair, secondSlotKindFor, type PairCardFacts } from '@/lib/commander-pairing'

const card = (name: string, type_line: string, oracle_text: string): PairCardFacts => ({ name, type_line, oracle_text })

const partnerA = card('Tymna', 'Legendary Creature — Human Cleric', 'Flying\nPartner (You can have two commanders if both have partner.)')
const partnerB = card('Thrasios', 'Legendary Creature — Merfolk Wizard', 'Partner (You can have two commanders if both have partner.)')
const plain = card('Atraxa', 'Legendary Creature — Phyrexian Angel', 'Flying, vigilance')
const chooser = card('Wilson', 'Legendary Creature — Human', 'Choose a Background (You can have a Background as a second commander.)')
const background = card('Raised by Giants', 'Legendary Enchantment — Background', 'Commander creatures you own have base power 10.')
const withA = card('Pir', 'Legendary Creature — Human', 'Partner with Toothy, Imaginary Friend (When this enters...)')
const withB = card('Toothy, Imaginary Friend', 'Legendary Creature — Illusion', 'Partner with Pir, Imaginary Navigator (When this enters...)')

describe('S-6 commander pair legality', () => {
  it('accepts two Partner cards', () => {
    expect(checkCommanderPair(partnerA, partnerB)).toEqual({ ok: true })
  })

  it('accepts Choose a Background with a Background, in either order', () => {
    expect(checkCommanderPair(chooser, background)).toEqual({ ok: true })
    expect(checkCommanderPair(background, chooser)).toEqual({ ok: true })
  })

  it('accepts a Partner-with pair that names each other (matching on the card name)', () => {
    expect(checkCommanderPair(withA, withB).ok).toBe(false) // names differ: "Pir" is not "Pir, Imaginary Navigator"
    const pir = { ...withA, name: 'Pir, Imaginary Navigator' }
    expect(checkCommanderPair(pir, withB)).toEqual({ ok: true })
  })

  it('refuses an ordinary commander with a partner, with a plain reason', () => {
    const verdict = checkCommanderPair(plain, partnerA)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/can't be commanders together/)
  })

  it('refuses a Background with a Partner card, and the same card twice', () => {
    expect(checkCommanderPair(partnerA, background).ok).toBe(false)
    expect(checkCommanderPair(partnerA, partnerA).ok).toBe(false)
  })

  it('does not treat "Partner with" as plain Partner', () => {
    expect(checkCommanderPair(withA, partnerA).ok).toBe(false)
  })
})

describe('secondSlotKindFor (which second-commander slot a commander allows)', () => {
  const c = (type_line: string, oracle_text: string) => ({ name: 'X', type_line, oracle_text })
  it('maps each pairing keyword to its slot', () => {
    expect(secondSlotKindFor(c('Legendary Creature — Human', 'Partner (You can have two commanders if both have partner.)'))).toBe('partner')
    expect(secondSlotKindFor(c('Legendary Creature — Human', 'Partner with Pir, Imaginative Rascal'))).toBe('partner_with')
    expect(secondSlotKindFor(c('Legendary Creature — Elf', 'Friends forever'))).toBe('friends_forever')
    expect(secondSlotKindFor(c('Legendary Creature — Elf', 'Choose a Background'))).toBe('background')
    expect(secondSlotKindFor(c('Legendary Creature — Human', "Doctor's companion"))).toBe('doctors_companion')
    expect(secondSlotKindFor(c('Legendary Creature — Time Lord Doctor', 'Flying'))).toBe('doctors_companion')
  })
  it('returns null for an ordinary commander', () => {
    expect(secondSlotKindFor(c('Legendary Creature — Angel', 'Flying, vigilance'))).toBeNull()
    expect(secondSlotKindFor(c('Legendary Creature — Cat', 'Companion — Each permanent card has MV 2 or less.'))).toBeNull()
  })
})
