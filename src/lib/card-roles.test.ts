import { describe, it, expect } from 'vitest'
import {
  rolesForCard,
  isLandTypeLine,
  frontFaceTypeLine,
  hasClassifiableText,
  CLASSIFIER_VERSION,
  ROLE_TEXT_NEEDLES,
  type Role,
} from './card-roles'
import fixtures from './__fixtures__/card-roles-scryfall.json'

/**
 * Golden tests: real Oracle text (saved from Scryfall, see __fixtures__) and the roles we expect.
 * These never touch the app's database.
 */
const cards = fixtures as Record<string, { typeLine: string; oracleText: string }>

function rolesOf(name: string): Role[] {
  const c = cards[name]
  if (!c) throw new Error(`fixture missing: ${name}`)
  return rolesForCard({ name, typeLine: c.typeLine, oracleText: c.oracleText })
}

const GOLDEN: Array<[string, Role[]]> = [
  // Ramp: rocks, dorks, land fetch to the battlefield, extra mana makers
  ['Sol Ring', ['ramp']],
  ['Arcane Signet', ['ramp']],
  ['Talisman of Dominance', ['ramp']],
  ['Llanowar Elves', ['ramp']],
  ['Birds of Paradise', ['ramp']],
  ['Farseek', ['ramp']], // mislabelled Tutor before
  ['Cultivate', ['ramp']], // mislabelled Tutor before
  ["Kodama's Reach", ['ramp']], // mislabelled Tutor before
  ['Rampant Growth', ['ramp']], // mislabelled Tutor before
  ['Three Visits', ['ramp']],
  ['Sakura-Tribe Elder', ['ramp']],
  ["Wayfarer's Bauble", ['ramp']],
  ['Explosive Vegetation', ['ramp']],
  ['Burnished Hart', ['ramp']],
  ['Exploration', ['ramp']],
  ['Dockside Extortionist', ['ramp']],
  // Not ramp: fetch to hand, delayed mana from a counterspell
  ['Land Tax', []],
  ['Mana Drain', []], // mislabelled Ramp before
  ['Demonic Tutor', []],
  ['Mystical Tutor', []],
  ['Counterspell', []],
  // Draw
  ['Rhystic Study', ['draw']],
  ['Phyrexian Arena', ['draw']],
  ['Sign in Blood', ['draw']],
  ["Night's Whisper", ['draw']],
  ['Read the Bones', ['draw']],
  ['Harmonize', ['draw']],
  ['Brainstorm', ['draw']],
  ['Beast Whisperer', ['draw']],
  ['Mulldrifter', ['draw']],
  ['Skullclamp', ['draw']],
  ['Mystic Remora', ['draw']],
  ["Blue Sun's Zenith", ['draw']],
  ['Ponder', []], // a plain cantrip is not card advantage
  ['Eternal Witness', []], // returns to hand, no draw
  // Removal
  ['Swords to Plowshares', ['removal']],
  ['Beast Within', ['removal']],
  ['Putrefy', ['removal']],
  ['Chaos Warp', ['removal']],
  ['Anguished Unmaking', ['removal']],
  ["Assassin's Trophy", ['removal']],
  ["Council's Judgment", ['removal']],
  ['Terminate', ['removal']],
  ['Utter End', ['removal']],
  ['Lightning Bolt', ['removal']],
  ['Disfigure', ['removal']],
  ['Dismember', ['removal']],
  ['Rabid Bite', ['removal']],
  ['Diabolic Edict', ['removal']],
  ['Viral Drake', []], // -1/-1 counters on a creature body are not removal
  ['Stone Rain', []], // land destruction is not creature removal
  ['Flickerwisp', []], // blink, the card comes straight back
  // Wipes
  ['Wrath of God', ['wipes']],
  ['Toxic Deluge', ['wipes']], // mislabelled Other before
  ['Blasphemous Act', ['wipes']],
  ['Farewell', ['wipes']],
  ['Austere Command', ['wipes']],
  ['Merciless Eviction', ['wipes']],
  ['Hour of Devastation', ['wipes']],
  ['Plague Wind', ['wipes']],
  ['Evacuation', ['wipes']],
  ['Elesh Norn, Grand Cenobite', ['wipes']],
  ['Armageddon', []], // lands only, not a board wipe
  // "Each creature" words without a whole-board effect are not wipes
  ['Ghostly Prison', []], // mislabelled Board Wipe before
  ['Propaganda', []], // mislabelled Board Wipe before
  // Two roles on one card
  ['Damn', ['removal', 'wipes']],
  ['Cyclonic Rift', ['removal', 'wipes']], // mislabelled Other before
  ['Jace, the Mind Sculptor', ['draw', 'removal']], // mislabelled Board Wipe before
  // Skipped by type line or text
  ['Command Tower', []],
  ['Forest', []],
  ['Dryad Arbor', []],
  ['Blightstep Pathway // Searstep Pathway', []],
  // Double-faced cards: only the front face counts
  ['Valakut Awakening // Valakut Stoneforge', ['draw']],
  ['Shatterskull Smashing // Shatterskull, the Hammer Pass', ['removal']],
]

