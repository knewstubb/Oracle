/**
 * Commander targets: the typical number of ramp, draw, removal, wipes (and lands) for one commander.
 * Contract: docs/oracle/contracts/deck-health-phase2.md, sections 1.3 to 1.8.
 *
 * Source order (owner decision Q1): (A) EDHREC average deck, else (B) EDHREC estimate (scaled top cards),
 * else (C) the general guide. Pure: no database, no network. The server side (cache, refresh) is
 * `commander-targets-server.ts`.
 *
 * Never a made-up number: a role number exists only when the status is 'ok'; otherwise the general guide is used
 * and labelled as the guide.
 */

import { CLASSIFIER_VERSION, ROLE_ORDER, hasClassifiableText, isLandTypeLine, rolesForCard, type Role } from './card-roles'
import { isBasicLand } from './basic-lands'
import type { EdhrecAverageDeck, EdhrecCommanderPage, EdhrecTypeCounts } from './edhrec-client'

// ---------------------------------------------------------------------------
// Shapes (contract 1.3, 1.6)
// ---------------------------------------------------------------------------

export interface TypeCount {
  type: 'creature' | 'instant' | 'sorcery' | 'artifact' | 'enchantment' | 'planeswalker' | 'land'
  average: number
  /** How many of this type the deck has (main deck, by quantity). Filled by the deck health builder. */
  have?: number
}

export type TargetSource = 'edhrec_average' | 'edhrec_estimate' | 'general_guide'

export interface RoleTarget {
  role: Role
  typical: number
  cardsInRole: number
}

export interface CommanderTargets {
  status: 'ok' | 'thin' | 'not_found'
  source: TargetSource
  sourceLabel: string
  /** Empty when status is not 'ok'. */
  roles: RoleTarget[]
  /**
   * Typical land count for this commander (owner, 2026-11-11: landfall commanders run more, ramp commanders fewer).
   * Average deck: lands in the average deck. Estimate: EDHREC's average land count. Null when status is not 'ok'.
   */
  landsTypical: number | null
  cardsUsed: number
  deckSample: number | null
  coverage: number | null
  typeCounts: TypeCount[]
  /** "EDHREC averages, 46,230 decks" | "Averages from 4 stored builds" | "No stored builds yet". */
  typeCountsLabel: string
  fetchedAt: string | null
  stale: boolean
}

/** One row of public.ref_commander_role_targets (contract 1.7). */
export interface TargetsRow {
  edhrec_slug: string
  commander_name: string
  status: 'ok' | 'thin' | 'not_found'
  source: 'edhrec_average' | 'edhrec_estimate'
  roles: Array<RoleTarget & { rawSum?: number }>
  cards: Array<{ name: string; roles: Role[]; inclusion: number | null; quantity?: number }>
  cards_used: number
  deck_sample: number | null
  coverage: number | null
  lands_avg: number | null
  type_counts: TypeCount[]
  classifier_version: number
  fetched_at: string
}

/** Card text for one name; undefined = no row in the card reference table. */
export interface RefText {
  typeLine: string | null
  oracleText: string | null
}
export type RefLookup = (name: string) => RefText | undefined

// ---------------------------------------------------------------------------
// Thresholds. Starting values from the contract, checked against the 15-commander sample
// (docs/oracle/reports/2026-11-11-developer-deck-health-s2.md).
// ---------------------------------------------------------------------------

/** A5: fewest decks behind an average deck (and behind an estimate, 1.5). */
export const MIN_DECK_SAMPLE = 50
/** A5: most non-land cards (by quantity) allowed without card text. */
export const AVERAGE_MAX_MISSING_SHARE = 0.1
/** A5: the average deck's total including the commander(s). */
export const AVERAGE_TOTALS: readonly number[] = [99, 100]
/** 1.5: fewest classified non-land cards for an estimate. */
export const ESTIMATE_MIN_CLASSIFIED = 60
/** 1.5: smallest share of the non-land slots the listed cards cover (scale at most 2.5). */
export const ESTIMATE_MIN_COVERAGE = 0.4

/** 1.8: how long a saved row is trusted. */
export const OK_TTL_DAYS = 14
export const THIN_TTL_DAYS = 7

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const frontName = (n: string) => n.split(' // ')[0].trim().toLowerCase()

function emptyCounts(): Record<Role, number> {
  return { ramp: 0, draw: 0, removal: 0, wipes: 0 }
}

