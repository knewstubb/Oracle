/**
 * Deck health: the six rows and their verdicts (D-061; audit docs/oracle/reports/2026-11-20-architect-categories-health-audit.md).
 *
 * Six rows, always present, in a fixed order: Lands, Ramp, Card Advantage, Targeted Removal, Board Wipes / Mass Disruption
 * and Game Plan & Win Conditions. The first five are counted from today's card-reading classifier (`rolesForCard`,
 * `isLandTypeLine`) and compared with the Command Zone default ranges (Light below the minimum, Ok inside, Heavy above
 * the maximum). Game Plan is the remainder: every main-deck nonland card not counted in another of the five, with no range
 * and no verdict. The EDHREC average is only a reference figure. Nothing is stored (HC-01); a later slice reads stored categories.
 * All copy is composed here, in one place, so the rail, the panel and Claude's health read agree.
 * Pure: no database, no network. The EDHREC numbers are passed in (see commander-targets-server.ts).
 */
import { ROLE_ORDER, rolesForCard, isLandTypeLine, hasClassifiableText, type Role } from './card-roles'
import { isBasicLandCard } from './basic-lands'
import { allCardTypes, frontFace, hasCardType, parseTypeLine } from './type-line'
import { guideTargets, type CommanderTargets, type TypeCount } from './commander-targets'
export type { TypeCount } from './commander-targets'
/** The four card roles plus Lands, which is counted from the front-face type line, not from card text. */
export type HealthRoleKey = Role | 'lands'
export const HEALTH_ROLE_ORDER: readonly HealthRoleKey[] = [...ROLE_ORDER, 'lands']
/** The six rows, identified by a fixed kind and never by their display name (D-061). */
export type HealthKind = 'lands' | 'ramp' | 'card_advantage' | 'targeted_removal' | 'board_wipes' | 'game_plan'
export const HEALTH_KIND_ORDER: readonly HealthKind[] = ['lands', 'ramp', 'card_advantage', 'targeted_removal', 'board_wipes', 'game_plan']
/** The five rows that have a range and a verdict. */
export type RangedKind = Exclude<HealthKind, 'game_plan'>
export const RANGED_KINDS: readonly RangedKind[] = ['lands', 'ramp', 'card_advantage', 'targeted_removal', 'board_wipes']
export const KIND_LABELS: Record<HealthKind, string> = {
  lands: 'Lands',
  ramp: 'Ramp',
  card_advantage: 'Card Advantage',
  targeted_removal: 'Targeted Removal',
  board_wipes: 'Board Wipes / Mass Disruption',
  game_plan: 'Game Plan & Win Conditions',
}
/** Which classifier role (or Lands) a ranged kind is counted from. Game Plan has none: it is the remainder. */
export const KIND_ROLE: Record<HealthKind, HealthRoleKey | null> = {
  lands: 'lands',
  ramp: 'ramp',
  card_advantage: 'draw',
  targeted_removal: 'removal',
  board_wipes: 'wipes',
  game_plan: null,
}
export const ROLE_KIND: Record<HealthRoleKey, RangedKind> = {
  lands: 'lands',
  ramp: 'ramp',
  draw: 'card_advantage',
  removal: 'targeted_removal',
  wipes: 'board_wipes',
}
export interface HealthRange {
  min: number
  max: number
}
/** The Command Zone template ranges (owner, 2026-11-20, D-061). System defaults: they give a verdict at once. */
export const DEFAULT_RANGES: Record<RangedKind, HealthRange> = {
  lands: { min: 35, max: 38 },
  ramp: { min: 10, max: 12 },
  card_advantage: { min: 10, max: 12 },
  targeted_removal: { min: 10, max: 12 },
  board_wipes: { min: 3, max: 6 },
}
/** The template's "about 25 to 30" for Game Plan. A quiet guide only: no verdict is ever drawn from it. */
export const GAME_PLAN_GUIDE: HealthRange = { min: 25, max: 30 }
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Verdict = 'light' | 'ok' | 'heavy'

export interface InDeckCard {
  name: string
  quantity: number
}

