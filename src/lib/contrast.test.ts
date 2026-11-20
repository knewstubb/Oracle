import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { composite, contrastRatio, parseColor, tokenValue } from './contrast'
import { CANVAS_VAR, MANA_FILL_HEX, MANA_FILL_VARS, MUTED_TEXT_VAR, SURFACE_VAR, SWATCH_VARS, type ManaLetter } from './ui-tokens'

const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const tok = (name: string) => parseColor(tokenValue(css, name))
// The card surface is translucent, so check against it painted over the page background.
const surface = composite(tok(SURFACE_VAR), tok(CANVAS_VAR))

describe('contrast helpers', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio(parseColor('#000000'), parseColor('#FFFFFF'))).toBeCloseTo(21, 5)
  })
  it('composites a translucent colour over the canvas', () => {
    expect(composite(parseColor('rgba(255,255,255,0.5)'), parseColor('#000000'))).toEqual({ r: 128, g: 128, b: 128, a: 1 })
  })
})

describe('deck rail tokens against the card surface', () => {
  it('ui-tokens mana hex values match tokens.css', () => {
    for (const k of Object.keys(MANA_FILL_VARS) as ManaLetter[]) expect(tokenValue(css, MANA_FILL_VARS[k]).toUpperCase()).toBe(MANA_FILL_HEX[k])
  })
  it.each(Object.keys(MANA_FILL_VARS) as ManaLetter[])('mana fill %s is at least 3:1', (k) => {
    expect(contrastRatio(tok(MANA_FILL_VARS[k]), surface)).toBeGreaterThanOrEqual(3)
  })
  it('muted text is at least 4.5:1', () => {
    expect(contrastRatio(tok(MUTED_TEXT_VAR), surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(tok('--text-muted'), surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('amber is at least 4.5:1 as text', () => {
    expect(contrastRatio(tok(SWATCH_VARS.amber), surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('original and other-decks swatch greys are at least 3:1', () => {
    expect(contrastRatio(tok(SWATCH_VARS.original), surface)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(tok(SWATCH_VARS.otherDecks), surface)).toBeGreaterThanOrEqual(3)
  })
})