describe('rolesForCard: golden cards (real Oracle text)', () => {
  it('has at least 40 golden cards', () => {
    expect(GOLDEN.length).toBeGreaterThanOrEqual(40)
  })

  it.each(GOLDEN)('%s', (name, expected) => {
    expect(rolesOf(name)).toEqual(expected)
  })
})

describe('rolesForCard: edge cases', () => {
  it('returns [] for null text and never guesses (the card is unclassified)', () => {
    expect(rolesForCard({ name: 'Sol Ring', typeLine: 'Artifact', oracleText: null })).toEqual([])
  })

  it('returns [] for empty or whitespace text', () => {
    expect(rolesForCard({ name: 'X', typeLine: 'Artifact', oracleText: '' })).toEqual([])
    expect(rolesForCard({ name: 'X', typeLine: 'Artifact', oracleText: '   ' })).toEqual([])
  })

  it('returns [] for a land even when its text adds mana', () => {
    expect(rolesForCard({ name: 'Command Tower', typeLine: 'Land', oracleText: '{T}: Add one mana of any color.' })).toEqual([])
  })

  it('treats a stored type line cut short ("Sorcery —") as a normal card', () => {
    expect(
      rolesForCard({
        name: 'Cultivate',
        typeLine: 'Sorcery —',
        oracleText: cards['Cultivate'].oracleText,
      }),
    ).toEqual(['ramp'])
  })

  it('decides land from the FRONT face type line only', () => {
    expect(isLandTypeLine('Instant // Land')).toBe(false)
    expect(isLandTypeLine('Land // Land')).toBe(true)
    expect(isLandTypeLine('Land')).toBe(true)
    expect(isLandTypeLine('Legendary Creature — Human // Land')).toBe(false)
    expect(isLandTypeLine(null)).toBe(false)
    expect(frontFaceTypeLine('Sorcery // Land')).toBe('Sorcery')
  })

  it('returns [] and does not throw on odd input', () => {
    expect(() => rolesForCard(undefined as never)).not.toThrow()
    expect(rolesForCard(undefined as never)).toEqual([])
    expect(rolesForCard({ name: 'X', typeLine: null, oracleText: 42 as never })).toEqual([])
  })

  it('reports whether a card has text to classify', () => {
    expect(hasClassifiableText({ typeLine: 'Artifact', oracleText: 'x' })).toBe(true)
    expect(hasClassifiableText({ typeLine: 'Artifact', oracleText: null })).toBe(false)
    expect(hasClassifiableText({ typeLine: 'Artifact', oracleText: ' ' })).toBe(false)
  })

  it('exposes a classifier version', () => {
    expect(CLASSIFIER_VERSION).toBe(1)
  })

  it('the database pre-filter needles never miss a card that has the role (all saved fixtures)', () => {
    for (const [name, c] of Object.entries(cards)) {
      const text = c.oracleText.toLowerCase()
      for (const role of rolesForCard({ name, typeLine: c.typeLine, oracleText: c.oracleText })) {
        expect(ROLE_TEXT_NEEDLES[role].some((n) => text.includes(n)), `${name} (${role})`).toBe(true)
      }
    }
  })
})
