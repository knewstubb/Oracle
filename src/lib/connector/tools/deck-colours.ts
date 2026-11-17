// CC-21: deck colours in one format everywhere: the letters W U B R G in that order, for example "R" or "WU".
// decks.colour_identity may be stored as "WU" or "W,U"; the card library stores "WU". A colourless or unset value gives null.
const ORDER = ['W', 'U', 'B', 'R', 'G'] as const

/** Colour letters in WUBRG order, or null when none are set. */
export function normaliseColours(raw: string | null | undefined): string | null {
  if (!raw) return null
  const upper = raw.toUpperCase()
  const out = ORDER.filter((c) => upper.includes(c)).join('')
  return out === '' ? null : out
}

/** Colours of a card that are not in the deck's colours, as letters in WUBRG order ("" when it fits). Colourless cards always fit. */
export function coloursOutside(cardColours: string | null | undefined, deckColours: string): string {
  const card = normaliseColours(cardColours) ?? ''
  return [...card].filter((c) => !deckColours.includes(c)).join('')
}
