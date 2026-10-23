import { describe, it, expect } from 'vitest'
import {
  isCompanion,
  isCommanderRow,
  isSecondCommander,
  deckColourIdentity,
  deckCountLabel,
  parseCommandZoneRole,
} from '@/lib/command-zone'
import { evaluateCommanderLegality } from '@/lib/deck-legality'
import { exportDeckAsText } from '@/lib/deck-export'
import { diffDeckCards, type ExistingDeckCardRow, type IncomingCard } from '@/lib/deck-cards-diff'

describe('isCompanion / roles', () => {
  it('only the companion role counts as companion', () => {
    expect(isCompanion({ command_zone_role: 'companion' })).toBe(true)
    expect(isCompanion({ command_zone_role: 'partner', is_commander: true })).toBe(false)
    expect(isCompanion({ is_commander: true })).toBe(false)
    expect(isCompanion(null)).toBe(false)
  })
  it('partner/background count as commanders, companion does not', () => {
    expect(isCommanderRow({ is_commander: true, command_zone_role: 'partner' })).toBe(true)
    expect(isCommanderRow({ is_commander: true, command_zone_role: 'background' })).toBe(true)
    expect(isCommanderRow({ is_commander: false, command_zone_role: 'companion' })).toBe(false)
    expect(isSecondCommander({ command_zone_role: 'background' })).toBe(true)
    expect(isSecondCommander({ command_zone_role: 'companion' })).toBe(false)
  })
  it('parses roles strictly', () => {
    expect(parseCommandZoneRole('companion')).toBe('companion')
    expect(parseCommandZoneRole('commander')).toBeNull()
    expect(parseCommandZoneRole(undefined)).toBeNull()
  })
})

describe('colour identity ignores the companion', () => {
  it('unions commander + partner only', () => {
    const rows = [
      { is_commander: true, command_zone_role: null, color_identity: 'G' },
      { is_commander: true, command_zone_role: 'partner', color_identity: 'U' },
      { is_commander: false, command_zone_role: 'companion', color_identity: 'WBR' },
      { is_commander: false, command_zone_role: null, color_identity: 'R' },
    ]
    expect(deckColourIdentity(rows)).toBe('UG')
  })
})

describe('count label', () => {
  it('adds + Companion only when there is one', () => {
    expect(deckCountLabel(100, 100, true)).toBe('100/100 + Companion')
    expect(deckCountLabel(99, 100, false)).toBe('99/100')
  })
})

describe('legality treats the companion as outside the deck', () => {
  const map = {
    Commander: { commander_legal: true, color_identity: 'G' },
    Lurrus: { commander_legal: true, color_identity: 'W' },
    Banned: { commander_legal: false, color_identity: 'W' },
    Forest: { commander_legal: true, color_identity: 'G' },
  }
  const g = new Set(['G'])

  it('no colour-identity issue for an off-colour companion', () => {
    const issues = evaluateCommanderLegality(
      [
        { card_name: 'Commander', quantity: 1, is_commander: true },
        { card_name: 'Lurrus', quantity: 1, is_commander: false, command_zone_role: 'companion' },
      ],
      map,
      g
    )
    expect(issues).toEqual([])
  })
  it('the same card as an ordinary row IS flagged', () => {
    const issues = evaluateCommanderLegality(
      [{ card_name: 'Lurrus', quantity: 1, is_commander: false }],
      map,
      g
    )
    expect(issues.map((i) => i.reason)).toEqual(['color_identity'])
  })
  it('a banned companion is still reported', () => {
    const issues = evaluateCommanderLegality(
      [{ card_name: 'Banned', quantity: 1, is_commander: false, command_zone_role: 'companion' }],
      map,
      g
    )
    expect(issues.map((i) => i.reason)).toEqual(['banned'])
  })
  it('no singleton issue for the companion; still for others', () => {
    const issues = evaluateCommanderLegality(
      [
        { card_name: 'Lurrus', quantity: 2, is_commander: false, command_zone_role: 'companion' },
        { card_name: 'Commander', quantity: 2, is_commander: false },
        { card_name: 'Forest', quantity: 30, is_commander: false },
      ],
      map,
      g
    )
    expect(issues.map((i) => i.cardName)).toEqual(['Commander'])
  })
  it('partner commander is not colour-checked', () => {
    const issues = evaluateCommanderLegality(
      [{ card_name: 'Lurrus', quantity: 1, is_commander: true, command_zone_role: 'partner' }],
      map,
      g
    )
    expect(issues).toEqual([])
  })
})

describe('export', () => {
  it('lists the companion under a Companion heading, not Sideboard', () => {
    const text = exportDeckAsText([
      { card_name: 'Atraxa', set_code: 'c16', quantity: 1, categories: '["Commander"]', is_commander: true },
      { card_name: 'Lurrus of the Dream-Den', set_code: 'iko', quantity: 1, categories: '["Sideboard"]', is_commander: false, command_zone_role: 'companion' },
      { card_name: 'Sol Ring', set_code: 'c21', quantity: 1, categories: '["Ramp"]', is_commander: false },
    ])
    expect(text).toContain('// Companion\n1 Lurrus of the Dream-Den (IKO)')
    expect(text).not.toContain('// Sideboard')
  })
})

describe('deck-cards-diff carries the role', () => {
  const existing: ExistingDeckCardRow = {
    id: 1, deck_id: 1, card_name: 'Lurrus', scryfall_id: 's', set_code: 'iko', quantity: 1,
    categories: '["Sideboard"]', is_commander: false, command_zone_role: 'companion', user_id: 'u',
    copy_id: 5, ownership_status: null, proxy_of_deck_id: null, dead_weight_flag: null, dead_weight_reason: null,
  }
  const incoming = (extra: Partial<IncomingCard> = {}): IncomingCard => ({
    card_name: 'Lurrus', scryfall_id: 's', set_code: 'iko', quantity: 1,
    categories: '["Sideboard"]', is_commander: false, ...extra,
  })
  it('keeps an existing companion row on re-import (not deleted/re-inserted)', () => {
    const d = diffDeckCards([existing], [incoming({ command_zone_role: 'companion' })])
    expect(d.toKeep).toEqual([1])
    expect(d.toDelete).toEqual([])
    expect(d.toInsert).toEqual([])
  })
  it('new rows carry the role', () => {
    const d = diffDeckCards([], [incoming({ command_zone_role: 'companion' })])
    expect(d.toInsert[0].command_zone_role).toBe('companion')
  })
})
