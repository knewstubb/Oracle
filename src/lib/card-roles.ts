/**
 * Shared role function for Deck health (contract: docs/oracle/contracts/deck-health-phase2.md, section 1.2).
 *
 * One pure function decides which of the four roles a card has: ramp, draw, removal, wipes.
 * The deck strip, the panel counts and (later slices) the gap lists all call it, so they cannot disagree.
 *
 * Rules in short:
 *  - Needs real card text. Null or empty text gives no roles (the caller counts it as "unclassified").
 *  - A card can have several roles (Damn is removal and a wipe).
 *  - Lands have no roles. A land is decided by the FRONT face type line only.
 *  - Never throws.
 */

export type Role = 'ramp' | 'draw' | 'removal' | 'wipes'

/** Fixed display order, also the tie-break order for verdicts. */
export const ROLE_ORDER: readonly Role[] = ['ramp', 'draw', 'removal', 'wipes']

/**
 * Cheap database pre-filter: every card that `rolesForCard` gives this role contains at least one of these
 * pieces of text (case-insensitive, on the raw Oracle text). The database uses them to hand back only possible
 * candidates instead of the whole collection; `rolesForCard` still makes the real decision.
 * A golden test (card-roles.test.ts) checks this over every saved fixture card. Add a needle when a rule changes.
 */
export const ROLE_TEXT_NEEDLES: Record<Role, readonly string[]> = {
  ramp: ['add', 'treasure', 'search your library', 'additional land', 'onto the battlefield'],
  draw: ['draw'],
  removal: ['destroy', 'exile', 'damage', '/-', '/\u2212', '/\u2013', 'to its owner', 'sacrifices', 'owner of target'],
  wipes: ['destroy all', 'exile all', 'overload', '/-', '/\u2212', '/\u2013', 'damage to each', 'return all', 'return each'],
}

/** Bump on any rule change; invalidates cached targets (used from slice 2). */
export const CLASSIFIER_VERSION = 1

export interface RoleCardInput {
  name: string
  typeLine: string | null
  oracleText: string | null
}

/** Front face of a type line ("Instant // Land" gives "Instant"). */
export function frontFaceTypeLine(typeLine: string | null | undefined): string {
  if (!typeLine) return ''
  return typeLine.split('//')[0].trim()
}

/** True when the FRONT face is a land. A spell with a land back face ("Instant // Land") is not a land. */
export function isLandTypeLine(typeLine: string | null | undefined): boolean {
  return /\bland\b/i.test(frontFaceTypeLine(typeLine))
}

/** Text of the front face only. Joined double-faced text is split on a line that is just "//". */
function frontFaceText(text: string): string {
  const parts = text.split(/\n\s*\/\/\s*\n/)
  return parts[0]
}

/** Lower-case, reminder text removed, curly quotes and minus signs normalised. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\u2212\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
}

// ---------------------------------------------------------------------------
// Ramp
// ---------------------------------------------------------------------------

const LAND_WORD = '(?:land|forest|island|plains|swamp|mountain)'

/** "Search your library for ... land ... put it onto the battlefield". Cards that only fetch to hand do not match. */
const FETCH_LAND_TO_BATTLEFIELD = new RegExp(
  `search your library for[^.]*\\b${LAND_WORD}\\b[^.]*\\bonto the battlefield`,
)
const LAND_FROM_HAND_TO_BATTLEFIELD = new RegExp(`put (?:a|an|up to \\w+) ${LAND_WORD} cards? from your hand onto the battlefield`)
const EXTRA_LAND_DROP = /you may play an additional land/
const ADDS_MANA = /\badd (?:\{[^}]+\}|one mana|two mana|three mana|an amount|x mana|that much|mana)/
const MAKES_TREASURE = /create (?:a|an|two|three|four|x|\d+|that many)(?: tapped)? treasure/

