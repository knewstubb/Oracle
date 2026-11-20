/**
 * Shared UI tokens for the deck rail and anything that must match it. The CSS custom properties live in
 * src/styles/tokens.css; the values here are the same ones as data, so tests (contrast.test.ts) and
 * components read one source. Keep the two in step.
 */

/** The one card surface: group cards on the Cards tab and the deck rail share it. */
export const CARD_SURFACE_CLASS = 'rounded-lg border border-white/[0.08]'
export const CARD_SURFACE_BACKGROUND = 'rgba(26,26,30,0.5)'
export const CARD_SURFACE_STYLE = { backgroundColor: CARD_SURFACE_BACKGROUND } as const

export type ManaLetter = 'W' | 'U' | 'B' | 'R' | 'G' | 'C'

export const MANA_FILL_VARS: Record<ManaLetter, string> = {
  W: '--mana-fill-w',
  U: '--mana-fill-u',
  B: '--mana-fill-b',
  R: '--mana-fill-r',
  G: '--mana-fill-g',
  C: '--mana-fill-c',
}

export const MANA_FILL_HEX: Record<ManaLetter, string> = {
  W: '#F0E6B8',
  U: '#4C9BE8',
  B: '#8E7F9E',
  R: '#E5604D',
  G: '#3DAA6D',
  C: '#9AA0A6',
}

export const MANA_NAMES: Record<ManaLetter, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colourless',
}

/** CSS variable names for the card-state swatches and the warning amber. */
export const SWATCH_VARS = {
  original: '--swatch-original',
  otherDecks: '--swatch-other-decks',
  unowned: '--swatch-unowned',
  amber: '--warn-amber',
} as const

export const SURFACE_VAR = '--surface-card'
export const CANVAS_VAR = '--bg-canvas'
export const MUTED_TEXT_VAR = '--text-secondary'

/** Section label: 11px, 600, uppercase, letter-spaced, muted. Shared by every rail section and the Strategy block. */
export const SECTION_LABEL_CLASS = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]'