/** One of the six rows. Game Plan has no range and no verdict (`range` and `verdict` are null). */
export interface HealthRow {
  kind: HealthKind
  /** The classifier role behind this row (for the "cards that fill it" list), or null for Game Plan. */
  role: HealthRoleKey | null
  label: string
  /** Cards counted in this row, by quantity. */
  have: number
  /** The range this row is checked against. Null for Game Plan. */
  range: HealthRange | null
  /** Where the range comes from. HC-01 has only the template defaults. */
  rangeSource: 'default' | null
  verdict: Verdict | null
  /** How far outside the range: negative = below the minimum, positive = above the maximum, 0 = inside (or no range). */
  offBy: number
  /** "Range 10 to 12", plus " · 6 above" or " · 4 below" when off range. Game Plan: "No range. Everything not counted above." */
  summary: string
  /** One plain sentence about this row. */
  text: string
  /** Double-faced cards that can be played as a land. Lands row only; never part of `have`. */
  doubleFaced?: number
  /** Game Plan only: the template's "about 25 to 30", a quiet guide with no verdict. */
  guide?: HealthRange
  /** The average EDHREC deck for this commander, for reference only. Null when there is none. */
  reference: number | null
  /** The cards counted in this row (main deck, by name). */
  cards: InDeckCard[]
}

export interface ManaSources {
  total: number
  lands: number
  doubleFaced: number
  ramp: number
}

export interface DeckHealthResponse {
  /** The header line: "1 of 5 in range" / "All 5 in range". Counts the five ranged rows only. */
  verdict: { headline: string; inRange: number; ranged: number }
  /** Always six rows, in HEALTH_KIND_ORDER, even at 0. */
  rows: HealthRow[]
  checkState: 'full' | 'partial'
  /** Main-deck nonland cards with no card text, so Oracle could not place them. They are counted in Game Plan. */
  unclassifiedCount: number
  /** Different main-deck cards, by quantity. The rows are never summed to get this. */
  mainDeckCount: number
  /** What the six rows add up to (more than mainDeckCount when a card counts in two rows). */
  rowsTotal: number
  /** Cards (by quantity) that count in more than one row, for example a card that is both removal and a wipe. */
  multiRowCards: number
  manaSources: ManaSources
  /** Notes under the rows. Null when they do not apply. */
  notes: { manaSources: string; uncategorised: string | null; overlap: string | null }
  /** EDHREC's average for this commander, for reference only. Used for no verdict. */
  reference: { available: boolean; label: string }
  typeCounts: TypeCount[]
  typeCountsLabel: string
  computedAt: string
}

// ---------------------------------------------------------------------------
// Old guide numbers (kept until HC-08 removes them; nothing in HC-01 reads them)
// ---------------------------------------------------------------------------

export type RoleState = 'ok' | 'light'

/** @deprecated Not read by health any more. Removed in HC-08 (audit section l). */
export const GENERAL_GUIDE: Record<HealthRoleKey, number> = { ramp: 10, draw: 10, removal: 6, wipes: 2, lands: 36 }

export const ROLE_LABELS: Record<HealthRoleKey, string> = {
  ramp: KIND_LABELS.ramp,
  draw: KIND_LABELS.card_advantage,
  removal: KIND_LABELS.targeted_removal,
  wipes: KIND_LABELS.board_wipes,
  lands: KIND_LABELS.lands,
}

/** More than this share of main-deck cards without card text means the check is only partial. */
export const UNCLASSIFIED_PARTIAL_SHARE = 0.1

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** @deprecated The old "2 short" rule. Not read by health any more. Removed in HC-08 (audit section l). */
export function roleState(have: number, typical: number): RoleState {
  if (typical < 2) return 'ok'
  return have <= typical - 2 ? 'light' : 'ok'
}