function isRamp(text: string, typeLine: string): boolean {
  if (FETCH_LAND_TO_BATTLEFIELD.test(text)) return true
  if (LAND_FROM_HAND_TO_BATTLEFIELD.test(text)) return true
  if (EXTRA_LAND_DROP.test(text)) return true
  if (MAKES_TREASURE.test(text)) return true
  // Mana from a permanent (rock, dork, ritual-on-a-stick). One-shot instants and sorceries that add mana
  // (Dark Ritual, Mana Drain's delayed mana) are not ramp.
  const oneShot = /\b(?:instant|sorcery)\b/i.test(typeLine)
  if (!oneShot && ADDS_MANA.test(text)) return true
  return false
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

const DRAW_MANY = /\bdraws? (?:two|three|four|five|six|seven|x|\d+|that many|cards equal|a number of) cards?|\bdraws? cards equal|\bdraws? that many cards/
const DRAW_ONE = /\byou draw (?:a|one) card|\bdraws? a card\b/
/** One card only counts when it repeats or is attached to a trigger or ability (not a plain cantrip like Ponder). */
const REPEATABLE_OR_TRIGGERED = /\bwhenever\b|\bwhen\b|\bat the beginning\b|^[^.]*:/

function isDraw(text: string): boolean {
  for (const line of text.split('\n')) {
    if (!/draw/.test(line)) continue
    // The opponent drawing is not card advantage for you.
    if (/\b(?:each |target |an )?opponents? draws?\b/.test(line)) continue
    if (/\bcan't draw\b|\bwould draw\b/.test(line)) continue
    if (DRAW_MANY.test(line)) return true
    if (DRAW_ONE.test(line) && REPEATABLE_OR_TRIGGERED.test(line)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Removal and wipes
// ---------------------------------------------------------------------------

const TARGET_NOUN = /\b(?:creature|permanent|artifact|enchantment|planeswalker|battle)s?\b/
const NOT_A_BOARD_TARGET = /\b(?:cards?|spells?|abilit(?:y|ies)|players?|graveyards?|opponents?'s? graveyard)\b/
const BLINK_RETURN = /return (?:it|that card|that creature|that permanent|them|those cards) to the battlefield/

function targetPhraseIsBoard(phrase: string): boolean {
  if (!TARGET_NOUN.test(phrase)) return false
  if (NOT_A_BOARD_TARGET.test(phrase)) return false
  if (/\byou control\b/.test(phrase)) return false
  return true
}

function hasRemoval(text: string): boolean {
  // Destroy or exile one or more targets.
  const destroyExile = /\b(?:destroy|exile)(?: up to (?:one|two|three|four|x|\d+))?(?: another)? target ([^.;\n]*)/g
  for (const m of text.matchAll(destroyExile)) {
    if (!targetPhraseIsBoard(m[1])) continue
    // Exile-and-return (Flickerwisp) is a blink, not removal.
    if (BLINK_RETURN.test(text)) continue
    return true
  }
  // Chaos Warp style: the owner shuffles the target permanent away.
  if (/owner of target (?:\w+ )*?(?:permanent|creature)[^.]*shuffles it into their library/.test(text)) return true
  // Council's Judgment style vote exile.
  if (/exile each permanent with the most votes/.test(text)) return true
  // Damage that can kill: any target, or a creature, planeswalker, battle, permanent.
  const damage = /\bdeals? (?:\d+|x|that much) damage (?:divided as you choose )?(?:to|among) ([^.;\n]*)/g
  for (const m of text.matchAll(damage)) {
    const phrase = m[1]
    if (/\bany target\b/.test(phrase)) return true
    if (/\btargets? (?:\w+ )*?(?:creature|planeswalker|battle|permanent)s?\b/.test(phrase) && !/\byou control\b/.test(phrase)) return true
  }
  // Bite: damage equal to power to a target creature.
  if (/deals? damage equal to [^.]*? to (?:another )?target (?:\w+ )*?creature/.test(text)) return true
  // Targeted -X/-X.
  const shrink = /\btargets? ((?:[^.;\n]*?))gets? -(?:\d+|x)\/-(?:\d+|x)/g
  for (const m of text.matchAll(shrink)) {
    if (targetPhraseIsBoard(m[1] + ' creature')) return true
  }
  // Targeted bounce of a permanent that is not yours.
  const bounce = /\breturn target ([^.;\n]*?) to its owner's hand/g
  for (const m of text.matchAll(bounce)) {
    if (targetPhraseIsBoard(m[1])) return true
  }
  // Edicts.
  if (/target (?:player|opponent) sacrifices (?:a|an|target) (?:\w+ )*?(?:creature|permanent|artifact|enchantment)/.test(text)) return true
  return false
}

function hasWipe(text: string): boolean {
  // Overload turns a "target" spell into an "each" spell (Cyclonic Rift, Damn).
  if (/\boverload\b/.test(text) && hasRemoval(text)) return true
  // Destroy or exile all of something on the board.
  const sweep = /\b(?:destroy|exile) all ((?:[\w'-]+ ){0,3}?)(creatures?|permanents?|artifacts?|enchantments?|planeswalkers?)\b([^.;\n]*)/g
  for (const m of text.matchAll(sweep)) {
    if (/\byou control\b/.test(m[3])) continue
    return true
  }
  // "All creatures get -X/-X", and "creatures your opponents control get -X/-X".
  if (/\b(?:all|each) creatures? (?:\w+ )*?gets? -(?:\d+|x)\/-(?:\d+|x)/.test(text)) return true
  if (/\bcreatures (?:your opponents|opponents|target opponent|target player) control get -(?:\d+|x)\/-(?:\d+|x)/.test(text)) return true
  // Damage to every creature.
  if (/\bdeals? (?:\d+|x|that much) damage to each (?:other )?creature\b(?![^.]*\byou control\b)/.test(text)) return true
  // Bounce or sacrifice everything.
  if (/\breturn (?:all|each) (?:nonland )?(?:creatures?|permanents?)\b(?![^.]*\byou control\b)[^.]*(?:to (?:their|its) owners?'? hands?)/.test(text)) return true
  return false
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** A card may have 0..4 roles. Lands return []. Null or empty text returns []. Never throws. Pure. */
export function rolesForCard(card: RoleCardInput): Role[] {
  try {
    if (!card) return []
    if (isLandTypeLine(card.typeLine)) return []
    if (typeof card.oracleText !== 'string' || card.oracleText.trim() === '') return []

    const text = normalise(frontFaceText(card.oracleText))
    const typeLine = frontFaceTypeLine(card.typeLine)
    const roles: Role[] = []
    if (isRamp(text, typeLine)) roles.push('ramp')
    if (isDraw(text)) roles.push('draw')
    if (hasRemoval(text)) roles.push('removal')
    if (hasWipe(text)) roles.push('wipes')
    return roles
  } catch {
    return []
  }
}

/** True when the card has usable text, so an empty role list means "checked, no role" rather than "unchecked". */
export function hasClassifiableText(card: Pick<RoleCardInput, 'typeLine' | 'oracleText'>): boolean {
  return typeof card.oracleText === 'string' && card.oracleText.trim() !== ''
}
