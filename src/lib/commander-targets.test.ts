import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseAverageDeck, parseCommanderPage, type EdhrecAverageDeck, type EdhrecCommanderPage } from './edhrec-client'
import {
  deriveEstimate,
  deriveFromAverageDeck,
  guideTargets,
  isRowFresh,
  rowFromAverage,
  rowFromEstimate,
  rowNotFound,
  sourceLabelFor,
  targetsFromRow,
  GUIDE_LABEL,
  type RefLookup,
} from './commander-targets'
import { CLASSIFIER_VERSION } from './card-roles'

const FIX = join(__dirname, '__fixtures__', 'edhrec')
const load = (f: string) => JSON.parse(readFileSync(join(FIX, f), 'utf8'))
const refJson = load('ref-card-text.json') as Record<string, { type_line: string | null; oracle_text: string | null } | null>
/** Card text saved from ref_cards for every card in the fixtures (14 names have none, as in the live table). */
const ref: RefLookup = (n) => (refJson[n] ? { typeLine: refJson[n]!.type_line, oracleText: refJson[n]!.oracle_text } : undefined)

const mendicantAvg = () => parseAverageDeck(load('average-deck-mendicant-core-guidelight.json'))
const partnerAvg = () => parseAverageDeck(load('average-deck-thrasios-tymna.json'))
const hearthhullAvg = () => parseAverageDeck(load('average-deck-hearthhull-the-worldseed.json'))
const mendicantPage = () => parseCommanderPage(load('commander-mendicant-core-guidelight.json'))
const sephPage = () => parseCommanderPage(load('commander-sephiroth-fabled-soldier.json'))
const NOW = new Date('2026-11-11T12:00:00Z')
const roleMap = (roles: Array<{ role: string; typical: number }>) => Object.fromEntries(roles.map((r) => [r.role, r.typical]))

describe('(A) average deck', () => {
  it('counts roles straight from the deck, no scaling (Mendicant Core: 12/13/3/1, 34 lands)', () => {
    const d = deriveFromAverageDeck(mendicantAvg(), ref)
    expect(d.qualifies).toBe(true)
    expect(d.total).toBe(100)
    expect(d.landCount).toBe(34)
    expect(roleMap(d.roles)).toEqual({ ramp: 12, draw: 13, removal: 3, wipes: 1 })
    // No scaling: the typical number is the count of cards in that role.
    for (const r of d.roles) expect(r.typical).toBe(r.cardsInRole)
  })

  it('sums quantities (20 Plains count as 20 lands)', () => {
    const deck: EdhrecAverageDeck = { commanders: ['C'], numDecks: 500, typeCounts: {}, basicCount: 20, cards: [{ name: 'Plains', quantity: 20, group: 'Basic Lands' }] }
    const d = deriveFromAverageDeck(deck, () => ({ typeLine: 'Basic Land — Plains', oracleText: '' }))
    expect(d.landCount).toBe(20)
  })

  it('leaves the commander out of the roles even when the file lists it', () => {
    const deck = mendicantAvg()
    deck.cards.push({ name: 'Mendicant Core, Guidelight', quantity: 1, group: 'Commander' })
    const d = deriveFromAverageDeck(deck, ref)
    expect(d.total).toBe(100)
    expect(d.cards.some((c) => c.name.startsWith('Mendicant Core'))).toBe(false)
  })

  it('lands are commander-specific: landfall Hearthhull 41, Mendicant 34', () => {
    expect(deriveFromAverageDeck(hearthhullAvg(), ref).landCount).toBe(41)
    expect(deriveFromAverageDeck(mendicantAvg(), ref).landCount).toBe(34)
  })

  it('A5: a partner deck that leaves out basics EDHREC counts gets them back (27 listed + 3 = 30)', () => {
    const d = deriveFromAverageDeck(partnerAvg(), ref)
    expect(d.unlistedBasics).toBe(3)
    expect(d.landCount).toBe(30)
    expect(d.total).toBe(100)
    expect(d.qualifies).toBe(true)
  })

  it('A5: a short list not explained by basics fails (total not 99 or 100)', () => {
    const deck = partnerAvg()
    deck.basicCount = 1
    const d = deriveFromAverageDeck(deck, ref)
    expect(d.unlistedBasics).toBe(0)
    expect(d.total).toBe(97)
    expect(d.qualifies).toBe(false)
    expect(d.reasons.join()).toContain('total 97')
  })

  it('A5: a deck sample under 50 fails', () => {
    const deck = mendicantAvg()
    deck.numDecks = 32
    const d = deriveFromAverageDeck(deck, ref)
    expect(d.qualifies).toBe(false)
    expect(d.reasons.join()).toContain('deck sample 32')
  })

  it('A5: more than 10% of non-land cards without card text fails', () => {
    const d = deriveFromAverageDeck(mendicantAvg(), (n) => (n.length % 3 === 0 ? undefined : ref(n)))
    expect(d.missing / d.nonLandCount).toBeGreaterThan(0.1)
    expect(d.qualifies).toBe(false)
  })
})

