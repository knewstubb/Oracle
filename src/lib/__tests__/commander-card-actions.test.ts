import { describe, it, expect } from 'vitest'
import {
  actionLabel,
  companionKeepsCount,
  companionSlotVisible,
  offeredActions,
  planCommandZoneBody,
  type ActionCard,
  type CommanderEligibility,
} from '@/lib/commander-card-actions'
import { eligibleLeadNames, isEligibleLeadCommander, type CommanderCardFacts } from '@/lib/commander-eligibility'

const c = (over: Partial<ActionCard> & { id: number; card_name: string }): ActionCard => ({
  quantity: 1,
  categories: '["Creature"]',
  is_commander: false,
  command_zone_role: null,
  ...over,
})

const none = new Set<string>()
const elig = (over: Partial<CommanderEligibility> = {}): CommanderEligibility => ({
  lead: none,
  second: none,
  companion: none,
  secondKind: null,
  ...over,
})
const labels = (card: ActionCard, cards: ActionCard[], name: string | null, e: CommanderEligibility, target = 100) =>
  offeredActions(card, cards, name, e, target).map(actionLabel)

describe('offeredActions', () => {
  const tymna = c({ id: 1, card_name: 'Tymna', is_commander: true })
  const thrasios = c({ id: 2, card_name: 'Thrasios', command_zone_role: 'partner', is_commander: true })
  const sol = c({ id: 3, card_name: 'Sol Ring', categories: '["Artifact"]' })
  const kraum = c({ id: 4, card_name: 'Kraum' })
  const lurrus = c({ id: 5, card_name: 'Lurrus' })

  it('commander cards get only "Remove as commander"', () => {
    const cards = [tymna, thrasios, sol]
    const e = elig({ second: new Set(['Sol Ring']), companion: new Set(['Tymna']) })
    expect(labels(tymna, cards, 'Tymna', e)).toEqual(['Remove as commander'])
    expect(labels(thrasios, cards, 'Tymna', e)).toEqual(['Remove as commander'])
  })

  it('with no commander, only a legal commander gets "Add as commander"', () => {
    const cards = [sol, kraum]
    const e = elig({ lead: new Set(['Kraum']) })
    expect(labels(kraum, cards, null, e)).toEqual(['Add as commander'])
    expect(labels(sol, cards, null, e)).toEqual([])
  })

  it('with one commander, only a valid pairing gets "Add as partner"', () => {
    const cards = [tymna, kraum, sol]
    const e = elig({ second: new Set(['Kraum']), secondKind: 'partner' })
    expect(labels(kraum, cards, 'Tymna', e)).toEqual(['Add as partner'])
    expect(labels(sol, cards, 'Tymna', e)).toEqual([])
  })

  it('a "Choose a Background" commander offers "Add as background", never partner', () => {
    const bg = c({ id: 6, card_name: 'Raised by Giants', categories: '["Enchantment"]' })
    const cards = [tymna, bg, kraum]
    const e = elig({ second: new Set(['Raised by Giants']), secondKind: 'background' })
    expect(labels(bg, cards, 'Tymna', e)).toEqual(['Add as background'])
    expect(labels(kraum, cards, 'Tymna', e)).toEqual([])
  })

  it('offers no add action once there are two commanders, and none from the maybeboard', () => {
    const cards = [tymna, thrasios, kraum]
    expect(labels(kraum, cards, 'Tymna', elig({ second: new Set(['Kraum']), lead: new Set(['Kraum']) }))).toEqual([])
    const maybe = c({ id: 9, card_name: 'Kraum', categories: '["Maybeboard"]' })
    expect(labels(maybe, [tymna, maybe], 'Tymna', elig({ second: new Set(['Kraum']), secondKind: 'partner' }))).toEqual([])
    const side = c({ id: 10, card_name: 'Kraum', categories: '["Sideboard"]' })
    expect(labels(side, [side], null, elig({ lead: new Set(['Kraum']) }))).toEqual([])
  })

  it('offers nothing while the checks have not answered', () => {
    expect(offeredActions(kraum, [kraum], null, null, 100)).toEqual([])
    expect(labels(kraum, [kraum], null, elig())).toEqual([])
  })

  it('"Add as companion" only on cards with the Companion ability, only while none is set', () => {
    const cards = [tymna, lurrus, sol]
    const e = elig({ companion: new Set(['Lurrus']) })
    expect(labels(lurrus, cards, 'Tymna', e)).toEqual(['Add as companion'])
    expect(labels(sol, cards, 'Tymna', e)).toEqual([])
    const yorion = c({ id: 7, card_name: 'Yorion', categories: '["Sideboard"]', command_zone_role: 'companion' })
    expect(labels(lurrus, [...cards, yorion], 'Tymna', e)).toEqual([])
    expect(labels(yorion, [...cards, yorion], 'Tymna', e)).toEqual([])
  })

  it('"Add as companion" is not offered when the move would break a full 100', () => {
    const full = Array.from({ length: 98 }, (_, i) => c({ id: 100 + i, card_name: `Filler ${i}` }))
    const cards = [tymna, lurrus, ...full]
    const e = elig({ companion: new Set(['Lurrus']) })
    expect(cards).toHaveLength(100)
    expect(labels(lurrus, cards, 'Tymna', e)).toEqual([])
    // 101 cards: moving one out leaves 100, fine. Under 100: a deck still being built is not newly broken.
    expect(labels(lurrus, [...cards, c({ id: 300, card_name: 'Extra' })], 'Tymna', e)).toEqual(['Add as companion'])
    expect(labels(lurrus, cards.slice(0, 50), 'Tymna', e)).toEqual(['Add as companion'])
  })

  it('a card can be offered both a commander role and companion when both are valid', () => {
    const e = elig({ lead: new Set(['Lurrus']), companion: new Set(['Lurrus']) })
    expect(labels(lurrus, [lurrus, sol], null, e, 100)).toEqual(['Add as commander', 'Add as companion'])
  })
})

