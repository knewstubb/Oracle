/**
 * Can these two cards be a commander pair? (import-formats S-6, §4.)
 * Worked out from card text and type only; no card names are hard-coded.
 * Legal pairs: both have Partner (or Friends forever), a "Partner with X" pair naming each
 * other, "Choose a Background" with a Background, or a Doctor with "Doctor's companion".
 */

export interface PairCardFacts {
  name: string
  type_line: string | null
  oracle_text: string | null
}

export type PairVerdict = { ok: true } | { ok: false; reason: string }

type Keyword = 'partner' | 'partner_with' | 'friends_forever' | 'background_chooser' | 'background' | 'doctors_companion' | 'doctor'

const front = (text: string | null) => (text ?? '').split(' // ')[0]

function keywordsOf(card: PairCardFacts): { set: Set<Keyword>; partnerWith: string | null } {
  const text = front(card.oracle_text)
  const types = front(card.type_line)
  const set = new Set<Keyword>()
  let partnerWith: string | null = null
  const pw = text.match(/Partner with ([^(\n]+)/i)
  if (pw) {
    set.add('partner_with')
    partnerWith = pw[1].trim()
  } else if (/(^|\n)\s*Partner\b(?!\s+with)/i.test(text) && !/Partner—/i.test(text)) {
    set.add('partner')
  }
  if (/Friends forever/i.test(text)) set.add('friends_forever')
  if (/Choose a Background/i.test(text)) set.add('background_chooser')
  if (/\bLegendary\b/.test(types) && /\bBackground\b/.test(types)) set.add('background')
  if (/Doctor's companion/i.test(text)) set.add('doctors_companion')
  if (/\bTime Lord Doctor\b/.test(types)) set.add('doctor')
  return { set, partnerWith }
}

export function checkCommanderPair(a: PairCardFacts, b: PairCardFacts): PairVerdict {
  if (a.name === b.name) return { ok: false, reason: 'A commander pair needs two different cards.' }
  const ka = keywordsOf(a)
  const kb = keywordsOf(b)
  if (ka.set.has('partner') && kb.set.has('partner')) return { ok: true }
  if (ka.set.has('friends_forever') && kb.set.has('friends_forever')) return { ok: true }
  if (ka.set.has('partner_with') && kb.set.has('partner_with')) {
    const namedBy = (x: typeof ka, other: PairCardFacts) => x.partnerWith?.toLowerCase() === other.name.toLowerCase()
    if (namedBy(ka, b) && namedBy(kb, a)) return { ok: true }
    return { ok: false, reason: `${a.name} and ${b.name} are not partners with each other.` }
  }
  if (
    (ka.set.has('background_chooser') && kb.set.has('background')) ||
    (kb.set.has('background_chooser') && ka.set.has('background'))
  ) {
    return { ok: true }
  }
  if (
    (ka.set.has('doctors_companion') && kb.set.has('doctor')) ||
    (kb.set.has('doctors_companion') && ka.set.has('doctor'))
  ) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: `${a.name} and ${b.name} can't be commanders together. Both need Partner, or one needs "Choose a Background" with a Background.`,
  }
}

/** Which second-commander role a card fills: a Background is 'background', anything else is 'partner'. */
export function secondRoleFor(card: PairCardFacts): 'partner' | 'background' {
  return keywordsOf(card).set.has('background') ? 'background' : 'partner'
}

/**
 * Check a chosen second commander: the pair must be legal and the role must match the card
 * (a Background cannot be saved as a partner, or the other way round).
 */
export function verifySecondCommander(
  primary: PairCardFacts,
  second: PairCardFacts,
  role: 'partner' | 'background'
): PairVerdict {
  const pair = checkCommanderPair(primary, second)
  if (!pair.ok) return pair
  if (secondRoleFor(second) !== role) {
    return {
      ok: false,
      reason: `${second.name} should be saved as a ${secondRoleFor(second) === 'background' ? 'Background' : 'Partner'}, not a ${role === 'background' ? 'Background' : 'Partner'}.`,
    }
  }
  return { ok: true }
}

/** What kind of second-commander slot a commander allows (null = none). */
export type SecondSlotKind = 'background' | 'partner_with' | 'partner' | 'friends_forever' | 'doctors_companion'

/**
 * Which second-commander slot this commander's own text allows, using the same keyword detection as the pair check.
 * Returns null when it has none of Partner / Partner with / Friends forever / Doctor's companion (or Doctor) / Choose a Background.
 */
export function secondSlotKindFor(card: PairCardFacts): SecondSlotKind | null {
  const { set } = keywordsOf(card)
  if (set.has('background_chooser')) return 'background'
  if (set.has('partner_with')) return 'partner_with'
  if (set.has('partner')) return 'partner'
  if (set.has('friends_forever')) return 'friends_forever'
  if (set.has('doctors_companion') || set.has('doctor')) return 'doctors_companion'
  return null
}

export const SECOND_SLOT_LABEL: Record<SecondSlotKind, string> = {
  background: 'Background',
  partner_with: 'Partner with',
  partner: 'Partner',
  friends_forever: 'Friends forever',
  doctors_companion: "Doctor's companion",
}
