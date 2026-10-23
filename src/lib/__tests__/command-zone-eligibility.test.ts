import { describe, it, expect } from 'vitest'
import {
  isEligibleCompanion,
  eligibleCompanionNames,
  type CommanderCardFacts,
} from '@/lib/commander-eligibility'
import { secondRoleFor, verifySecondCommander, type PairCardFacts } from '@/lib/commander-pairing'
import { checkSecondCommanderPair } from '@/lib/command-zone-pair-check'
import { parseCommandZoneRequest } from '@/lib/command-zone-request'

const facts = (o: Partial<CommanderCardFacts>): CommanderCardFacts => ({
  type_line: 'Creature — Cat', oracle_text: '', power: '1', toughness: '1', commander_legal: true, ...o,
})

describe('companion eligibility', () => {
  it('needs the Companion keyword', () => {
    expect(isEligibleCompanion(facts({ oracle_text: 'Companion — Each nonland card in your starting deck has a different name.\nFlying' }))).toBe(true)
    expect(isEligibleCompanion(facts({ oracle_text: 'Flying' }))).toBe(false)
  })
  it("does not mistake Doctor's companion for Companion", () => {
    expect(isEligibleCompanion(facts({ oracle_text: "Doctor's companion (You can have two commanders if the other is a Doctor.)" }))).toBe(false)
  })
  it('must be Commander-legal as a card', () => {
    expect(isEligibleCompanion(facts({ commander_legal: false, oracle_text: 'Companion — x' }))).toBe(false)
  })
  it('uses the front face only', () => {
    expect(isEligibleCompanion(facts({ oracle_text: 'Flying // Companion — back face' }))).toBe(false)
  })
  it('filters a name list', () => {
    const m = new Map<string, CommanderCardFacts>([
      ['lurrus', facts({ oracle_text: 'Companion — Each permanent card in your starting deck has MV 2 or less.' })],
      ['sol ring', facts({ oracle_text: 'Tap: add two' })],
    ])
    expect(eligibleCompanionNames(['Lurrus', 'Sol Ring', 'Nope'], m)).toEqual(['Lurrus'])
  })
})

describe('second commander role + pair', () => {
  const partnerA: PairCardFacts = { name: 'A', type_line: 'Legendary Creature — Human', oracle_text: 'Partner (You can have two commanders if both have partner.)' }
  const partnerB: PairCardFacts = { name: 'B', type_line: 'Legendary Creature — Elf', oracle_text: 'Partner' }
  const chooser: PairCardFacts = { name: 'C', type_line: 'Legendary Creature — Human', oracle_text: 'Choose a Background' }
  const bg: PairCardFacts = { name: 'BG', type_line: 'Legendary Enchantment — Background', oracle_text: 'Commander creatures you own have haste.' }

  it('background vs partner role', () => {
    expect(secondRoleFor(bg)).toBe('background')
    expect(secondRoleFor(partnerB)).toBe('partner')
  })
  it('accepts a legal pair with the right role', () => {
    expect(verifySecondCommander(partnerA, partnerB, 'partner')).toEqual({ ok: true })
    expect(verifySecondCommander(chooser, bg, 'background')).toEqual({ ok: true })
  })
  it('refuses an illegal pair with a plain reason', () => {
    const v = verifySecondCommander(partnerA, chooser, 'partner')
    expect(v.ok).toBe(false)
  })
  it('refuses a mismatched role', () => {
    const v = verifySecondCommander(chooser, bg, 'partner')
    expect(v).toMatchObject({ ok: false })
  })
})

describe('route pair check (mocked client)', () => {
  function client(deckRows: Array<{ id: number; card_name: string }>, refRows: PairCardFacts[]) {
    return {
      from: (t: string) => ({
        select: () => {
          const chain = {
            eq: () => chain,
            in: async () => ({ data: t === 'deck_cards' ? deckRows : refRows, error: null }),
          }
          return chain
        },
      }),
    }
  }
  const req = (parseCommandZoneRequest({ primaryCardId: 1, secondCardId: 2, secondRole: 'partner' }) as { ok: true; value: Parameters<typeof checkSecondCommanderPair>[3] }).value
  const A: PairCardFacts = { name: 'A', type_line: 'Legendary Creature', oracle_text: 'Partner' }
  const B: PairCardFacts = { name: 'B', type_line: 'Legendary Creature', oracle_text: 'Partner' }
  const X: PairCardFacts = { name: 'X', type_line: 'Legendary Creature', oracle_text: 'Flying' }

  it('passes a legal pair', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client([{ id: 1, card_name: 'A' }, { id: 2, card_name: 'B' }], [A, B]) as any
    expect(await checkSecondCommanderPair(c, 1, 'u', req)).toEqual({ ok: true, secondRole: 'partner' })
  })
  it('works out the role when the request has none', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client([{ id: 1, card_name: 'A' }, { id: 2, card_name: 'B' }], [A, B]) as any
    expect(await checkSecondCommanderPair(c, 1, 'u', { ...req, secondRole: null })).toEqual({ ok: true, secondRole: 'partner' })
  })
  it('422 for an illegal pair', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client([{ id: 1, card_name: 'A' }, { id: 2, card_name: 'X' }], [A, X]) as any
    expect(await checkSecondCommanderPair(c, 1, 'u', req)).toMatchObject({ ok: false, status: 422 })
  })
  it('404 when a card is not in the deck', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client([{ id: 1, card_name: 'A' }], [A]) as any
    expect(await checkSecondCommanderPair(c, 1, 'u', req)).toMatchObject({ ok: false, status: 404 })
  })
  it('no second commander = nothing to check', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client([], []) as any
    const r = (parseCommandZoneRequest({ primaryCardId: 1 }) as { ok: true; value: Parameters<typeof checkSecondCommanderPair>[3] }).value
    expect(await checkSecondCommanderPair(c, 1, 'u', r)).toEqual({ ok: true, secondRole: null })
  })
})
