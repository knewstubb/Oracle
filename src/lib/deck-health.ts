/**
 * Deck health: the verdict and its wording (contract: docs/oracle/contracts/deck-health-phase2.md, sections 2 and 4).
 *
 * Five rows (ramp, draw, removal, wipes, lands) checked against the commander's typical numbers from EDHREC
 * (average deck, else estimate), or the general guide when there is no usable commander data (slice S2).
 * All copy is composed here, in one place, so the strip, the panel and (later) chat agree.
 * Pure: no database, no network. The typical numbers are passed in (see commander-targets-server.ts).
 */

import { ROLE_ORDER, rolesForCard, isLandTypeLine, hasClassifiableText, type Role } from './card-roles'
import { isBasicLand } from './basic-lands'
import { guideTargets, type CommanderTargets, type TypeCount } from './commander-targets'

export type { TypeCount } from './commander-targets'

/** The four card roles plus Lands, which is counted from the front-face type line, not from card text. */
export type HealthRoleKey = Role | 'lands'
export const HEALTH_ROLE_ORDER: readonly HealthRoleKey[] = [...ROLE_ORDER, 'lands']

// ---------------------------------------------------------------------------
// Types (shapes from the contract, section 1.3 and 4)
// ---------------------------------------------------------------------------

export type RoleState = 'ok' | 'light'

export interface DeckHealthRole {
  role: HealthRoleKey
  label: string
  have: number
  typical: number
  targetSource: 'edhrec_average' | 'edhrec_estimate' | 'general_guide'
  state: RoleState
  text: string
}

export interface DeckHealthResponse {
  verdict: { headline: string; subline: string; usingGeneralGuide: boolean }
  strategy: { state: 'not_set'; text: string }
  /** "EDHREC average deck, 12,431 decks" | "EDHREC estimate, N decks" | "General guide" | "..., may be out of date" | "General guide (couldn't reach EDHREC)". */
  sourceLine: string
  checkState: 'full' | 'partial'
  unclassifiedCount: number
  roles: DeckHealthRole[]
  typeCounts: TypeCount[]
  typeCountsLabel: string
  computedAt: string
}

// ---------------------------------------------------------------------------
// The general guide (the old minimums of the four roles)
// ---------------------------------------------------------------------------

export const GENERAL_GUIDE: Record<HealthRoleKey, number> = { ramp: 10, draw: 10, removal: 6, wipes: 2, lands: 36 }

export const ROLE_LABELS: Record<HealthRoleKey, string> = { ramp: 'Ramp', draw: 'Draw', removal: 'Removal', wipes: 'Wipes', lands: 'Lands' }

/** More than this share of main-deck cards without card text means the check is only partial. */
export const UNCLASSIFIED_PARTIAL_SHARE = 0.1

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Light = 2 or more short of the typical number. 1 short, or any amount over, is fine. A typical under 2 is never Light. */
export function roleState(have: number, typical: number): RoleState {
  if (typical < 2) return 'ok'
  return have <= typical - 2 ? 'light' : 'ok'
}

function shortBy(r: Pick<DeckHealthRole, 'have' | 'typical'>): number {
  return Math.max(0, r.typical - r.have)
}

/** Lower-case role name for sentences ("removal", "wipes"). */
function lower(role: HealthRoleKey): string {
  return ROLE_LABELS[role].toLowerCase()
}

/** "Guide is 6; you have 2." (a rule of thumb, not an average, so the word "Average" is not used for the guide). */
export function roleText(have: number, typical: number, source: DeckHealthRole['targetSource']): string {
  // Typical 0 is not designed yet (contract section 4): shown as fine with this text. Flagged to the Designer.
  if (typical === 0) return 'Not usually played'
  const lead = source === 'general_guide' ? 'Guide' : 'Average'
  return `${lead} is ${typical}; you have ${have}.`
}

export interface ComposeInput {
  roles: Array<Pick<DeckHealthRole, 'role' | 'have' | 'typical' | 'state'>>
  usingGeneralGuide: boolean
}

/**
 * One function for every sentence the owner reads about the verdict.
 * Headline: "Well covered", or "Light on removal" / "Light on draw and removal" (two biggest gaps, ties in the fixed
 * order ramp, draw, removal, wipes), with " (general guide)" when the guide is used.
 * Sub-line: every light role with how many short, then the roles that are on track. Empty when nothing is light.
 */
