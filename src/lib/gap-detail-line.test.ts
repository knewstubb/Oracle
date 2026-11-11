import { describe, it, expect } from 'vitest'
import { gapDetailLine } from './gap-detail-line'

describe('gapDetailLine', () => {
  it('draw', () => {
    expect(gapDetailLine('draw', 'Sorcery', 'Draw two cards.')).toBe('Draws two cards.')
    expect(gapDetailLine('draw', 'Enchantment', 'Whenever a creature dies, you draw a card.')).toBe('Draws a card.')
    expect(gapDetailLine('draw', 'Artifact', 'Something with draw in it')).toBe('Draws you cards.')
  })
  it('removal', () => {
    expect(gapDetailLine('removal', 'Instant', 'Exile target creature. Its controller gains life.')).toBe('Exiles target creature.')
    expect(gapDetailLine('removal', 'Instant', 'Destroy target artifact or creature.')).toBe('Destroys target artifact or creature.')
    expect(gapDetailLine('removal', 'Instant', 'Target creature gets -3/-3 until end of turn.')).toBe('Shrinks a creature.')
  })
  it('wipes', () => {
    expect(gapDetailLine('wipes', 'Sorcery', 'Destroy all creatures.')).toBe('Destroys all creatures.')
    expect(gapDetailLine('wipes', 'Sorcery', 'Blasphemous Act deals 13 damage to each creature.')).toBe('Damages every creature.')
  })
  it('ramp', () => {
    expect(gapDetailLine('ramp', 'Artifact', '{T}: Add {C}{C}.')).toBe('Adds mana.')
    expect(gapDetailLine('ramp', 'Sorcery', 'Search your library for a basic land card, put it onto the battlefield tapped.')).toBe('Puts a land onto the battlefield.')
  })
  it('lands use the front face only and never describe a spell as a land', () => {
    expect(gapDetailLine('lands', 'Land', '{T}: Add {C}.')).toBe('Taps for mana.')
    expect(gapDetailLine('lands', 'Instant // Land', 'Draw a card.')).toBeNull()
  })
})
