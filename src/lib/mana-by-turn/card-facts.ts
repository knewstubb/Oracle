// Reads a card's rules text into the few facts the mana simulation needs. No new data: card text is the only source.
import { calculateCMC } from '@/lib/mana-analysis'
import { frontFaceText, frontFaceTypeLine, isLandTypeLine, rolesForCard } from '@/lib/card-roles'
import type { RailCard } from '@/lib/deck-rail-stats'

export type SimKind = 'land' | 'ramp' | 'oneShot' | 'draw' | 'other'
export type TapState = 'untapped' | 'tapped' | 'conditional'

export interface SimCard {
  kind: SimKind
  /** Mana needed to cast (0 for lands). */
  cost: number
  /** Mana made. Lands: per turn. Ramp: per turn from the turn after it is cast. One-shot: once, on the turn it is cast. */
  produced: number
  /** One-shot that is paid for by its own mana (Dark Ritual): only produced minus cost is a gain. */
  ritual?: boolean
  draws: number
  tap: TapState
}

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
}

function front(text: string | null | undefined): string {
  return text ? normalise(frontFaceText(text)) : ''
}

const VARIABLE = /\b(?:x|that much|equal to|for each|where x|number of|amount)\b|\{x\}/

/** Mana in one "add ..." clause. Unreadable or variable returns 0. "{G} or {W}" and "any color" return 1. */
function manaInClause(clause: string): number {
  const text = clause.split(/[.\n]/)[0]
  if (VARIABLE.test(text.replace(/\{x\}/g, 'x'))) return 0
  const wordMatch = text.match(/^\s*(one|two|three|four|five|six)\s+mana\b/)
  if (wordMatch) return NUMBER_WORDS[wordMatch[1]]
  const beforeOr = text.split(/\bor\b/)[0]
  const symbols = beforeOr.match(/\{[^}]+\}/g)
  if (symbols) return symbols.length
  if (/\bmana of any (?:one )?colou?r\b|\bany colou?r\b/.test(text)) return 1
  return 0
}

/** Mana from the first "{T}: Add ..." ability. Returns 0 when there is none or it cannot be read. */
export function parseManaProduced(oracleText: string | null | undefined): number {
  const text = front(oracleText)
  for (const line of text.split('\n')) {
    const m = line.match(/\{t\}[^:]*:[^]*?\badd\b([^]*)$/)
    if (m) return manaInClause(m[1])
  }
  return 0
}

/** Mana from the first "Add ..." clause that is not a tap ability (Dark Ritual). */
function parseSpellMana(text: string): number {
  const m = text.match(/\badd\b([^]*)$/)
  return m ? manaInClause(m[1]) : 0
}

/** Cards drawn when the card does its draw. 0 when it has no draw text. Unreadable counts as 1. */
export function parseDrawCount(oracleText: string | null | undefined): number {
  const text = front(oracleText)
  const m = text.match(/\bdraws? (a|an|one|two|three|four|five|six|\d+) cards?\b/)
  if (m) return NUMBER_WORDS[m[1]] ?? (parseInt(m[1], 10) || 1)
  return /\bdraws?\b/.test(text) ? 1 : 0
}

const TAPPED = /enters (?:the battlefield )?tapped/
const CONDITION = /\bunless\b|\bif you\b|\byou may pay\b|\breveal\b|\bif (?:it|that)\b|\bif an? /

/** Tapped state of a land from its front-face text. "Unless", "if you", "you may pay" or "reveal" nearby means conditional. */
export function landTapState(typeLine: string | null | undefined, oracleText: string | null | undefined): TapState {
  if (!isLandTypeLine(typeLine)) return 'untapped'
  const text = front(oracleText)
  if (!TAPPED.test(text)) return 'untapped'
  const parts = text.split(/[.\n]/)
  const i = parts.findIndex((p) => TAPPED.test(p))
  const near = `${parts[i - 1] ?? ''} ${parts[i]}`
  return CONDITION.test(near) ? 'conditional' : 'tapped'
}

const FETCH_TO_BATTLEFIELD = /search your library for[^.]*\bland\b[^.]*\bonto the battlefield/
const MAKES_TREASURE = /create (a|an|two|three|four|\d+)(?: tapped)? treasure/

export function simCardFromRail(card: RailCard, isCommander = false): SimCard {
  void isCommander
  const typeLine = card.type_line ?? null
  const text = front(card.oracle_text)
  const front_type = frontFaceTypeLine(typeLine)
  if (isLandTypeLine(typeLine)) {
    return { kind: 'land', cost: 0, produced: Math.max(1, parseManaProduced(card.oracle_text)), draws: 0, tap: landTapState(typeLine, card.oracle_text) }
  }
  const cost = calculateCMC((card.mana_cost ?? '').split('//')[0])
  const roles = rolesForCard({ name: card.card_name, typeLine, oracleText: card.oracle_text ?? null })
  const spell = /\binstant\b|\bsorcery\b/i.test(front_type)
  const draws = roles.includes('draw') ? parseDrawCount(card.oracle_text) : 0
  const base = { cost, draws, tap: 'untapped' as TapState }

  const tapMana = parseManaProduced(card.oracle_text)
  if (!spell && roles.includes('ramp') && tapMana > 0) return { ...base, kind: 'ramp', produced: tapMana }
  if (roles.includes('ramp') && FETCH_TO_BATTLEFIELD.test(text)) return { ...base, kind: 'ramp', produced: 1 }
  const treasure = text.match(MAKES_TREASURE)
  if (treasure) return { ...base, kind: 'oneShot', produced: NUMBER_WORDS[treasure[1]] ?? (parseInt(treasure[1], 10) || 1) }
  if (spell) {
    const gross = parseSpellMana(text)
    if (gross > cost) return { ...base, kind: 'oneShot', produced: gross, ritual: true }
  }
  if (draws > 0) return { ...base, kind: 'draw', produced: 0 }
  return { ...base, kind: 'other', produced: 0 }
}
