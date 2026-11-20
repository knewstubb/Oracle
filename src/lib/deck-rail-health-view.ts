// What the deck rail shows for Deck health. A view over buildDeckHealth: it reorders and words the same rows,
// and never recounts anything, so the rail and get_deck_health cannot disagree.
import type { DeckHealthResponse, HealthKind, HealthRow } from './deck-health'

/** Below this many decks the EDHREC average is a rough guide only. */
export const SMALL_SAMPLE_DECKS = 1000

const SHORT_NAMES: Record<HealthKind, string> = {
  lands: 'lands',
  ramp: 'ramp',
  card_advantage: 'card advantage',
  targeted_removal: 'removal',
  board_wipes: 'board wipes',
  game_plan: 'game plan',
}

export interface RailHealthRow {
  kind: HealthKind
  /** The row label with " / Mass Disruption" dropped so it fits the rail. */
  label: string
  have: number
  /** "35 to 38"; null for Game Plan. */
  rangeText: string | null
  min: number | null
  max: number | null
  /** Negative number of cards below the minimum; null unless the row is below its minimum. Shown amber. */
  delta: number | null
  /** Reserved: a later "proposed, not confirmed" range can set this. Always false today. */
  proposed: boolean
  doubleFaced: number
  /** Spoken name of the row. No Ok / Light / Heavy words. */
  ariaLabel: string
}

export interface RailHealthView {
  /** "Light on ramp and removal" or "Well covered". */
  verdict: { text: string; short: boolean }
  /** Shortfalls first (largest first), then the rest in their usual order, Game Plan last. */
  rows: RailHealthRow[]
  reference: { text: string; sample: number | null; smallSample: boolean }
}

const plural = (n: number) => (n === 1 ? 'card' : 'cards')

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function toRow(r: HealthRow): RailHealthRow {
  const label = r.label.replace(' / Mass Disruption', '')
  const delta = r.range !== null && r.offBy < 0 ? r.offBy : null
  const rangeText = r.range ? `${r.range.min} to ${r.range.max}` : null
  let aria = `${label}: ${r.have} ${plural(r.have)}.`
  if (rangeText) aria += ` Range ${rangeText}.`
  if (delta !== null) aria += ` ${-delta} below the minimum.`
  if (!rangeText) aria += ' A total, no range.'
  return {
    kind: r.kind,
    label,
    have: r.have,
    rangeText,
    min: r.range?.min ?? null,
    max: r.range?.max ?? null,
    delta,
    proposed: false,
    doubleFaced: r.doubleFaced ?? 0,
    ariaLabel: `${aria} Open details.`,
  }
}

export function railHealthView(health: DeckHealthResponse): RailHealthView {
  const all = health.rows.map(toRow)
  const ranged = all.filter((r) => r.kind !== 'game_plan')
  const short = ranged.filter((r) => r.delta !== null).sort((a, b) => a.delta! - b.delta!)
  const rest = ranged.filter((r) => r.delta === null)
  const gamePlan = all.filter((r) => r.kind === 'game_plan')
  const text = short.length > 0 ? `Light on ${joinNames(short.map((r) => SHORT_NAMES[r.kind]))}` : 'Well covered'
  const sample = health.reference.sample ?? null
  const smallSample = health.reference.available && sample !== null && sample < SMALL_SAMPLE_DECKS
  const refText = !health.reference.available
    ? health.reference.label
    : sample !== null
      ? `EDHREC average for reference · ${sample.toLocaleString('en-US')} decks`
      : 'EDHREC average for reference'
  return {
    verdict: { text, short: short.length > 0 },
    rows: [...short, ...rest, ...gamePlan],
    reference: { text: refText, sample, smallSample },
  }
}
