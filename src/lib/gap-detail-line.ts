import { frontFaceTypeLine, isLandTypeLine } from '@/lib/card-roles'

export type GapLineRole = 'ramp' | 'draw' | 'removal' | 'wipes' | 'lands'

const COUNT_WORDS: Record<string, string> = { a: 'a', an: 'a', one: 'one', two: 'two', three: 'three', four: 'four' }

const clean = (text: string) =>
  text
    .split(/\n\s*\/\/\s*\n/)[0]
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\u2212\u2013]/g, '-')

/**
 * One short sentence saying what a card does for a role ("Exiles target creature."). Plain rules over the front-face card text;
 * when nothing specific is found it falls back to a safe generic sentence, never an invented one.
 */
export function gapDetailLine(role: string | null | undefined, typeLine: string | null | undefined, oracleText: string | null | undefined): string | null {
  const text = clean(oracleText ?? '')
  switch (role) {
    case 'lands': {
      if (!isLandTypeLine(typeLine)) return null
      if (/\badd\b/.test(text)) return 'Taps for mana.'
      return 'A land with a special ability.'
    }
    case 'ramp': {
      if (/search your library for[^.]*\bland\b[^.]*\bonto the battlefield/.test(text)) return 'Puts a land onto the battlefield.'
      if (/you may play an additional land/.test(text)) return 'Lets you play an extra land.'
      if (/create[^.]*treasure/.test(text)) return 'Makes Treasure for mana.'
      if (/\badd\b/.test(text)) return 'Adds mana.'
      return 'Helps you get more mana.'
    }
    case 'draw': {
      const m = /draws? (a|an|one|two|three|four|x|\d+) cards?/.exec(text)
      if (m) return m[1] === 'x' ? 'Draws X cards.' : `Draws ${COUNT_WORDS[m[1]] ?? m[1]} ${m[1] === 'a' || m[1] === 'an' || m[1] === 'one' ? 'card' : 'cards'}.`
      return 'Draws you cards.'
    }
    case 'removal': {
      const m = /\b(destroy|exile) target ([a-z/ ,-]{3,40}?)(?: you don't control| an opponent controls)?[.,]/.exec(text)
      if (m) return `${m[1] === 'destroy' ? 'Destroys' : 'Exiles'} target ${m[2].trim()}.`
      if (/-\d*x?\/-/.test(text) || /gets? -/.test(text)) return 'Shrinks a creature.'
      if (/deals? [\dx]+ damage/.test(text)) return 'Deals damage.'
      return 'Removes a threat.'
    }
    case 'wipes': {
      const m = /\b(destroy|exile) all ([a-z/ ,-]{3,40}?)[.,]/.exec(text)
      if (m) return `${m[1] === 'destroy' ? 'Destroys' : 'Exiles'} all ${m[2].trim()}.`
      if (/damage to each/.test(text)) return 'Damages every creature.'
      if (/-\d*x?\/-/.test(text) || /get -/.test(text)) return 'Every creature shrinks.'
      return 'Clears the board.'
    }
    default:
      return frontFaceTypeLine(typeLine) || null
  }
}