/** Light = below the minimum, Heavy = above the maximum, Ok = inside, ends included (D-061). */
export function verdictFor(have: number, range: HealthRange): Verdict {
  if (have < range.min) return 'light'
  if (have > range.max) return 'heavy'
  return 'ok'
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

function rangeWords(range: HealthRange): string {
  return `${range.min} to ${range.max}`
}

/** "Range 10 to 12 · 6 above". */
export function rangeSummary(range: HealthRange, offBy: number): string {
  const base = `Range ${rangeWords(range)}`
  if (offBy > 0) return `${base} · ${offBy} above`
  if (offBy < 0) return `${base} · ${-offBy} below`
  return base
}

/** One sentence per ranged row: "You have 18 cards, 6 above the maximum of 12." */
export function rowSentence(label: string, have: number, range: HealthRange, verdict: Verdict): string {
  const cards = `${have} ${plural(have, 'card', 'cards')}`
  if (verdict === 'heavy') return `You have ${cards}, ${have - range.max} above the maximum of ${range.max}.`
  if (verdict === 'light') return `You have ${cards}, ${range.min - have} below the minimum of ${range.min}.`
  return `You have ${cards}, inside the range ${rangeWords(range)}.`
}

/** "Card Advantage 4 below, Ramp 6 above." The rows outside their range, or empty when every ranged row is inside. */
export function offRangeSubline(health: Pick<DeckHealthResponse, 'rows'>): string {
  const parts = health.rows.filter((r) => r.verdict === 'light' || r.verdict === 'heavy').map((r) => `${r.label} ${Math.abs(r.offBy)} ${r.offBy > 0 ? 'above' : 'below'}`)
  return parts.length > 0 ? `${parts.join(', ')}.` : ''
}

/** The header line over the six rows. */
export function headerLine(inRange: number, ranged: number): string {
  return inRange === ranged ? `All ${ranged} in range` : `${inRange} of ${ranged} in range`
}

// ---------------------------------------------------------------------------
// Counting a deck
// ---------------------------------------------------------------------------

/** One deck row joined with its card text. Text fields are null when the card has no row in the card reference table. */
export interface HealthDeckCard {
  cardName: string
  quantity: number
  typeLine: string | null
  oracleText: string | null
  /** On the main list: not maybeboard, not sideboard or companion, and not a commander. */
  inMainDeck: boolean
}

export interface CountResult {
  have: Record<HealthRoleKey, number>
  /** Main-deck cards (by quantity, lands excluded) that have no card text, so were not checked. */
  unclassifiedCount: number
  /** All main-deck cards by quantity, lands included. */
  mainDeckCount: number
}

/** What one deck row counts as. One place, so the pill counts and the "cards already in this deck" list cannot disagree. */
export type CardKind = { kind: 'skip' } | { kind: 'land'; qty: number } | { kind: 'unclassified'; qty: number } | { kind: 'roles'; qty: number; roles: Role[] }

export function classifyDeckCard(c: HealthDeckCard): CardKind {
  if (!c.inMainDeck) return { kind: 'skip' }
  const qty = c.quantity > 0 ? c.quantity : 1
  // A land is decided by the front-face type line. With no type line at all, a basic land is still a land by name.
  if (c.typeLine ? isLandTypeLine(c.typeLine) : isBasicLandCard({ name: c.cardName, typeLine: c.typeLine })) return { kind: 'land', qty }
  if (!hasClassifiableText(c)) return { kind: 'unclassified', qty }
  return { kind: 'roles', qty, roles: rolesForCard({ name: c.cardName, typeLine: c.typeLine, oracleText: c.oracleText }) }
}

/**
 * A double-faced card whose front is a spell and whose other face is a land, so it can be played as a land (RQ-13).
 * Decided from the type line ("Sorcery // Land"). A transforming card whose back is a land (its front text says
 * "transform") is not one, because it cannot be played as a land from hand. Approximate: `ref_cards` has no layout column.
 */
export function isDoubleFacedLandCard(c: Pick<HealthDeckCard, 'typeLine' | 'oracleText'>): boolean {
  if (!c.typeLine || !c.typeLine.includes(' // ')) return false
  const parsed = parseTypeLine(c.typeLine)
  if (hasCardType(parsed, 'Land', 'front') || !hasCardType(parsed, 'Land', 'any')) return false
  return !/\btransform\b/i.test(c.oracleText ?? '')
}

/** Does this deck card sit in Game Plan: a main-deck nonland card that no other row counted (including cards with no card text). */
function isGamePlanCard(k: CardKind): k is Extract<CardKind, { kind: 'unclassified' | 'roles' }> {
  return k.kind === 'unclassified' || (k.kind === 'roles' && k.roles.length === 0)
}

/** The deck's own cards in one row (main deck only), by name with quantity. Their quantities add up to `have` for that row. */
export function cardsInKind(cards: HealthDeckCard[], kind: HealthKind): InDeckCard[] {
  const role = KIND_ROLE[kind]
  const out: InDeckCard[] = []
  for (const c of cards) {
    const k = classifyDeckCard(c)
    if (kind === 'game_plan') {
      if (isGamePlanCard(k)) out.push({ name: c.cardName, quantity: k.qty })
    } else if (k.kind === 'land' && role === 'lands') out.push({ name: c.cardName, quantity: k.qty })
    else if (k.kind === 'roles' && role !== 'lands' && role !== null && k.roles.includes(role)) out.push({ name: c.cardName, quantity: k.qty })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** The deck's own cards in one classifier role (main deck only). Used by the "cards that fill it" list. */
export function cardsInRole(cards: HealthDeckCard[], role: HealthRoleKey): InDeckCard[] {
  return cardsInKind(cards, ROLE_KIND[role])
}

export function countRoles(cards: HealthDeckCard[]): CountResult {
  const have: Record<HealthRoleKey, number> = { ramp: 0, draw: 0, removal: 0, wipes: 0, lands: 0 }
  let unclassified = 0
  let mainDeck = 0
  for (const c of cards) {
    const k = classifyDeckCard(c)
    if (k.kind === 'skip') continue
    mainDeck += k.qty
    if (k.kind === 'land') have.lands += k.qty
    else if (k.kind === 'unclassified') unclassified += k.qty
    else for (const role of k.roles) have[role] += k.qty
  }
  return { have, unclassifiedCount: unclassified, mainDeckCount: mainDeck }
}

/** Type counts for the deck itself (front-face type line, main deck only), to show "You have X" beside the averages. */
export function countDeckTypes(cards: HealthDeckCard[]): Record<TypeCount['type'], number> {
  const out: Record<TypeCount['type'], number> = { creature: 0, instant: 0, sorcery: 0, artifact: 0, enchantment: 0, planeswalker: 0, land: 0 }
  for (const c of cards) {
    if (!c.inMainDeck) continue
    const qty = c.quantity > 0 ? c.quantity : 1
    const line = c.typeLine ?? (isBasicLandCard({ name: c.cardName }) ? 'Basic Land' : '')
    // Front face only; a card adds to every card type it has (Artifact Creature counts as both),
    // except that Land takes priority: an Artifact Land counts as a land only, like the deck page's Group: Type.
    const all = allCardTypes({ faces: [frontFace(parseTypeLine(line))] }).map((t) => t.toLowerCase())
    const types = all.includes('land') ? ['land'] : all
    for (const t of Object.keys(out) as Array<TypeCount['type']>) if (types.includes(t)) out[t] += qty
  }
  return out
}

/** Said when there is no EDHREC average to show: nothing saved for this commander, or EDHREC could not be reached. */
export const NO_REFERENCE_LABEL = 'No EDHREC average for this commander'
export const REFERENCE_UNREACHABLE_LABEL = 'No EDHREC average just now (EDHREC could not be reached)'
function referenceMissingLabel(sourceLabel: string): string {
  return /couldn't reach|took too long/i.test(sourceLabel) ? REFERENCE_UNREACHABLE_LABEL : NO_REFERENCE_LABEL
}

/** The EDHREC average for one row, or null when none is usable. Reference only. */
function referenceFor(kind: HealthKind, targets: CommanderTargets, available: boolean): number | null {
  if (!available) return null
  const role = KIND_ROLE[kind]
  if (role === null) return null
  if (role === 'lands') return targets.landsTypical
  return targets.roles.find((r) => r.role === role)?.typical ?? null
}

/** Notes under the rows. The three that depend on the deck; the fixed "Ranges are the Command Zone template" line is drawn by the screen. */
export function composeNotes(input: { sources: ManaSources; unclassified: number; mainDeckCount: number; rowsTotal: number; multiRowCards: number }): DeckHealthResponse['notes'] {
  const { sources, unclassified, mainDeckCount, rowsTotal, multiRowCards } = input
  const parts = [`${sources.lands} ${plural(sources.lands, 'land', 'lands')}`]
  if (sources.doubleFaced > 0) parts.push(`${sources.doubleFaced} double-faced`)
  parts.push(`${sources.ramp} ramp ${plural(sources.ramp, 'card', 'cards')}`)
  return {
    manaSources: `Mana sources ${sources.total}: ${parts.join(', ')}. An estimate.`,
    uncategorised:
      unclassified > 0
        ? `${unclassified} ${plural(unclassified, 'card has', 'cards have')} no card text yet, so Oracle could not place ${plural(unclassified, 'it', 'them')}. ${plural(unclassified, 'It is', 'They are')} counted in ${KIND_LABELS.game_plan}.`
        : null,
    overlap:
      rowsTotal > mainDeckCount
        ? `${mainDeckCount} cards in the list. ${multiRowCards} ${plural(multiRowCards, 'card counts', 'cards count')} in more than one row, so the rows add to ${rowsTotal}.`
        : null,
  }
}

/**
 * Build the whole response for one deck from its counted cards. The EDHREC numbers (when usable) are a reference figure
 * only: no verdict reads them.
 */
export function buildDeckHealth(cards: HealthDeckCard[], targets: CommanderTargets = guideTargets('General guide'), now: Date = new Date()): DeckHealthResponse {
  const { have, unclassifiedCount, mainDeckCount } = countRoles(cards)
  const referenceAvailable = targets.status === 'ok' && targets.source !== 'general_guide' && targets.roles.length > 0

  // Game Plan: every main-deck nonland card that no other row counted, plus cards with no card text (they are named in a note).
  let gamePlan = 0
  let doubleFaced = 0
  let rampOnlyNotDoubleFaced = 0
  let multiRowCards = 0
  const gamePlanCards: InDeckCard[] = []
  for (const c of cards) {
    const k = classifyDeckCard(c)
    if (k.kind === 'skip') continue
    if (isGamePlanCard(k)) {
      gamePlan += k.qty
      gamePlanCards.push({ name: c.cardName, quantity: k.qty })
    }
    // One land-capable double-faced card is one source, shown beside the land count and never added to it.
    const dfc = k.kind !== 'land' && isDoubleFacedLandCard(c)
    if (dfc) doubleFaced += k.qty
    if (k.kind === 'roles' && k.roles.includes('ramp') && !dfc) rampOnlyNotDoubleFaced += k.qty
    if (k.kind === 'roles' && k.roles.length > 1) multiRowCards += k.qty
  }
  gamePlanCards.sort((a, b) => a.name.localeCompare(b.name))

  const rows: HealthRow[] = HEALTH_KIND_ORDER.map((kind): HealthRow => {
    const label = KIND_LABELS[kind]
    const reference = referenceFor(kind, targets, referenceAvailable)
    if (kind === 'game_plan') {
      return {
        kind,
        role: null,
        label,
        have: gamePlan,
        range: null,
        rangeSource: null,
        verdict: null,
        offBy: 0,
        summary: 'No range. Everything not counted above.',
        text: `${gamePlan} ${plural(gamePlan, 'card', 'cards')}: everything not counted in the rows above.`,
        guide: GAME_PLAN_GUIDE,
        reference,
        cards: gamePlanCards,
      }
    }
    const role = KIND_ROLE[kind] as HealthRoleKey
    const range = DEFAULT_RANGES[kind]
    const count = have[role]
    const verdict = verdictFor(count, range)
    const offBy = verdict === 'heavy' ? count - range.max : verdict === 'light' ? count - range.min : 0
    return {
      kind,
      role,
      label,
      have: count,
      range,
      rangeSource: 'default',
      verdict,
      offBy,
      summary: rangeSummary(range, offBy),
      text: rowSentence(label, count, range, verdict),
      ...(kind === 'lands' ? { doubleFaced } : {}),
      reference,
      cards: cardsInKind(cards, kind),
    }
  })

  const ranged = rows.filter((r) => r.verdict !== null)
  const inRange = ranged.filter((r) => r.verdict === 'ok').length
  const rowsTotal = rows.reduce((n, r) => n + r.have, 0)
  const sources: ManaSources = {
    lands: have.lands,
    doubleFaced,
    ramp: rampOnlyNotDoubleFaced,
    total: have.lands + doubleFaced + rampOnlyNotDoubleFaced,
  }
  const partial = mainDeckCount > 0 && unclassifiedCount / mainDeckCount > UNCLASSIFIED_PARTIAL_SHARE
  const deckTypes = countDeckTypes(cards)
  return {
    verdict: { headline: headerLine(inRange, ranged.length), inRange, ranged: ranged.length },
    rows,
    checkState: partial ? 'partial' : 'full',
    unclassifiedCount,
    mainDeckCount,
    rowsTotal,
    multiRowCards,
    manaSources: sources,
    notes: composeNotes({ sources, unclassified: unclassifiedCount, mainDeckCount, rowsTotal, multiRowCards }),
    reference: {
      available: referenceAvailable,
      label: referenceAvailable ? targets.sourceLabel : referenceMissingLabel(targets.sourceLabel),
    },
    typeCounts: targets.typeCounts.map((t) => ({ type: t.type, average: t.average, have: deckTypes[t.type] })),
    typeCountsLabel: targets.typeCountsLabel,
    computedAt: now.toISOString(),
  }
}