describe('companionKeepsCount / companionSlotVisible', () => {
  it('counts quantities on the main list only', () => {
    const a = c({ id: 1, card_name: 'A', quantity: 2 })
    const b = c({ id: 2, card_name: 'B' })
    const m = c({ id: 3, card_name: 'M', categories: '["Maybeboard"]' })
    expect(companionKeepsCount(b, [a, b, m], 3)).toBe(false)
    expect(companionKeepsCount(b, [a, b, m], 2)).toBe(true)
    expect(companionKeepsCount(b, [a, b], null)).toBe(true)
  })

  it('slot shows only with a companion set or a card with the ability', () => {
    const lurrus = c({ id: 1, card_name: 'Lurrus' })
    const sol = c({ id: 2, card_name: 'Sol Ring' })
    const yorion = c({ id: 3, card_name: 'Yorion', categories: '["Sideboard"]', command_zone_role: 'companion' })
    expect(companionSlotVisible([sol], new Set(['Lurrus']))).toBe(false)
    expect(companionSlotVisible([sol, lurrus], new Set(['Lurrus']))).toBe(true)
    expect(companionSlotVisible([sol, lurrus], null)).toBe(false)
    expect(companionSlotVisible([sol, yorion], new Set())).toBe(true)
  })
})

describe('planCommandZoneBody (what the existing command-zone route is sent)', () => {
  const tymna = c({ id: 1, card_name: 'Tymna', is_commander: true })
  const thrasios = c({ id: 2, card_name: 'Thrasios', command_zone_role: 'partner', is_commander: true })
  const kraum = c({ id: 4, card_name: 'Kraum' })
  const yorion = c({ id: 7, card_name: 'Yorion', categories: '["Sideboard"]', command_zone_role: 'companion' })

  it('adds the first commander, keeping the companion', () => {
    expect(planCommandZoneBody([kraum, yorion], null, { kind: 'add-commander', as: 'commander' }, 4)).toEqual({
      primaryCardId: 4, secondCardId: null, companionCardId: 7,
    })
  })

  it('adds a partner next to the commander', () => {
    expect(planCommandZoneBody([tymna, kraum], 'Tymna', { kind: 'add-commander', as: 'partner' }, 4)).toEqual({
      primaryCardId: 1, secondCardId: 4, companionCardId: null,
    })
  })

  it('removing either commander of a pair leaves the other as the commander', () => {
    expect(planCommandZoneBody([tymna, thrasios], 'Tymna', { kind: 'remove-commander' }, 1)).toEqual({
      primaryCardId: 2, secondCardId: null, companionCardId: null,
    })
    expect(planCommandZoneBody([tymna, thrasios], 'Tymna', { kind: 'remove-commander' }, 2)).toEqual({
      primaryCardId: 1, secondCardId: null, companionCardId: null,
    })
  })

  it('removing the only commander clears the command zone but keeps the companion', () => {
    expect(planCommandZoneBody([tymna, yorion], 'Tymna', { kind: 'remove-commander' }, 1)).toEqual({
      primaryCardId: null, secondCardId: null, companionCardId: 7,
    })
  })

  it('removing the commander of a Background pair does not leave the Background leading on its own', () => {
    const bg = c({ id: 6, card_name: 'Raised by Giants', command_zone_role: 'background', is_commander: true })
    expect(planCommandZoneBody([tymna, bg], 'Tymna', { kind: 'remove-commander' }, 1)).toEqual({
      primaryCardId: null, secondCardId: null, companionCardId: null,
    })
    expect(planCommandZoneBody([bg, tymna], 'Tymna', { kind: 'remove-commander' }, 6)).toEqual({
      primaryCardId: 1, secondCardId: null, companionCardId: null,
    })
  })

  it('setting a companion keeps both commanders (Background in the second slot)', () => {
    const bg = c({ id: 6, card_name: 'Raised by Giants', command_zone_role: 'background', is_commander: true })
    expect(planCommandZoneBody([bg, tymna, kraum], 'Tymna', { kind: 'add-companion' }, 4)).toEqual({
      primaryCardId: 1, secondCardId: 6, companionCardId: 4,
    })
  })

  it('refuses nonsense (adding a third commander, removing a non-commander)', () => {
    expect(planCommandZoneBody([tymna, thrasios, kraum], 'Tymna', { kind: 'add-commander', as: 'partner' }, 4)).toBeNull()
    expect(planCommandZoneBody([tymna, kraum], 'Tymna', { kind: 'remove-commander' }, 4)).toBeNull()
  })
})

