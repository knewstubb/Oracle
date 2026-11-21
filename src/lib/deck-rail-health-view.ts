// The EDHREC reference line for Deck health. It used to sit in the rail; the rail now shows only the tiles, and this line
// lives in the Deck health tab of Deck settings. The tile numbers themselves come from deck-health-settings.ts.
import type { DeckHealthResponse } from './deck-health'

/** Below this many decks the EDHREC average is a rough guide only. */
export const SMALL_SAMPLE_DECKS = 1000

export function referenceLine(health: DeckHealthResponse): { text: string; sample: number | null; smallSample: boolean } {
  const sample = health.reference.sample ?? null
  const smallSample = health.reference.available && sample !== null && sample < SMALL_SAMPLE_DECKS
  const text = !health.reference.available
    ? health.reference.label
    : sample !== null
      ? `EDHREC average for reference · ${sample.toLocaleString('en-US')} decks`
      : 'EDHREC average for reference'
  return { text, sample, smallSample }
}
