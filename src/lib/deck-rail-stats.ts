// Counting for the deck page left rail (mana curve, colour needs, card count).
// No new maths: this only arranges the results of calculateCMC, analyzeColorRequirements and countLandSources.
import { analyzeColorRequirements, calculateCMC, countLandSources, parseManaCost } from '@/lib/mana-analysis'
import { isLandTypeLine } from '@/lib/card-roles'
import { isCompanion, parseColourLetters } from '@/lib/command-zone'
import { computeDeckReadiness } from '@/lib/deck-readiness'
import type { LegalityIssue } from '@/lib/deck-legality'
import type { CopySwatchKind } from '@/components/CopySwatch'
import type { ManaLetter } from '@/lib/ui-tokens'

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

const MANA_ORDER: ManaLetter[] = ['W', 'U', 'B', 'R', 'G', 'C']

export interface CurveColumn {
  /** "1" to "6", "7+" (and "0" only when a zero-cost card exists). */
  label: string
  total: number
  /** Cards in this column split by card colour; a multicolour card is split evenly, a colourless one is C. */
  segments: Array<{ colour: ManaLetter; count: number }>
}

/** The curve with each bar stacked by card colour. The 0 column is dropped when it is empty. */
export function curveByColour(cards: RailCard[]): { columns: CurveColumn[]; unknown: number } {
  const labels = ['0', '1', '2', '3', '4', '5', '6', '7+']
  const parts = labels.map(() => new Map<ManaLetter, number>())
  const totals = new Array<number>(8).fill(0)
  let unknown = 0
  for (const card of cards) {
    if (isLandTypeLine(card.type_line)) continue
    if (!card.mana_cost) {
      unknown += qty(card)
      continue
    }
    const i = Math.min(calculateCMC(card.mana_cost), 7)
    const pips = parseManaCost(card.mana_cost)
    const colours = MANA_ORDER.filter((c) => c !== 'C' && pips[c as 'W'] > 0)
    const split: ManaLetter[] = colours.length > 0 ? colours : ['C']
    totals[i] += qty(card)
    for (const c of split) parts[i].set(c, (parts[i].get(c) ?? 0) + qty(card) / split.length)
  }
  const columns = labels
    .map((label, i) => ({
      label,
      total: totals[i],
      segments: MANA_ORDER.filter((c) => parts[i].has(c)).map((c) => ({ colour: c, count: parts[i].get(c)! })),
    }))
    .filter((c, i) => !(i === 0 && c.total === 0))
  return { columns, unknown }
}

/** Demand trailing supply by at least this many whole points shows the amber chip. */
export const UNDER_SUPPLY_POINTS = 5

export interface ColourBalanceRow {
  colour: ManaLetter
  /** Share of the deck's coloured pips, whole percent. */
  demandPct: number
  /** Share of coloured land sources over the identity colours, whole percent. */
  supplyPct: number
  /** Demand minus supply in points (positive = supply trails demand). */
  gap: number
  /** True when the gap is at least UNDER_SUPPLY_POINTS. */
  under: boolean
}

export interface ColourBalance {
  kind: 'colourless' | 'mono' | 'multi'
  rows: ColourBalanceRow[]
  /** Colours that are under-supplied, in WUBRG order. */
  underColours: ManaLetter[]
}

/** Pips against land sources on one percent scale, built from colourNeeds. No chip when no land makes any identity colour. */
export function colourBalance(cards: RailCard[], colourIdentity: string | null | undefined): ColourBalance {
  const needs = colourNeeds(cards, colourIdentity)
  if (needs.colourless) return { kind: 'colourless', rows: [], underColours: [] }
  const sourceSum = needs.rows.reduce((n, r) => n + r.sources, 0)
  const rows = needs.rows.map((r): ColourBalanceRow => {
    const supplyPct = sourceSum > 0 ? Math.round((r.sources / sourceSum) * 100) : 0
    const gap = r.symbolsPct - supplyPct
    return { colour: r.colour as ManaLetter, demandPct: r.symbolsPct, supplyPct, gap, under: sourceSum > 0 && gap >= UNDER_SUPPLY_POINTS }
  })
  return { kind: rows.length === 1 ? 'mono' : 'multi', rows, underColours: rows.filter((r) => r.under).map((r) => r.colour) }
}

export function cardCountView(total: number, target: number | null | undefined): { label: string; over: number } {
  if (target == null) return { label: `${total}`, over: 0 }
  return { label: `${total} / ${target}`, over: Math.max(0, total - target) }
}

// ---- Cards section: segmented bar, legend, buy line, Outside the 100 ----

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

export type LegendGroup = 'sleeved' | 'notSleeved' | 'empty'
export interface LegendItem {
  key: 'original' | 'proxy' | 'basics' | 'open' | 'basics_unsleeved' | 'other_decks' | 'unowned' | 'empty'
  kind: CopySwatchKind
  label: string
  count: number
  group: LegendGroup
}
export const LEGEND_GROUP_LABELS: Record<LegendGroup, string> = { sleeved: 'Sleeved', notSleeved: 'Not sleeved', empty: 'Empty' }

/**
 * One item per card state, zero counts left out. Sleeved = a real copy (Original, Proxy) or a Sleeved generic basic.
 * Empty = slots still missing from the format's deck size. Wording follows the allocation convention
 * (Open = a free copy in storage, In other decks = held by another deck).
 */
