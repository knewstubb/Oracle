// Counting for the deck page left rail (mana curve, colour needs, card count).
// No new maths: this only arranges the results of calculateCMC, analyzeColorRequirements and countLandSources.
import { analyzeColorRequirements, calculateCMC, countLandSources } from '@/lib/mana-analysis'
import { isLandTypeLine } from '@/lib/card-roles'
import { parseColourLetters } from '@/lib/command-zone'

export interface RailCard {
  card_name: string
  quantity?: number
  mana_cost?: string | null
  type_line?: string | null
}

const qty = (c: RailCard) => c.quantity || 1

export interface ManaCurve {
  /** Index 0..7, where 7 means "7 or more". */
  buckets: number[]
  /** Non-land cards with no mana cost on file. Never estimated, never put in a bucket. */
  unknown: number
}

export function manaCurveBuckets(cards: RailCard[]): ManaCurve {
  const buckets = new Array<number>(8).fill(0)
  let unknown = 0
  for (const card of cards) {
    if (isLandTypeLine(card.type_line)) continue
    if (!card.mana_cost) {
      unknown += qty(card)
      continue
    }
    buckets[Math.min(calculateCMC(card.mana_cost), 7)] += qty(card)
  }
  return { buckets, unknown }
}

export interface ColourNeedRow {
  colour: string
  /** Share of the deck's coloured symbols, whole percent. */
  symbolsPct: number
  symbols: number
  /** Lands that make this colour (basic and well-known dual lands only). */
  sources: number
}

export interface ColourNeeds {
  colourless: boolean
  rows: ColourNeedRow[]
  landCount: number
}

export function colourNeeds(cards: RailCard[], colourIdentity: string | null | undefined): ColourNeeds {
  const identity = parseColourLetters(colourIdentity)
  const colours = 'WUBRG'.split('').filter((c) => identity.has(c))
  const lands = cards.filter((c) => isLandTypeLine(c.type_line))
  const landCount = lands.reduce((sum, c) => sum + qty(c), 0)
  if (colours.length === 0) return { colourless: true, rows: [], landCount }
  const pips = analyzeColorRequirements(cards.filter((c) => !isLandTypeLine(c.type_line))).totalPips
  const sources = countLandSources(lands, colours.join(''))
  const totalSymbols = colours.reduce((sum, c) => sum + pips[c as 'W'], 0)
  return {
    colourless: false,
    landCount,
    rows: colours.map((c) => ({
      colour: c,
      symbols: pips[c as 'W'],
      symbolsPct: totalSymbols > 0 ? Math.round((pips[c as 'W'] / totalSymbols) * 100) : 0,
      sources: sources[c] ?? 0,
    })),
  }
}

export function cardCountView(total: number, target: number | null | undefined): { label: string; over: number } {
  if (target == null) return { label: `${total}`, over: 0 }
  return { label: `${total} / ${target}`, over: Math.max(0, total - target) }
}