describe('(B) estimate', () => {
  it('scales the classified inclusion sums to the non-land slots (Mendicant Core)', () => {
    const e = deriveEstimate(mendicantPage(), ref)
    expect(e.status).toBe('ok')
    expect(e.landsAvg).toBe(34)
    expect(e.nonLandSlots).toBe(65)
    expect(e.scale).toBeCloseTo(65 / e.listedSum, 10)
    expect(e.coverage).toBeCloseTo(e.listedSum / 65, 10)
    for (const r of e.roles) expect(r.typical).toBe(Math.round(e.rawSums[r.role] * e.scale!))
    expect(roleMap(e.roles)).toEqual({ ramp: 13, draw: 12, removal: 2, wipes: 1 })
  })

  it('works on the double-faced commander (Sephiroth)', () => {
    const e = deriveEstimate(sephPage(), ref)
    expect(e.status).toBe('ok')
    expect(roleMap(e.roles)).toEqual({ ramp: 11, draw: 10, removal: 5, wipes: 2 })
  })

  it('uses the stored builds land average only when EDHREC gives none', () => {
    const page = mendicantPage()
    delete page.typeCounts.land
    expect(deriveEstimate(page, ref, 38).landsAvg).toBe(38)
    expect(deriveEstimate(page, ref, null).status).toBe('thin')
  })

  const thinCase = (mut: (p: EdhrecCommanderPage) => void, lookup: RefLookup = ref) => {
    const p = mendicantPage()
    mut(p)
    return deriveEstimate(p, lookup)
  }

  it('thin: deck sample under 50', () => {
    const e = thinCase((p) => { p.numDecks = 49 })
    expect(e.status).toBe('thin')
    expect(e.reasons).toHaveLength(1)
    expect(e.reasons[0]).toContain('deck sample 49')
  })

  it('thin: fewer than 60 classified cards', () => {
    const e = thinCase((p) => { p.cards = p.cards.sort((a, b) => b.inclusion - a.inclusion).slice(0, 59) })
    expect(e.status).toBe('thin')
    expect(e.reasons.some((r) => r.includes('classified'))).toBe(true)
  })

  it('thin: coverage under 0.4', () => {
    const e = thinCase((p) => { p.cards = p.cards.map((c) => ({ ...c, inclusion: c.inclusion / 3 })) })
    expect(e.status).toBe('thin')
    expect(e.reasons.some((r) => r.startsWith('coverage'))).toBe(true)
    expect(e.reasons).toHaveLength(1)
  })

  it('a thin estimate never stores role numbers', () => {
    const e = thinCase((p) => { p.numDecks = 10 })
    const row = rowFromEstimate('mendicant-core-guidelight', 'Mendicant Core, Guidelight', e, NOW)
    expect(row.status).toBe('thin')
    expect(row.roles).toEqual([])
    expect(row.lands_avg).toBeNull()
    const t = targetsFromRow(row, false)
    expect(t.source).toBe('general_guide')
    expect(t.sourceLabel).toBe(GUIDE_LABEL)
    expect(t.roles).toEqual([])
  })
})

describe('rows, freshness and labels', () => {
  const avgRow = () => rowFromAverage('mendicant-core-guidelight', 'Mendicant Core, Guidelight', deriveFromAverageDeck(mendicantAvg(), ref), NOW)

  it('an average-deck row answers with its numbers, lands and label', () => {
    const t = targetsFromRow(avgRow(), false)
    expect(t.status).toBe('ok')
    expect(t.source).toBe('edhrec_average')
    expect(t.sourceLabel).toBe('EDHREC average deck, 17,659 decks')
    expect(t.landsTypical).toBe(34)
    expect(roleMap(t.roles)).toEqual({ ramp: 12, draw: 13, removal: 3, wipes: 1 })
    expect(t.typeCountsLabel).toBe('EDHREC averages, 17,659 decks')
  })

  it('stale rows say "may be out of date"', () => {
    expect(targetsFromRow(avgRow(), true).sourceLabel).toBe('EDHREC average deck, 17,659 decks, may be out of date')
    expect(sourceLabelFor('edhrec_estimate', 1234, false)).toBe('EDHREC estimate, 1,234 decks')
  })

  it('ok rows keep 14 days; thin and not-found rows 7; a new role-rules version expires the row', () => {
    const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000)
    const ok = avgRow()
    expect(isRowFresh(ok, days(13.9))).toBe(true)
    expect(isRowFresh(ok, days(14.1))).toBe(false)
    const nf = rowNotFound('x', 'X', NOW)
    expect(isRowFresh(nf, days(6.9))).toBe(true)
    expect(isRowFresh(nf, days(7.1))).toBe(false)
    expect(isRowFresh({ ...ok, classifier_version: CLASSIFIER_VERSION + 1 }, NOW)).toBe(false)
  })

  it('the guide carries the stored builds type counts and label', () => {
    const g = guideTargets(GUIDE_LABEL, { typeCounts: [{ type: 'land', average: 37 }], label: 'Averages from 3 stored builds' })
    expect(g.source).toBe('general_guide')
    expect(g.typeCountsLabel).toBe('Averages from 3 stored builds')
  })
})