export function cardLegend(counts: StatusCountsInput, deckSize: number | null): LegendItem[] {
  const n = (v: number | undefined) => Math.max(0, v ?? 0)
  const genericTotal = n(counts.generic_land)
  const genericUnsleeved = Math.min(genericTotal, n(counts.generic_unsleeved))
  const empty = deckSize != null ? Math.max(0, deckSize - n(counts.size)) : 0
  const items: LegendItem[] = [
    { key: 'original', kind: 'original', label: 'Original', count: n(counts.original), group: 'sleeved' },
    { key: 'proxy', kind: 'proxy', label: 'Proxy', count: n(counts.proxy), group: 'sleeved' },
    { key: 'basics', kind: 'basics', label: 'Basics', count: genericTotal - genericUnsleeved, group: 'sleeved' },
    { key: 'open', kind: 'open', label: 'Open', count: n(counts.available) + n(counts.in_hand), group: 'notSleeved' },
    { key: 'basics_unsleeved', kind: 'basics', label: 'Basics, not sleeved', count: genericUnsleeved, group: 'notSleeved' },
    { key: 'other_decks', kind: 'other_deck', label: 'In other decks', count: n(counts.claimed), group: 'notSleeved' },
    { key: 'unowned', kind: 'unowned', label: 'Unowned', count: n(counts.unowned), group: 'notSleeved' },
    { key: 'empty', kind: 'empty', label: empty === 1 ? 'Empty slot' : 'Empty slots', count: empty, group: 'empty' },
  ]
  return items.filter((i) => i.count > 0)
}

/** "To buy": the unowned cards of the deck and what they cost. Price is null when no unowned card has a price. */
export function toBuyView(
  unownedNames: string[],
  deckCards: Array<{ card_name: string; quantity?: number; price_usd?: number | null }>,
): { count: number; price: number | null; partial: boolean } {
  const names = new Set(unownedNames)
  let count = 0
  let price = 0
  let priced = 0
  for (const c of deckCards) {
    if (!names.has(c.card_name)) continue
    const q = qty(c)
    count += q
    if (c.price_usd != null && c.price_usd > 0) {
      price += c.price_usd * q
      priced += q
    }
  }
  return { count, price: priced > 0 ? price : null, partial: priced > 0 && priced < count }
}

export interface OutsideView {
  companion: { name: string; sleeved: boolean } | null
  maybeboard: number
  tokens: number
}

/** Chips for "Outside the 100". The companion is the one row with role companion; Maybeboard and Tokens are counted by category. */
export function outsideTheHundred(
  all: Array<{ card_name: string; quantity?: number; categories?: string | null; command_zone_role?: string | null; has_copy?: boolean; type_line?: string | null }>,
): OutsideView {
  let companion: OutsideView['companion'] = null
  let maybeboard = 0
  let tokens = 0
  for (const c of all) {
    if (isCompanion(c)) {
      companion = { name: c.card_name, sleeved: !!c.has_copy }
      continue
    }
    const cats = c.categories ?? ''
    if (cats.includes('Maybeboard')) maybeboard += qty(c)
    else if (cats.includes('Tokens') || /^Token\b/.test(c.type_line ?? '')) tokens += qty(c)
  }
  return { companion, maybeboard, tokens }
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

export type LegalityViewStatus = 'legal' | 'not_legal' | 'unverified'
export interface LegalityView {
  status: LegalityViewStatus
  /** One line per problem (Not legal). */
  bullets: string[]
  /** What was checked (Legal) or what is still unchecked (Unverified). */
  subline: string | null
}

const MAX_BULLETS = 5

/**
 * Today's legality data (Legal / Not legal from the route) shown in the three-state rail.
 * The route does not check deck size, so when nothing is illegal but the list is not the full size the rail says
 * "Legal so far" and gives the count (display wording only; Gate A adds the real size rule).
 */
export function legalityView(
  data: { isLegal: boolean; issues: LegalityIssue[] },
  totalCards: number,
  deckSize: number | null,
): LegalityView {
  const issues = data.issues ?? []
  if (!data.isLegal) {
    const banned = issues.filter((i) => i.reason === 'banned').map((i) => i.cardName)
    const bullets: string[] = []
    if (banned.length === 1) bullets.push(`1 banned card: ${banned[0]}`)
    else if (banned.length > 1) bullets.push(`${banned.length} banned cards: ${banned.join(', ')}`)
    for (const i of issues) {
      if (i.reason === 'color_identity') bullets.push(`${i.cardName} is outside the colour identity`)
      else if (i.reason === 'over_limit') bullets.push(`${i.cardName}: more than one copy`)
    }
    const shown = bullets.slice(0, MAX_BULLETS)
    if (bullets.length > MAX_BULLETS) shown.push(`and ${bullets.length - MAX_BULLETS} more`)
    return { status: 'not_legal', bullets: shown, subline: null }
  }
  if (deckSize != null && totalCards !== deckSize) {
    return { status: 'unverified', bullets: [], subline: `Nothing found illegal. ${totalCards} of ${deckSize} cards.` }
  }
  const checked = 'singleton · colour identity · no banned cards'
  return { status: 'legal', bullets: [], subline: deckSize != null ? `${deckSize} cards · ${checked}` : checked }
}

/** "Playable needs a legal list first." shows only when it explains the status: Not legal and not Playable. */
export function showsPlayableNeedsLegal(legality: LegalityViewStatus | null, state: BuildStatusView['state'] | null): boolean {
  return legality === 'not_legal' && state != null && state !== 'playable'
}
