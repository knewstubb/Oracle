/**
 * Which cards may be chosen as a commander, worked out from card data we hold
 * (ref_cards: type line, oracle text, power/toughness, commander legality).
 * No card names are hard-coded.
 */

import { checkCommanderPair, type PairCardFacts } from '@/lib/commander-pairing'

export interface CommanderCardFacts {
  type_line: string | null
  oracle_text: string | null
  power: string | null
  toughness: string | null
  commander_legal: boolean | null
  /** Precomputed by the card-data sync; used as a fallback only. */
  can_be_commander?: boolean | null
}

/** Faces of a double-faced card are stored joined by " // "; only the front face counts. */
function frontFace(text: string | null): string {
  return (text ?? '').split(' // ')[0]
}

export function isEligibleCommander(card: CommanderCardFacts): boolean {
  if (!card.commander_legal) return false
  const types = frontFace(card.type_line)
  const legendary = /\bLegendary\b/.test(types)
  if (legendary && /\bCreature\b/.test(types)) return true
  // Legendary Vehicles and Spacecraft with a printed power and toughness.
  if (legendary && /\b(Vehicle|Spacecraft)\b/.test(types) && card.power != null && card.toughness != null) return true
  // Backgrounds are chosen as a second commander alongside "Choose a Background".
  if (legendary && /\bBackground\b/.test(types)) return true
  if (/can be your commander/i.test(frontFace(card.oracle_text))) return true
  return card.can_be_commander === true
}

/**
 * Can this card be the deck's FIRST commander on its own? Everything `isEligibleCommander` accepts except a
 * Background, which is only ever a second commander next to "Choose a Background".
 */
export function isEligibleLeadCommander(card: CommanderCardFacts): boolean {
  if (!isEligibleCommander(card)) return false
  const types = frontFace(card.type_line)
  const background = /\bLegendary\b/.test(types) && /\bBackground\b/.test(types)
  if (!background) return true
  // A Background that is also a legal commander in its own right (e.g. says "can be your commander") stays eligible.
  return /can be your commander/i.test(frontFace(card.oracle_text)) || card.can_be_commander === true
}

/** Colour letters (W U B R G) in a stored identity text such as "G, R, W". */
function identityLetters(text: string | null | undefined): Set<string> {
  return new Set((text ?? '').toUpperCase().split('').filter((c) => 'WUBRG'.includes(c)))
}

/**
 * Lead-commander names that would not put the rest of the deck off-colour: every other card's colour identity
 * must sit inside the candidate's. `deckIdentities` are the colour identity texts of the other main-list cards.
 */
export function eligibleLeadNames(
  names: string[],
  facts: Map<string, CommanderCardFacts & { color_identity?: string | null }>,
  deckIdentities: Array<string | null | undefined> = []
): string[] {
  const deck = new Set<string>()
  for (const text of deckIdentities) for (const c of identityLetters(text)) deck.add(c)
  return names.filter((name) => {
    const f = facts.get(name.toLowerCase())
    if (!f || !isEligibleLeadCommander(f)) return false
    const own = identityLetters(f.color_identity)
    return [...deck].every((c) => own.has(c))
  })
}

/** Names (original case) from `names` whose facts say they can be a commander. */
export function eligibleNames(names: string[], facts: Map<string, CommanderCardFacts>): string[] {
  return names.filter((name) => {
    const f = facts.get(name.toLowerCase())
    return !!f && isEligibleCommander(f)
  })
}

/**
 * Can this card be a companion? It needs the Companion keyword ("Companion — ...") and to be Commander-legal.
 * The deck rule of each companion (e.g. "no duplicates") is deliberately not checked (contract: claim nothing).
 */
export function isEligibleCompanion(card: Pick<CommanderCardFacts, 'oracle_text' | 'commander_legal'>): boolean {
  if (!card.commander_legal) return false
  return /(^|\n)\s*Companion\s*[—–-]/i.test(frontFace(card.oracle_text))
}

/** Names (original case) from `names` that have the Companion keyword. */
export function eligibleCompanionNames(names: string[], facts: Map<string, CommanderCardFacts>): string[] {
  return names.filter((name) => {
    const f = facts.get(name.toLowerCase())
    return !!f && isEligibleCompanion(f)
  })
}

/**
 * Names from `names` that can be the second commander next to `primary`: they can lead a deck and
 * the pair is legal (Partner with Partner, Choose a Background with a Background, ...).
 */
export function eligibleSecondNames(
  primary: PairCardFacts,
  names: string[],
  facts: Map<string, CommanderCardFacts & { name: string }>
): string[] {
  return names.filter((name) => {
    const f = facts.get(name.toLowerCase())
    if (!f || !isEligibleCommander(f)) return false
    return checkCommanderPair(primary, { name: f.name, type_line: f.type_line, oracle_text: f.oracle_text }).ok
  })
}
