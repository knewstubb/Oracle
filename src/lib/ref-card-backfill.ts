/**
 * CC-14 / FEAT-002: pure mapper from a Scryfall card to a `ref_cards` row (no network, no database).
 * Used only by the prepared backfill script in supabase/drafts (NOT applied; needs owner approval).
 *
 * Library style it reproduces (read from the live library 2026-11-18):
 *  - type_line: per face "Types — Sub, Sub", faces joined " // ", subtypes comma separated (the connector view splits on commas).
 *  - color_identity: letters sorted alphabetically, joined ", " ("" for colourless), e.g. "B, G, U, W".
 *  - mana_cost: top level, or the faces' costs joined " // ".
 */

import { hasCardType, hasSubtype, hasSupertype, parseTypeLine } from './type-line'
export interface ScryfallFace {
  name?: string
  oracle_id?: string
  type_line?: string
  mana_cost?: string
  oracle_text?: string
  power?: string
  toughness?: string
}

export interface ScryfallCard extends ScryfallFace {
  name: string
  oracle_id?: string
  layout?: string
  cmc?: number
  colors?: string[]
  color_identity?: string[]
  keywords?: string[]
  legalities?: { commander?: string }
  edhrec_rank?: number
  card_faces?: ScryfallFace[]
}

export interface RefCardRow {
  name: string
  type_line: string
  color_identity: string
  mana_cost: string | null
  mana_value: number
  oracle_text: string | null
  power: string | null
  toughness: string | null
  edhrec_rank: number | null
  commander_legal: boolean
  is_legendary: boolean
  is_creature: boolean
  can_be_commander: boolean
  keywords: string[] | null
  default_category: null
}

/** Face separator inside a type line, cost and name. */
const FACE_SEP = ' // '
/** Face separator inside stored rules text: on its own line so a phrase never spans faces. */
export const TEXT_FACE_SEP = '\n//\n'
/** Multi-word subtypes that must stay one subtype. Only this one is known to be needed so far. */
const MULTI_WORD_SUBTYPES = ['Time Lord']

function splitSubtypeWords(raw: string): string[] {
  const words = raw.split(/[,\s]+/).filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    const pair = i + 1 < words.length ? `${words[i]} ${words[i + 1]}` : null
    if (pair && MULTI_WORD_SUBTYPES.includes(pair)) {
      out.push(pair)
      i++
    } else {
      out.push(words[i])
    }
  }
  return out
}

function normaliseFace(face: string): string {
  const idx = face.indexOf(' — ')
  if (idx === -1) return face.trim()
  const types = face.slice(0, idx).trim()
  const subs = splitSubtypeWords(face.slice(idx + 3))
  return subs.length ? `${types} — ${subs.join(', ')}` : types
}

/**
 * Rewrites a type line so subtypes are comma separated ("Creature — Human Scientist Hero" becomes
 * "Creature — Human, Scientist, Hero"). Safe to run on a line that is already in library style.
 */
export function normaliseTypeLineSubtypes(typeLine: string): string {
  return typeLine.split(FACE_SEP).map(normaliseFace).join(FACE_SEP)
}

function faceList(card: ScryfallCard): ScryfallFace[] {
  return card.card_faces && card.card_faces.length > 0 ? card.card_faces : [card]
}

function frontTypeLine(card: ScryfallCard): string {
  const faces = card.card_faces
  if (faces && faces.length > 0 && faces[0].type_line) return faces[0].type_line
  return (card.type_line ?? '').split(FACE_SEP)[0]
}

function joinTexts(parts: Array<string | undefined>, sep: string): string | null {
  const present = parts.filter((p): p is string => typeof p === 'string' && p.length > 0)
  return present.length ? present.join(sep) : null
}

function oracleIdOf(card: ScryfallCard): string | undefined {
  return card.oracle_id ?? card.card_faces?.[0]?.oracle_id
}

/**
 * Builds the library row. When `expectedOracleId` is given and the card's oracle_id differs, throws:
 * a row is never built from a card other than the one requested.
 */
export function mapScryfallToRefCard(card: ScryfallCard, expectedOracleId?: string): RefCardRow {
  if (expectedOracleId !== undefined && oracleIdOf(card) !== expectedOracleId) {
    throw new Error(
      `oracle_id mismatch for "${card.name}": expected ${expectedOracleId}, got ${oracleIdOf(card) ?? 'none'}`,
    )
  }
  const faces = faceList(card)
  const front = faces[0]

  const topType = card.type_line ?? faces.map(f => f.type_line ?? '').filter(Boolean).join(FACE_SEP)
  const typeLine = normaliseTypeLineSubtypes(topType)

  const colours = Array.from(new Set(card.color_identity ?? [])).sort()
  const manaCost = card.mana_cost ? card.mana_cost : joinTexts(faces.map(f => f.mana_cost), FACE_SEP)
  const oracleText = card.oracle_text ? card.oracle_text : joinTexts(faces.map(f => f.oracle_text), TEXT_FACE_SEP)

  const power = card.power ?? front.power ?? null
  const toughness = card.toughness ?? front.toughness ?? null

  const faceTypes = card.card_faces && card.card_faces.length > 0
    ? card.card_faces.map(f => f.type_line ?? '')
    : topType.split(FACE_SEP)
  const isLegendary = faceTypes.some(t => hasSupertype(parseTypeLine(t), 'Legendary', 'front')) || hasSupertype(parseTypeLine(topType), 'Legendary', 'any')
  const frontType = frontTypeLine(card)
  const frontParsed = parseTypeLine(frontType)
  const isCreature = hasCardType(frontParsed, 'Creature', 'front')
  const frontLegendary = hasSupertype(frontParsed, 'Legendary', 'front')
  const vehicleLike = hasSubtype(frontParsed, 'Vehicle', 'front') || hasSubtype(frontParsed, 'Spacecraft', 'front')

  // Approximation of Scryfall is:commander (same intent as scripts/backfill-can-be-commander.ts).
  const canBeCommander =
    (frontLegendary && isCreature) ||
    (oracleText ?? '').includes('can be your commander') ||
    (frontLegendary && vehicleLike && power !== null && toughness !== null)

  return {
    name: card.name,
    type_line: typeLine,
    color_identity: colours.join(', '),
    mana_cost: manaCost,
    mana_value: card.cmc ?? 0,
    oracle_text: oracleText,
    power,
    toughness,
    edhrec_rank: card.edhrec_rank ?? null,
    commander_legal: card.legalities?.commander === 'legal',
    is_legendary: isLegendary,
    is_creature: isCreature,
    can_be_commander: canBeCommander,
    keywords: card.keywords && card.keywords.length > 0 ? card.keywords : null,
    default_category: null,
  }
}
