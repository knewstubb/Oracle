// Counting for the deck page left rail (mana curve, colour needs, card count).
// No new maths: this only arranges the results of calculateCMC, analyzeColorRequirements and countLandSources.
import { analyzeColorRequirements, calculateCMC, countLandSources, parseManaCost } from '@/lib/mana-analysis'
import { isLandTypeLine } from '@/lib/card-roles'
import { parseColourLetters } from '@/lib/command-zone'
import { computeDeckReadiness } from '@/lib/deck-readiness'
import type { LegalityIssue } from '@/lib/deck-legality'
import type { ManaLetter } from '@/lib/ui-tokens'

export interface RailCard {
  card_name: string
  quantity?: number
  mana_cost?: string | null
  type_line?: string | null
  categories?: string | null
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

/** Average mana value of the non-land cards with a cost on file, weighted by quantity. Null when there is none. */
export function avgManaValue(cards: RailCard[]): number | null {
  let total = 0
  let n = 0
  for (const card of cards) {
    if (isLandTypeLine(card.type_line) || !card.mana_cost) continue
    total += calculateCMC(card.mana_cost) * qty(card)
    n += qty(card)
  }
  return n > 0 ? total / n : null
}

const MANA_ORDER: ManaLetter[] = ['W', 'U', 'B', 'R', 'G']

export interface CurvePanelSegment {
  /** A colour letter, 'C' for colourless (no coloured pip) or 'M' for multicolour (two or more colours). */
  key: ManaLetter | 'M'
  label: string
  count: number
}

/** The cards at one mana value (7 means 7 or more), split by colour. Lands are excluded. Zero-count entries are kept so callers can filter. */
export function curvePanel(cards: RailCard[], mv: number): { total: number; segments: CurvePanelSegment[] } {
  const counts = new Map<string, number>()
  let total = 0
  for (const card of cards) {
    if (isLandTypeLine(card.type_line) || !card.mana_cost) continue
    if (Math.min(calculateCMC(card.mana_cost), 7) !== mv) continue
    const pips = parseManaCost(card.mana_cost)
    const colours = MANA_ORDER.filter((c) => pips[c as 'W'] > 0)
    const key = colours.length >= 2 ? 'M' : colours.length === 1 ? colours[0] : 'C'
    counts.set(key, (counts.get(key) ?? 0) + qty(card))
    total += qty(card)
  }
  const order: Array<[CurvePanelSegment['key'], string]> = [
    ['W', 'White'], ['U', 'Blue'], ['B', 'Black'], ['R', 'Red'], ['G', 'Green'], ['C', 'Colourless'], ['M', 'Multicolour'],
  ]
  return { total, segments: order.map(([key, label]) => ({ key, label, count: counts.get(key) ?? 0 })) }
}

export interface ColourBalanceRow {
  colour: ManaLetter
  /** Share of the deck's coloured pips, whole percent. */
  demandPct: number
  /** Coloured pips in the mana costs of the nonland cards. */
  pips: number
  /** Share of coloured land sources over the identity colours, whole percent. */
  supplyPct: number
  /** Lands that can make this colour. */
  sources: number
}
export interface ColourBalance {
  kind: 'colourless' | 'mono' | 'multi'
  rows: ColourBalanceRow[]
  landCount: number
}
/** Pips against land sources on one percent scale, built from colourNeeds. */
export function colourBalance(cards: RailCard[], colourIdentity: string | null | undefined): ColourBalance {
  const needs = colourNeeds(cards, colourIdentity)
  if (needs.colourless) return { kind: 'colourless', rows: [], landCount: needs.landCount }
  const sourceSum = needs.rows.reduce((n, r) => n + r.sources, 0)
  const rows = needs.rows.map(
    (r): ColourBalanceRow => ({
      colour: r.colour as ManaLetter,
      demandPct: r.symbolsPct,
      pips: r.symbols,
      supplyPct: sourceSum > 0 ? Math.round((r.sources / sourceSum) * 100) : 0,
      sources: r.sources,
    }),
  )
  return { kind: rows.length === 1 ? 'mono' : 'multi', rows, landCount: needs.landCount }
}
export function cardCountView(total: number, target: number | null | undefined): { label: string; over: number } {
  if (target == null) return { label: `${total}`, over: 0 }
  return { label: `${total} / ${target}`, over: Math.max(0, total - target) }
}

// ---- Cards section ----

/** The numbers the card-statuses route returns (all optional so a partial response never crashes the rail). */
export interface StatusCountsInput {
  size?: number
  sleeved?: number
  unowned?: number
  original?: number
  proxy?: number
  available?: number
  in_hand?: number
  claimed?: number
  generic_land?: number
  generic_unsleeved?: number
}

// ---- Status ladder ----

export interface BuildStatusView {
  state: 'brewing' | 'assembling' | 'playable'
  sleeved: number
  /** The number after "of": the format's deck size, or the list size when the format has none. */
  of: number
}

/**
 * Build status from the card-statuses counts. No second copy of the rule: it builds one synthetic slot per
 * counted card (sleeved first) and asks computeDeckReadiness.
 */
export function railBuildStatus(
  counts: { sleeved?: number; size?: number },
  deckSize: number | null,
  countRule: 'exact' | 'minimum' | null = 'exact',
): BuildStatusView {
  const size = Math.max(0, counts.size ?? 0)
  const sleeved = Math.min(size, Math.max(0, counts.sleeved ?? 0))
  const slots = Array.from({ length: size }, (_, i) => ({ copy_id: i < sleeved ? 1 : null }))
  const r = computeDeckReadiness(slots, deckSize, countRule)
  return { state: r.state, sleeved: r.sleeved, of: deckSize ?? r.size }
}

export type CardsStatus = 'playable' | 'assembling' | 'brewing'
export interface CardsProblem {
  key: string
  text: string
  /** Shown at the right of the row, e.g. "71 / 100". */
  right?: string
}
export interface CardsSectionView {
  /** The big number. */
  count: string
  /** The small text after it, e.g. "/ 100 cards". */
  countSuffix: string
  /** True when the count is not the deck size (amber). */
  amber: boolean
  status: CardsStatus
  legal: boolean
  problems: CardsProblem[]
}
export interface CardsSectionInput {
  /** Cards in the main deck. */
  total: number
  /** The format's deck size; null when the format has none. */
  deckSize: number | null
  /** Sleeved cards (any number; capped at 100 for display). */
  sleeved: number
  /** Build state from computeDeckReadiness (via railBuildStatus). */
  readiness: BuildStatusView['state']
  /** Legality faults from the legality route (empty when none or not yet known). */
  issues: LegalityIssue[]
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
/**
 * Everything the Cards section shows, from existing numbers. Legal only when the list is exactly the deck size
 * and no card is banned, outside the colour identity or over the copy limit. Playable needs all sleeved AND legal.
 */
export function cardsSectionView(input: CardsSectionInput): CardsSectionView {
  const { total, deckSize, issues } = input
  const target = deckSize ?? total
  const problems: CardsProblem[] = []
  const diff = total - target
  if (diff > 0) problems.push({ key: 'over', text: `${plural(diff, 'card', 'cards')} over` })
  if (diff < 0) problems.push({ key: 'short', text: `${plural(-diff, 'card', 'cards')} short` })
  const count = (reason: LegalityIssue['reason']) => issues.filter((i) => i.reason === reason).length
  const identity = count('color_identity')
  const banned = count('banned')
  const copies = count('over_limit')
  if (identity > 0) problems.push({ key: 'identity', text: `${plural(identity, 'card', 'cards')} outside colour identity` })
  if (banned > 0) problems.push({ key: 'banned', text: `${plural(banned, 'banned card', 'banned cards')}` })
  if (copies > 0) problems.push({ key: 'copies', text: `${plural(copies, 'card', 'cards')} with more than one copy` })
  const legal = problems.length === 0
  const cap = deckSize ?? total
  const sleeved = Math.max(0, Math.min(input.sleeved, cap, total))
  const notSleeved = total >= cap ? cap - sleeved : total - sleeved
  if (notSleeved > 0) problems.push({ key: 'unsleeved', text: `${plural(notSleeved, 'card', 'cards')} not sleeved`, right: `${sleeved} / ${cap}` })
  const status: CardsStatus = sleeved === 0 ? 'brewing' : input.readiness === 'playable' && legal ? 'playable' : 'assembling'
  return {
    count: `${total}`,
    countSuffix: deckSize != null ? `/ ${deckSize} cards` : total === 1 ? 'card' : 'cards',
    amber: deckSize != null && total !== deckSize,
    status,
    legal,
    problems,
  }
}
