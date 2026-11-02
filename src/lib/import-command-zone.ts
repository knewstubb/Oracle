/**
 * Command zone in a deck file (T-62 slice 7, contract command-zone-roles §4 and import-formats E-22).
 * Pure helpers: they only re-tag and read the `board` of resolved lines. No database, no network.
 */
import type { ImportBoard } from '../../docs/oracle/contracts/manabox-import.types'

export interface BoardCandidate {
  board?: ImportBoard
  cardName: string
  oracleId: string
  scryfallId: string
}

export interface FileCard {
  name: string
  scryfallId: string | null
}

export interface FileCommandZone {
  /** First = commander, second = Partner/Background. At most two. */
  commanders: FileCard[]
  /** At most one; any more were moved to the maybeboard. */
  companion: FileCard | null
}

const COMPANION_TEXT = /(^|\n)\s*Companion\s*[—–-]/i

export function hasCompanionKeyword(oracleText: string | null | undefined): boolean {
  return COMPANION_TEXT.test((oracleText ?? '').split(' // ')[0])
}

/**
 * E-22: a card in the Commander section that has the Companion keyword, when other commander(s) exist,
 * is a companion. `oracleTextByName` is keyed by lower-case card name; a card with no entry is left alone.
 */
export function retagCompanions<T extends BoardCandidate>(
  candidates: T[],
  oracleTextByName: Map<string, string | null>
): { candidates: T[]; notes: string[] } {
  const commanderNames = new Set(candidates.filter((c) => c.board === 'commander').map((c) => c.oracleId))
  const notes: string[] = []
  const out = candidates.map((c) => {
    if (c.board !== 'commander') return c
    if (commanderNames.size < 2) return c
    if (!hasCompanionKeyword(oracleTextByName.get(c.cardName.toLowerCase()))) return c
    notes.push(`${c.cardName} was listed with the commanders but is a companion, so it is ticked as the companion.`)
    return { ...c, board: 'companion' as ImportBoard }
  })
  return { candidates: out, notes }
}

/** Only one companion is allowed: the first stays, the rest go to the maybeboard with a note. */
export function limitCompanions<T extends BoardCandidate>(candidates: T[]): { candidates: T[]; notes: string[] } {
  let keep: string | null = null
  const demoted: string[] = []
  const out = candidates.map((c) => {
    if (c.board !== 'companion') return c
    if (keep === null) {
      keep = c.oracleId
      return c
    }
    if (c.oracleId === keep) return c
    if (!demoted.includes(c.cardName)) demoted.push(c.cardName)
    return { ...c, board: 'maybeboard' as ImportBoard }
  })
  const notes = demoted.length
    ? [`A deck can have one companion. ${demoted.join(', ')} ${demoted.length === 1 ? 'was' : 'were'} put on the maybeboard instead.`]
    : []
  return { candidates: out, notes }
}

/** What the file marks, for pre-ticking: up to two commanders and one companion (one entry per card). */
export function fileCommandZone(candidates: BoardCandidate[]): FileCommandZone {
  const commanders: FileCard[] = []
  const seen = new Set<string>()
  let companion: FileCard | null = null
  for (const c of candidates) {
    if (c.board === 'commander' && !seen.has(c.oracleId) && commanders.length < 2) {
      seen.add(c.oracleId)
      commanders.push({ name: c.cardName, scryfallId: c.scryfallId || null })
    } else if (c.board === 'companion' && companion === null) {
      companion = { name: c.cardName, scryfallId: c.scryfallId || null }
    }
  }
  return { commanders, companion }
}
