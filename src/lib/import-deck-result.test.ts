import { describe, it, expect } from 'vitest'
import { buildDeckPlacement, computeDeckWarnings, parseDeckRpcAnswer, toDeckRpcRows } from './import-deck-result'
import { deckWarningLines } from './import-placement-text'
import type { ImportPlacementResult } from '../../docs/oracle/contracts/know-where-cards-are.types'

const answer = (filled: number, added: number, unsorted: Array<[number, string]>) => ({
  success: true,
  outcomes: [
    ...Array.from({ length: filled }, (_, i) => ({ index: i, copy_id: 100 + i, kind: 'filled', reason: null })),
    ...Array.from({ length: added }, (_, i) => ({ index: filled + i, copy_id: 100 + filled + i, kind: 'added', reason: null })),
    ...unsorted.map(([index, reason]) => ({ index, copy_id: 100 + index, kind: 'unsorted', reason })),
  ],
  counts: { filled, added, unsorted: unsorted.length, proxies_placed: 1 },
})

describe('toDeckRpcRows', () => {
  it('adds the name, printing, set and basic flag, and clears the location', () => {
    const rows = toDeckRpcRows([{ card_id: 1, location_id: 9 }], [{ cardName: 'Sol Ring', scryfallId: 's', setCode: 'c21', isBasicLand: false }])
    expect(rows[0]).toMatchObject({ card_id: 1, location_id: null, card_name: 'Sol Ring', scryfall_id: 's', set_code: 'c21', is_basic_land: false })
  })
  it('refuses rows and details that do not line up', () => {
    expect(() => toDeckRpcRows([{}], [])).toThrow()
  })
})

describe('parseDeckRpcAnswer', () => {
  it('accepts an answer whose three counts add up to the copies imported', () => {
    expect(parseDeckRpcAnswer(answer(2, 1, [[3, 'already_filled']]), 4).counts.filled).toBe(2)
  })
  it('throws when the counts do not add up, so nothing is silently dropped', () => {
    expect(() => parseDeckRpcAnswer(answer(2, 1, []), 4)).toThrow(/do not add up/)
  })
  it('throws when a copy id is missing', () => {
    const a = answer(1, 0, [])
    delete (a.outcomes[0] as { copy_id?: number }).copy_id
    expect(() => parseDeckRpcAnswer(a, 1)).toThrow(/copy ids/)
  })
  it('throws on an empty or failed answer', () => {
    expect(() => parseDeckRpcAnswer(null, 1)).toThrow()
    expect(() => parseDeckRpcAnswer({ success: false }, 1)).toThrow()
  })
})

describe('buildDeckPlacement', () => {
  it('counts add up and names the cards that went to Unsorted with a reason', () => {
    const names = ['A', 'B', 'C', 'D', 'E']
    const p = buildDeckPlacement({ deckId: 3, deckName: 'Korvold', answer: parseDeckRpcAnswer(answer(2, 1, [[3, 'already_filled'], [4, 'maybeboard_only']]), 5), names })
    expect(p.filledSlots! + p.addedAsNew! + p.sentToUnsorted!).toBe(p.total)
    expect(p.details).toEqual([
      { cardName: 'D', outcome: 'unsorted', reason: 'duplicate' },
      { cardName: 'E', outcome: 'unsorted', reason: 'in_maybeboard' },
    ])
    expect(p.unsortedReasons).toMatchObject({ duplicate: 1, in_maybeboard: 1, basic_land: 0, could_not_place: 0 })
    expect(p.proxies).toBe(1)
    expect(p.unsortedCopyIds).toEqual([103, 104])
    expect(p.unsortedCardNames).toEqual(['D', 'E'])
  })
  it('has an empty list when nothing went to Unsorted', () => {
    const p = buildDeckPlacement({ deckId: 3, deckName: 'K', answer: parseDeckRpcAnswer(answer(2, 1, []), 3), names: ['A', 'B', 'C'] })
    expect(p.unsortedCopyIds).toEqual([])
  })
})

describe('computeDeckWarnings', () => {
  const facts = new Map([
    ['Cultivate', { colours: ['G'], commanderLegal: true }],
    ['Lightning Bolt', { colours: ['R'], commanderLegal: true }],
    ['Banned Thing', { colours: [], commanderLegal: false }],
  ])
  const base = { deckFormat: 'commander', deckColours: 'RG', addedNames: ['Cultivate'], cardFacts: facts, mainCountAfter: 100 }

  it('no warnings when everything is inside the colours and legal', () => {
    const w = computeDeckWarnings(base)
    expect(w).toMatchObject({ outsideColours: [], notLegal: [], overTarget: false, checksUnavailable: false })
  })
  it('warns about an off-colour card but still reports it (it was added)', () => {
    const w = computeDeckWarnings({ ...base, deckColours: 'G', addedNames: ['Lightning Bolt'] })
    expect(w.outsideColours).toEqual(['Lightning Bolt'])
  })
  it('colourless cards are never off-colour', () => {
    const w = computeDeckWarnings({ ...base, deckColours: '', addedNames: ['Banned Thing'] })
    expect(w.outsideColours).toEqual([])
    expect(w.notLegal).toEqual(['Banned Thing'])
  })
  it('names the number when over 100', () => {
    const w = computeDeckWarnings({ ...base, mainCountAfter: 103 })
    expect(w.overTarget).toBe(true)
    expect(w.mainCountAfter).toBe(103)
  })
  it('says it could not check when the deck colours are unknown', () => {
    expect(computeDeckWarnings({ ...base, deckColours: null }).checksUnavailable).toBe(true)
  })
  it('says it could not check when the card data could not be read', () => {
    expect(computeDeckWarnings({ ...base, cardFacts: null }).checksUnavailable).toBe(true)
  })
  it('says it could not check when one card has no data', () => {
    expect(computeDeckWarnings({ ...base, addedNames: ['Mystery'] }).checksUnavailable).toBe(true)
  })
  it('adding nothing new gives no colour check and no over-size warning', () => {
    const w = computeDeckWarnings({ ...base, addedNames: [], mainCountAfter: 105 })
    expect(w).toMatchObject({ outsideColours: [], overTarget: false, checksUnavailable: false })
  })
})

describe('deckWarningLines', () => {
  const placement = (warnings: NonNullable<ImportPlacementResult['warnings']>): ImportPlacementResult => ({
    destination: { kind: 'deck' as const, id: 1, name: 'Korvold' },
    total: 1,
    warnings,
  })
  it('writes plain sentences, including "could not check"', () => {
    const lines = deckWarningLines(
      placement({ outsideColours: ['Cultivate'], notLegal: [], mainCountAfter: 103, targetCount: 100, overTarget: true, checksUnavailable: true })
    )
    expect(lines).toEqual([
      "Added anyway, but outside Korvold's colours: Cultivate.",
      'Korvold now lists 103 cards, 3 more than 100.',
      'Could not check colours or legality for Korvold. The cards were added.',
    ])
  })
  it('is empty for a box and when there is nothing to say', () => {
    expect(deckWarningLines({ destination: { kind: 'storage', id: 1, name: 'B' }, total: 1 })).toEqual([])
    expect(deckWarningLines(placement({ outsideColours: [], notLegal: [], mainCountAfter: 99, targetCount: 100, overTarget: false, checksUnavailable: false }))).toEqual([])
  })
})