describe('first-commander eligibility', () => {
  const facts = (over: Partial<CommanderCardFacts> & { color_identity?: string }): CommanderCardFacts & { color_identity?: string } => ({
    type_line: 'Legendary Creature — Human',
    oracle_text: '',
    power: '2',
    toughness: '2',
    commander_legal: true,
    ...over,
  })

  it('a Background cannot lead on its own', () => {
    const bg = facts({ type_line: 'Legendary Enchantment — Background' })
    expect(isEligibleLeadCommander(bg)).toBe(false)
    expect(isEligibleLeadCommander(facts({}))).toBe(true)
    expect(isEligibleLeadCommander(facts({ commander_legal: false }))).toBe(false)
  })

  it('a commander whose colours leave a card off-colour is not offered', () => {
    const map = new Map([
      ['rakdos', facts({ color_identity: 'B, R' })],
      ['atraxa', facts({ color_identity: 'B, G, U, W' })],
      ['plain', facts({ type_line: 'Artifact' })],
    ])
    expect(eligibleLeadNames(['Rakdos', 'Atraxa', 'Plain'], map, ['G', 'B, R', ''])).toEqual([])
    expect(eligibleLeadNames(['Rakdos', 'Atraxa'], map, ['B', 'B, R'])).toEqual(['Rakdos'])
    expect(eligibleLeadNames(['Rakdos', 'Atraxa'], map, ['G', 'U'])).toEqual(['Atraxa'])
  })
})