export function composeHealthCopy(input: ComposeInput): { headline: string; subline: string; usingGeneralGuide: boolean } {
  const light = input.roles
    .filter((r) => r.state === 'light')
    .sort((a, b) => shortBy(b) - shortBy(a) || HEALTH_ROLE_ORDER.indexOf(a.role) - HEALTH_ROLE_ORDER.indexOf(b.role))

  if (light.length === 0) {
    return { headline: 'Well covered', subline: '', usingGeneralGuide: input.usingGeneralGuide }
  }

  const names = light.slice(0, 2).map((r) => lower(r.role))
  const suffix = input.usingGeneralGuide ? ' (general guide)' : ''
  const headline = `Light on ${names.join(' and ')}${suffix}`

  const parts = light.map((r, i) => `${i === 0 ? ROLE_LABELS[r.role] : lower(r.role)} ${shortBy(r)} short`)
  let subline = `${parts.join(', ')}.`
  const onTrack = input.roles.filter((r) => r.state === 'ok').sort((a, b) => HEALTH_ROLE_ORDER.indexOf(a.role) - HEALTH_ROLE_ORDER.indexOf(b.role))
  if (onTrack.length > 0) {
    subline += ` ${onTrack.map((r) => ROLE_LABELS[r.role]).join(' and ')} on track.`
  }
  return { headline, subline, usingGeneralGuide: input.usingGeneralGuide }
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
  if (c.typeLine ? isLandTypeLine(c.typeLine) : isBasicLand(c.cardName)) return { kind: 'land', qty }
  if (!hasClassifiableText(c)) return { kind: 'unclassified', qty }
  return { kind: 'roles', qty, roles: rolesForCard({ name: c.cardName, typeLine: c.typeLine, oracleText: c.oracleText }) }
}

export interface InDeckCard {
  name: string
  quantity: number
}

/** The deck's own cards in one role (main deck only), by name with quantity. Their quantities add up to `have` for that role. */
export function cardsInRole(cards: HealthDeckCard[], role: HealthRoleKey): InDeckCard[] {
  const out: InDeckCard[] = []
  for (const c of cards) {
    const k = classifyDeckCard(c)
    if (k.kind === 'land' && role === 'lands') out.push({ name: c.cardName, quantity: k.qty })
    else if (k.kind === 'roles' && role !== 'lands' && k.roles.includes(role)) out.push({ name: c.cardName, quantity: k.qty })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
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
    const front = (c.typeLine ?? (isBasicLand(c.cardName) ? 'Basic Land' : '')).split(' // ')[0].split(/\s+[—-]\s+/)[0].toLowerCase()
    for (const t of Object.keys(out) as Array<TypeCount['type']>) if (new RegExp(`\\b${t}\\b`).test(front)) out[t] += qty
  }
  return out
}

/**
 * Build the whole response for one deck from its counted cards and its commander's typical numbers.
 * Without `targets` (or when they are not usable), the general guide is used.
 */
export function buildDeckHealth(cards: HealthDeckCard[], targets: CommanderTargets = guideTargets('General guide'), now: Date = new Date()): DeckHealthResponse {
  const { have, unclassifiedCount, mainDeckCount } = countRoles(cards)
  const useEdhrec = targets.status === 'ok' && targets.source !== 'general_guide' && targets.roles.length > 0
  const source: DeckHealthRole['targetSource'] = useEdhrec ? targets.source : 'general_guide'

  const typicalFor = (role: HealthRoleKey): number => {
    if (!useEdhrec) return GENERAL_GUIDE[role]
    if (role === 'lands') return targets.landsTypical ?? GENERAL_GUIDE.lands
    return targets.roles.find((r) => r.role === role)?.typical ?? GENERAL_GUIDE[role]
  }

  const roles: DeckHealthRole[] = HEALTH_ROLE_ORDER.map((role) => {
    const typical = typicalFor(role)
    // Lands fall back to the guide when EDHREC gave no land number; label it honestly.
    const roleSource = useEdhrec && role === 'lands' && targets.landsTypical === null ? 'general_guide' : source
    return {
      role,
      label: ROLE_LABELS[role],
      have: have[role],
      typical,
      targetSource: roleSource,
      state: roleState(have[role], typical),
      text: roleText(have[role], typical, roleSource),
    }
  })

  const usingGeneralGuide = !useEdhrec
  const copy = composeHealthCopy({ roles, usingGeneralGuide })
  const partial = mainDeckCount > 0 && unclassifiedCount / mainDeckCount > UNCLASSIFIED_PARTIAL_SHARE
  const deckTypes = countDeckTypes(cards)

  return {
    verdict: copy,
    strategy: { state: 'not_set', text: useEdhrec ? 'Not set yet, using typical numbers' : 'Not set yet, using the general guide' },
    sourceLine: targets.sourceLabel,
    checkState: partial ? 'partial' : 'full',
    unclassifiedCount,
    roles,
    typeCounts: targets.typeCounts.map((t) => ({ type: t.type, average: t.average, have: deckTypes[t.type] })),
    typeCountsLabel: targets.typeCountsLabel,
    computedAt: now.toISOString(),
  }
}
