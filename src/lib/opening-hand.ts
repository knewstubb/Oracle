// Land odds for the deck rail: opening hand and land drops, from the hypergeometric distribution.
// Lands only (owner answer, FEAT-001): a land drop needs a land, so ramp is not counted.
// Cards seen are on the play: 7 + turn - 1 (9 cards by turn 3, 10 by turn 4, 12 by turn 6).

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  const m = Math.min(k, n - k)
  let r = 1
  for (let i = 1; i <= m; i++) r = (r * (n - m + i)) / i
  return r
}

/** Chance of exactly `x` lands among `drawn` cards from a library of `library` cards holding `lands` lands. */
function exactly(library: number, lands: number, drawn: number, x: number): number {
  return (comb(lands, x) * comb(library - lands, drawn - x)) / comb(library, drawn)
}

/** Chance of between `min` and `max` lands (inclusive) among `drawn` cards. */
export function landsBetween(library: number, lands: number, drawn: number, min: number, max: number): number {
  if (library <= 0 || drawn <= 0 || drawn > library) return 0
  let p = 0
  for (let x = Math.max(0, min); x <= Math.min(max, lands, drawn); x++) p += exactly(library, lands, drawn, x)
  return Math.min(1, p)
}

/** Chance of `k` or more lands among `drawn` cards. */
export function atLeastLands(library: number, lands: number, drawn: number, k: number): number {
  return landsBetween(library, lands, drawn, k, drawn)
}

export interface HandOdds {
  /** Seven-card opening hand: 0-1, 2-4 and 5+ lands, as fractions 0..1. */
  opening: { low: number; mid: number; high: number }
  /** 3rd land by turn 3 (9 cards seen). */
  thirdLandByTurn3: number
  /** 4th land by turn 4 (10 cards seen). */
  fourthLandByTurn4: number
  /** 7+ lands in 12 cards (turn 6). */
  floodedByTurn6: number
}

/** Library is the main deck minus commanders (a 100-card deck draws from 99). */
export function handOdds(library: number, lands: number): HandOdds {
  return {
    opening: {
      low: landsBetween(library, lands, 7, 0, 1),
      mid: landsBetween(library, lands, 7, 2, 4),
      high: landsBetween(library, lands, 7, 5, 7),
    },
    thirdLandByTurn3: atLeastLands(library, lands, 9, 3),
    fourthLandByTurn4: atLeastLands(library, lands, 10, 4),
    floodedByTurn6: atLeastLands(library, lands, 12, 7),
  }
}