/** Is this card a land? Card text decides (front face); with no text, the file's own group or a basic land name. */
function isLand(name: string, ref: RefText | undefined, group?: string): boolean {
  if (ref?.typeLine) return isLandTypeLine(ref.typeLine)
  if (isBasicLand(name)) return true
  return !!group && /^lands?$/i.test(group.trim())
}

const TYPE_ORDER: readonly TypeCount['type'][] = ['creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'land']

/** EDHREC's per-type integers as type counts (battle left out; it is not in the contract's list). */
export function typeCountsFromEdhrec(t: EdhrecTypeCounts): TypeCount[] {
  return TYPE_ORDER.filter((k) => typeof t[k] === 'number').map((k) => ({ type: k, average: t[k] as number }))
}

/** "46,230" */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

// ---------------------------------------------------------------------------
// (A) Average deck
// ---------------------------------------------------------------------------

export interface AverageDerivation {
  qualifies: boolean
  /** Why it did not qualify (empty when it does). */
  reasons: string[]
  /** Total including the commander(s), quantities summed, lands and basics counted. */
  total: number
  landCount: number
  /** Basic lands EDHREC counts but left out of the list (added back into `landCount` and `total`). */
  unlistedBasics: number
  nonLandCount: number
  /** Non-land cards (by quantity) with no card text. */
  missing: number
  deckSample: number | null
  roles: RoleTarget[]
  cards: TargetsRow['cards']
  typeCounts: TypeCount[]
}

/** A2 to A5: count roles straight from the average deck. No scaling. */
export function deriveFromAverageDeck(deck: EdhrecAverageDeck, ref: RefLookup): AverageDerivation {
  const commanders = new Set(deck.commanders.map(frontName))
  const counts = emptyCounts()
  const cards: TargetsRow['cards'] = []
  let landCount = 0
  let nonLand = 0
  let missing = 0
  let listedCommanders = 0

  for (const c of deck.cards) {
    const q = c.quantity > 0 ? c.quantity : 1
    if (commanders.has(frontName(c.name))) {
      listedCommanders += 1
      continue
    }
    const r = ref(c.name)
    if (isLand(c.name, r, c.group)) {
      landCount += q
      continue
    }
    nonLand += q
    if (!r || !hasClassifiableText(r)) {
      missing += q
      continue
    }
    const roles = rolesForCard({ name: c.name, typeLine: r.typeLine, oracleText: r.oracleText })
    for (const role of roles) counts[role] += q
    cards.push({ name: c.name, roles, inclusion: null, quantity: q })
  }

  // The commander is part of the 100 whether or not the file lists it among the cards.
  // Some average decks leave basic lands out of the list but keep them in EDHREC's own land count (seen on a
  // four-colour partner pair: 27 lands listed, 30 counted, 3 basics). Those missing basics are added back, but only
  // when EDHREC's basic count fully explains the gap; anything else stays a short list and fails A5.
  const listedLands = landCount
  const edhrecLands = deck.typeCounts.land
  const gap = typeof edhrecLands === 'number' ? edhrecLands - listedLands : 0
  const unlistedBasics = gap > 0 && deck.basicCount !== null && gap <= deck.basicCount ? gap : 0
  landCount += unlistedBasics
  const total = landCount + nonLand + Math.max(commanders.size, listedCommanders)
  const reasons: string[] = []
  if (!AVERAGE_TOTALS.includes(total)) reasons.push(`total ${total}, not 99 or 100`)
  if (deck.numDecks === null || deck.numDecks < MIN_DECK_SAMPLE) reasons.push(`deck sample ${deck.numDecks ?? 'unknown'} under ${MIN_DECK_SAMPLE}`)
  if (nonLand === 0 || missing / nonLand > AVERAGE_MAX_MISSING_SHARE) reasons.push(`${missing} of ${nonLand} non-land cards have no card text`)

  return {
    qualifies: reasons.length === 0,
    reasons,
    total,
    landCount,
    unlistedBasics,
    nonLandCount: nonLand,
    missing,
    deckSample: deck.numDecks,
    roles: ROLE_ORDER.map((role) => ({ role, typical: counts[role], cardsInRole: counts[role] })),
    cards,
    typeCounts: typeCountsFromEdhrec(deck.typeCounts),
  }
}

// ---------------------------------------------------------------------------
// (B) Estimate (scaled top cards)
// ---------------------------------------------------------------------------

export interface EstimateDerivation {
  status: 'ok' | 'thin'
  reasons: string[]
  classified: number
  missing: number
  listedSum: number
  rawSums: Record<Role, number>
  landsAvg: number | null
  nonLandSlots: number | null
  scale: number | null
  coverage: number | null
  deckSample: number | null
  roles: Array<RoleTarget & { rawSum: number }>
  cards: TargetsRow['cards']
  typeCounts: TypeCount[]
}

/**
 * Steps 3 to 7 and the thin rule 1.5. Cards without card text are skipped (counted as missing), and only classified
 * cards make up `listedSum`, so the scale makes up for them rather than diluting every role.
 * `fallbackLandsAvg` is the stored builds' mean land count, used only when EDHREC gives none.
 */
export function deriveEstimate(page: EdhrecCommanderPage, ref: RefLookup, fallbackLandsAvg: number | null = null): EstimateDerivation {
  const raw = emptyCounts()
  const cardsInRole = emptyCounts()
  const cards: TargetsRow['cards'] = []
  let listedSum = 0
  let classified = 0
  let missing = 0

  for (const c of page.cards) {
    const r = ref(c.name)
    if (isLand(c.name, r)) continue
    if (!r || !hasClassifiableText(r)) {
      missing += 1
      continue
    }
    classified += 1
    listedSum += c.inclusion
    const roles = rolesForCard({ name: c.name, typeLine: r.typeLine, oracleText: r.oracleText })
    for (const role of roles) {
      raw[role] += c.inclusion
      cardsInRole[role] += 1
    }
    cards.push({ name: c.name, roles, inclusion: Math.round(c.inclusion * 1000) / 1000 })
  }

  const landsAvg = typeof page.typeCounts.land === 'number' ? page.typeCounts.land : fallbackLandsAvg
  const nonLandSlots = landsAvg !== null ? 99 - landsAvg : null
  const scale = nonLandSlots !== null && listedSum > 0 ? nonLandSlots / listedSum : null
  const coverage = nonLandSlots !== null && nonLandSlots > 0 ? listedSum / nonLandSlots : null

  const reasons: string[] = []
  if (page.numDecks === null || page.numDecks < MIN_DECK_SAMPLE) reasons.push(`deck sample ${page.numDecks ?? 'unknown'} under ${MIN_DECK_SAMPLE}`)
  if (classified < ESTIMATE_MIN_CLASSIFIED) reasons.push(`${classified} classified cards, under ${ESTIMATE_MIN_CLASSIFIED}`)
  if (coverage === null || coverage < ESTIMATE_MIN_COVERAGE) reasons.push(`coverage ${coverage === null ? 'unknown' : coverage.toFixed(2)} under ${ESTIMATE_MIN_COVERAGE}`)

  return {
    status: reasons.length === 0 ? 'ok' : 'thin',
    reasons,
    classified,
    missing,
    listedSum,
    rawSums: raw,
    landsAvg,
    nonLandSlots,
    scale,
    coverage,
    deckSample: page.numDecks,
    roles: ROLE_ORDER.map((role) => ({
      role,
      typical: scale === null ? 0 : Math.round(raw[role] * scale),
      cardsInRole: cardsInRole[role],
      rawSum: Math.round(raw[role] * 1000) / 1000,
    })),
    cards,
    typeCounts: typeCountsFromEdhrec(page.typeCounts),
  }
}

// ---------------------------------------------------------------------------
// Rows and the CommanderTargets answer
// ---------------------------------------------------------------------------

export function rowFromAverage(slug: string, commanderName: string, d: AverageDerivation, now: Date): TargetsRow {
  return {
    edhrec_slug: slug,
    commander_name: commanderName,
    status: 'ok',
    source: 'edhrec_average',
    roles: d.roles,
    cards: d.cards,
    cards_used: d.nonLandCount - d.missing,
    deck_sample: d.deckSample,
    coverage: null,
    lands_avg: d.landCount,
    type_counts: d.typeCounts,
    classifier_version: CLASSIFIER_VERSION,
    fetched_at: now.toISOString(),
  }
}

export function rowFromEstimate(slug: string, commanderName: string, d: EstimateDerivation, now: Date): TargetsRow {
  const ok = d.status === 'ok'
  return {
    edhrec_slug: slug,
    commander_name: commanderName,
    status: d.status,
    source: 'edhrec_estimate',
    // Never store a role number for thin data.
    roles: ok ? d.roles : [],
    cards: d.cards,
    cards_used: d.classified,
    deck_sample: d.deckSample,
    coverage: d.coverage === null ? null : Math.round(d.coverage * 1000) / 1000,
    lands_avg: ok ? d.landsAvg : null,
    type_counts: d.typeCounts,
    classifier_version: CLASSIFIER_VERSION,
    fetched_at: now.toISOString(),
  }
}

/** Neither EDHREC file exists for this slug. Type counts are left for the stored builds. */
export function rowNotFound(slug: string, commanderName: string, now: Date, typeCounts: TypeCount[] = []): TargetsRow {
  return {
    edhrec_slug: slug,
    commander_name: commanderName,
    status: 'not_found',
    source: 'edhrec_estimate',
    roles: [],
    cards: [],
    cards_used: 0,
    deck_sample: null,
    coverage: null,
    lands_avg: null,
    type_counts: typeCounts,
    classifier_version: CLASSIFIER_VERSION,
    fetched_at: now.toISOString(),
  }
}

/** 1.8: a saved row is used without refreshing while it is young enough and made by the current role rules. */
export function isRowFresh(row: Pick<TargetsRow, 'status' | 'fetched_at' | 'classifier_version'>, now: Date): boolean {
  if (row.classifier_version !== CLASSIFIER_VERSION) return false
  const ttlDays = row.status === 'ok' ? OK_TTL_DAYS : THIN_TTL_DAYS
  const age = now.getTime() - new Date(row.fetched_at).getTime()
  return Number.isFinite(age) && age <= ttlDays * 24 * 60 * 60 * 1000
}

export const STALE_SUFFIX = ', may be out of date'
export const GUIDE_LABEL = 'General guide'
export const GUIDE_UNREACHABLE_LABEL = "General guide (couldn't reach EDHREC)"

export function sourceLabelFor(source: TargetSource, deckSample: number | null, stale: boolean): string {
  if (source === 'general_guide') return GUIDE_LABEL
  const lead = source === 'edhrec_average' ? 'EDHREC average deck' : 'EDHREC estimate'
  const base = deckSample !== null ? `${lead}, ${formatCount(deckSample)} decks` : lead
  return stale ? `${base}${STALE_SUFFIX}` : base
}

export interface TypeCountsWithLabel {
  typeCounts: TypeCount[]
  label: string
}

export const NO_BUILDS_LABEL = 'No stored builds yet'

/** The general guide, used when there is no commander data (thin, not found, no commander, or EDHREC unreachable with nothing saved). */
export function guideTargets(label: string, types: TypeCountsWithLabel = { typeCounts: [], label: NO_BUILDS_LABEL }, fetchedAt: string | null = null): CommanderTargets {
  return {
    status: 'thin',
    source: 'general_guide',
    sourceLabel: label,
    roles: [],
    landsTypical: null,
    cardsUsed: 0,
    deckSample: null,
    coverage: null,
    typeCounts: types.typeCounts,
    typeCountsLabel: types.label,
    fetchedAt,
    stale: false,
  }
}

/**
 * A saved (or just-made) row as the answer. Thin and not-found rows give the general guide, never EDHREC role numbers.
 * `stale` = served after a failed refresh ("may be out of date"). `fallbackTypes` is the stored builds' type counts,
 * used when the row has none.
 */
export function targetsFromRow(row: TargetsRow, stale: boolean, fallbackTypes?: TypeCountsWithLabel): CommanderTargets {
  const rowTypes: TypeCountsWithLabel | undefined =
    row.type_counts.length > 0
      ? { typeCounts: row.type_counts, label: row.deck_sample !== null ? `EDHREC averages, ${formatCount(row.deck_sample)} decks` : 'EDHREC averages' }
      : undefined
  const types = rowTypes ?? fallbackTypes ?? { typeCounts: [], label: NO_BUILDS_LABEL }

  if (row.status !== 'ok' || row.roles.length === 0) {
    const t = guideTargets(GUIDE_LABEL, types, row.fetched_at)
    return { ...t, status: row.status === 'not_found' ? 'not_found' : 'thin', cardsUsed: row.cards_used, deckSample: row.deck_sample, coverage: row.coverage }
  }

  return {
    status: 'ok',
    source: row.source,
    sourceLabel: sourceLabelFor(row.source, row.deck_sample, stale),
    roles: ROLE_ORDER.map((role) => {
      const r = row.roles.find((x) => x.role === role)
      return { role, typical: r ? Math.max(0, Math.round(r.typical)) : 0, cardsInRole: r?.cardsInRole ?? 0 }
    }),
    landsTypical: row.lands_avg === null ? null : Math.round(row.lands_avg),
    cardsUsed: row.cards_used,
    deckSample: row.deck_sample,
    coverage: row.coverage,
    typeCounts: types.typeCounts,
    typeCountsLabel: types.label,
    fetchedAt: row.fetched_at,
    stale,
  }
}
