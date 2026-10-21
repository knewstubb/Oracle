/**
 * Which cards may be chosen as a commander, worked out from card data we hold
 * (ref_cards: type line, oracle text, power/toughness, commander legality).
 * No card names are hard-coded.
 */

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

/** Names (original case) from `names` whose facts say they can be a commander. */
export function eligibleNames(names: string[], facts: Map<string, CommanderCardFacts>): string[] {
  return names.filter((name) => {
    const f = facts.get(name.toLowerCase())
    return !!f && isEligibleCommander(f)
  })
}
