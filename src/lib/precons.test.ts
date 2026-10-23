import { describe, it, expect } from 'vitest'
import {
  buildStoredCards,
  commanderImageUrl,
  isPreconsNotSetUp,
  preconCardCount,
  preconCardsToCsv,
  preconCommanderName,
  preconFileName,
  sanitizePreconSearch,
} from './precons'
import { detectManaBoxFile, parseManaBoxCsv } from './manabox-import'

const deck = {
  commander: [{ name: 'Xira Arien', set_code: 'TD0', number: 'A110', foil: false, count: 1 }],
  cards: [
    { name: 'Sol Ring', set_code: 'c21', number: '263', foil: false, count: 1 },
    { name: 'Sol Ring', set_code: 'c21', number: '263', foil: false, count: 1 },
    { name: 'Swamp', set_code: 'c21', number: '350', foil: true, count: 8 },
    { name: 'Comma, "Quoted" Name', set_code: 'c21', number: '12', foil: false, count: 1 },
    { name: 'No number', set_code: 'c21', foil: false, count: 1 },
  ],
}

describe('buildStoredCards', () => {
  it('flags the commander, lower-cases sets, merges duplicates, drops entries with no printing', () => {
    const cards = buildStoredCards(deck)
    expect(cards[0]).toEqual({ name: 'Xira Arien', set_code: 'td0', number: 'A110', foil: false, count: 1, commander: true })
    expect(cards.find((c) => c.name === 'Sol Ring')?.count).toBe(2)
    expect(cards.find((c) => c.name === 'Swamp')?.foil).toBe(true)
    expect(cards.some((c) => c.name === 'No number')).toBe(false)
    expect(preconCardCount(cards)).toBe(1 + 2 + 8 + 1)
  })
  it('preselects the commander by name', () => {
    expect(preconCommanderName(buildStoredCards(deck), null)).toBe('Xira Arien')
    expect(preconCommanderName([], 'Fallback')).toBe('Fallback')
  })
})

describe('preconCardsToCsv', () => {
  it('is a ManaBox CSV the existing parser reads: exact set + number, finish and quantity kept', () => {
    const csv = preconCardsToCsv(buildStoredCards(deck))
    expect(detectManaBoxFile(csv)).toBe('csv')
    const parsed = parseManaBoxCsv(csv)
    expect(parsed.badRows ?? []).toHaveLength(0)
    const byName = (n: string) => parsed.records.find((r) => r.row.name === n)!.row
    expect(byName('Sol Ring')).toMatchObject({ setCode: 'c21', collectorNumber: '263', quantity: 2 })
    expect(byName('Swamp')).toMatchObject({ collectorNumber: '350', quantity: 8, finish: 'foil' })
    expect(byName('Comma, "Quoted" Name').quantity).toBe(1)
  })
})

describe('helpers', () => {
  it('builds a commander art url from a scryfall id', () => {
    expect(commanderImageUrl('abcdef')).toBe('https://cards.scryfall.io/art_crop/front/a/b/abcdef.jpg')
    expect(commanderImageUrl(null)).toBeNull()
  })
  it('recognises "not set up yet" database errors', () => {
    expect(isPreconsNotSetUp({ code: '42703' })).toBe(true)
    expect(isPreconsNotSetUp({ code: 'PGRST205' })).toBe(true)
    expect(isPreconsNotSetUp({ message: 'column ref_precons.cards does not exist' })).toBe(true)
    expect(isPreconsNotSetUp({ code: '500', message: 'boom' })).toBe(false)
    expect(isPreconsNotSetUp(null)).toBe(false)
  })
  it('cleans search text and file names', () => {
    expect(sanitizePreconSearch('a,b%(c)')).toBe('a b c')
    expect(preconFileName('Eldrazi: Unbound')).toBe('Eldrazi Unbound.csv')
    expect(preconFileName('')).toBe('Precon.csv')
  })
})
